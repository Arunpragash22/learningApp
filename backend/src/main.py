from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
from contextlib import asynccontextmanager
import os

from src.middleware.auth import AuthMiddleware
from src.database.connection import connect_to_mongo, close_mongo_connection

# -----------------------------------------------------
# LIFESPAN (startup / shutdown)
# -----------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()


# -----------------------------------------------------
# APP
# -----------------------------------------------------
app = FastAPI(
    title="Learning Platform API",
    version="1.0.0",
    description="Backend API for Learning Platform",
    lifespan=lifespan,
)


# -----------------------------------------------------
# CORS
# -----------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://zoomlearningapp.de",
        "https://www.zoomlearningapp.de",
        # any Vercel preview
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------------------
# AUTH MIDDLEWARE (skip for webhook)
# -----------------------------------------------------
auth_middleware = AuthMiddleware()

@app.middleware("http")
async def auth_middleware_wrapper(request: Request, call_next):
    path = request.url.path

    # ✅ Let Zoom call webhook without JWT / auth
    if path.startswith("/api/zoom/webhook"):
        return await call_next(request)

    # Handle CORS preflight
    if request.method == "OPTIONS":
        response = JSONResponse({"message": "preflight OK"})
        origin = request.headers.get("origin", "*")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        return response

    # Normal auth for everything else
    return await auth_middleware(request, call_next)


# -----------------------------------------------------
# LOGGING
# -----------------------------------------------------
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    print(f"{datetime.now().isoformat()} - {request.method} {request.url.path}")
    response = await call_next(request)
    return response


# -----------------------------------------------------
# SECURITY HEADERS (fine for webhook too)
# -----------------------------------------------------
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)

    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' https:; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; "
        "style-src 'self' 'unsafe-inline' https:; "
        "img-src 'self' data: https:; "
        "font-src 'self' data: https:; "
        "connect-src 'self' https:; "
        "frame-ancestors 'self' https://*.zoom.us;"
    )

    return response


# -----------------------------------------------------
# HEALTH + ROOT
# -----------------------------------------------------
@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/")
async def root():
    return {
        "message": "Learning Platform API",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
    }


# -----------------------------------------------------
# IMPORT & REGISTER ROUTERS
# -----------------------------------------------------
from src.routers import (
    auth,
    quiz,
    clustering,
    question,
    zoom_webhook,
    zoom_chatbot,
    course,
    live_question,
)

app.include_router(auth.router)
app.include_router(quiz.router)
app.include_router(clustering.router)
app.include_router(question.router)
app.include_router(zoom_webhook.router)
app.include_router(zoom_chatbot.router)
app.include_router(course.router)
app.include_router(live_question.router)


# -----------------------------------------------------
# ERROR HANDLING
# -----------------------------------------------------
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": "Route not found", "path": request.url.path},
    )


@app.exception_handler(Exception)
async def error_handler(request: Request, exc: Exception):
    print("❌ Internal error:", exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "message": str(exc)},
    )


# -----------------------------------------------------
# LOCAL DEV
# -----------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)
