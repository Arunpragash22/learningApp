from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import os
from contextlib import asynccontextmanager

# Import routers
from src.routers import auth, quiz, clustering, question, zoom_webhook, zoom_chatbot, course, live_question

# Middleware & DB
from src.middleware.auth import AuthMiddleware
from src.database.connection import connect_to_mongo, close_mongo_connection


# -----------------------------------------------------
# LIFESPAN (Startup / Shutdown)
# -----------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()


# -----------------------------------------------------
# FASTAPI APP
# -----------------------------------------------------
app = FastAPI(
    title="Learning Platform API",
    version="1.0.0",
    description="Backend API for Learning Platform",
    lifespan=lifespan
)


# -----------------------------------------------------
# CORS CONFIG
# -----------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local dev
        "http://localhost:5173",
        "http://localhost:3000",

        # Production
        "https://zoomlearningapp.de",
        "https://www.zoomlearningapp.de",

        # Vercel builds (important!)
        "https://learning-app-alpha-one.vercel.app",
        "https://learning-lopy2je2b-arunpragashs-projects-baf0c862.vercel.app",
        "https://learning-pr8zfgjb7-arunpragashs-projects-baf0c862.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------------------
# AUTH MIDDLEWARE
# -----------------------------------------------------
auth_middleware = AuthMiddleware()

@app.middleware("http")
async def auth_middleware_wrapper(request: Request, call_next):
    if request.method == "OPTIONS":
        response = JSONResponse({"message": "preflight OK"})
        origin = request.headers.get("origin", "*")
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "*"
        return response

    return await auth_middleware(request, call_next)


# -----------------------------------------------------
# LOGGING MIDDLEWARE
# -----------------------------------------------------
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    print(f"{datetime.now().isoformat()} - {request.method} {request.url.path}")
    response = await call_next(request)
    return response


# -----------------------------------------------------
# SECURITY HEADERS (Zoom Requirement)
# -----------------------------------------------------
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)

    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    # VERY IMPORTANT FOR ZOOM WEBHOOK
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
# HEALTH CHECK
# -----------------------------------------------------
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "Server is running",
        "timestamp": datetime.now().isoformat()
    }


# -----------------------------------------------------
# ROOT
# -----------------------------------------------------
@app.get("/")
async def root():
    return {
        "message": "Learning Platform API",
        "version": "1.0.0",
        "domain": "zoomlearningapp.de",
        "timestamp": datetime.now().isoformat(),
        "endpoints": {
            "health": "/health",
            "auth": "/api/auth",
            "courses": "/api/courses",
            "questions": "/api/questions",
            "liveQuestions": "/api/live-questions",
            "quiz": "/api/quiz",
            "clustering": "/api/clustering",
            "zoomWebhook": "/api/zoom/webhook",
            "zoomChatbot": "/api/zoom/chatbot"
        }
    }


# -----------------------------------------------------
# REGISTER ALL ROUTERS — CORRECT ORDER
# -----------------------------------------------------

# Authentication
app.include_router(auth.router)

# Modules
app.include_router(quiz.router)
app.include_router(clustering.router)
app.include_router(question.router)

# Zoom Webhook (VERY IMPORTANT — this must be included!)
app.include_router(zoom_webhook.router)

# Zoom Chatbot
app.include_router(zoom_chatbot.router)

# Course and Live Questions
app.include_router(course.router)
app.include_router(live_question.router)


# -----------------------------------------------------
# 404 HANDLER
# -----------------------------------------------------
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "error": "Route not found",
            "path": request.url.path,
            "method": request.method,
            "availableEndpoints": {
                "health": "/health",
                "auth": "/api/auth",
                "courses": "/api/courses",
                "questions": "/api/questions",
                "liveQuestions": "/api/live-questions",
                "quiz": "/api/quiz",
                "clustering": "/api/clustering",
                "zoomWebhook": "/api/zoom/webhook",
                "zoomChatbot": "/api/zoom/chatbot"
            }
        }
    )


# -----------------------------------------------------
# ERROR HANDLER
# -----------------------------------------------------
@app.exception_handler(Exception)
async def error_handler(request: Request, exc: Exception):
    print(f"Error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "message": str(exc)}
    )


# -----------------------------------------------------
# LOCAL DEV SERVER
# -----------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)
