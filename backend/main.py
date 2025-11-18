from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import os
from contextlib import asynccontextmanager
from src.routers import quiz, clustering, question
from src.middleware.auth import AuthMiddleware
from src.database.connection import connect_to_mongo, close_mongo_connection


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_to_mongo()
    yield
    # Shutdown
    await close_mongo_connection()


app = FastAPI(
    title="Learning Platform API",
    version="1.0.0",
    description="Backend API for Learning Platform",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:5174",
        "https://zoomlearningapp.de",
        "https://www.zoomlearningapp.de",
        "https://*.zoom.us",  # Allow Zoom domains
        "https://app.zoom.us",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication middleware
auth_middleware = AuthMiddleware()


@app.middleware("http")
async def auth_middleware_wrapper(request: Request, call_next):
    # Skip OPTIONS request (CORS preflight)
    if request.method == "OPTIONS":
        return JSONResponse(status_code=200, content={"message": "preflight OK"})
        
    return await auth_middleware(request, call_next)



# Logging middleware
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    print(f"{datetime.now().isoformat()} - {request.method} {request.url.path}")
    response = await call_next(request)
    return response


# Security headers middleware (required by Zoom)
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    
    # Add OWASP required headers for Zoom
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'self' https://*.zoom.us;"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    
    return response


# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "Server is running",
        "timestamp": datetime.now().isoformat()
    }


# Root route
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


# API Routes
from src.routers import auth, zoom_webhook, zoom_chatbot, course, live_question
app.include_router(auth.router)
app.include_router(quiz.router)
app.include_router(clustering.router)
app.include_router(question.router)
app.include_router(zoom_webhook.router)
app.include_router(zoom_chatbot.router)
app.include_router(course.router)
app.include_router(live_question.router)


# 404 handler
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


# Error handler
@app.exception_handler(Exception)
async def error_handler(request: Request, exc: Exception):
    print(f"Error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc),
        }
    )


if __name__ == "__main__":
    import uvicorn
    import sys
    # Set UTF-8 encoding for Windows console
    if sys.platform == "win32":
        import codecs
        sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
    
    port = int(os.getenv("PORT", 3001))
    print(f"\nServer running on http://localhost:{port}")
    print(f"Health check: http://localhost:{port}/health")
    print(f"API endpoints available at http://localhost:{port}/api")
    print(f"\nBackend is ready!\n")
    uvicorn.run(app, host="0.0.0.0", port=port)

