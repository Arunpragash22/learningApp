from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from contextlib import asynccontextmanager

from src.middleware.auth import AuthMiddleware
from src.database.connection import connect_to_mongo, close_mongo_connection
from src.database.mysql_connection import connect_to_mysql_backup, close_mysql_backup

# Correct WS manager
from src.services.ws_manager import ws_manager
from src.models.quiz_answer_model import QuizAnswerModel


# --------------------------------------------------------
# LIFESPAN
# --------------------------------------------------------
# HYBRID DATABASE ARCHITECTURE:
# - MongoDB: Primary database (SOURCE OF TRUTH)
# - MySQL: Backup database (READ-ONLY for auditing/reporting)
# --------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connect to MongoDB (primary - required)
    await connect_to_mongo()
    
    # Connect to MySQL (backup - optional, non-blocking)
    # If MySQL is unavailable, the app continues with MongoDB only
    await connect_to_mysql_backup()
    
    yield
    
    # Cleanup connections
    await close_mysql_backup()
    await close_mongo_connection()


app = FastAPI(lifespan=lifespan)


# --------------------------------------------------------
# CORS (Frontend + Zoom)
# --------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------
# AUTH MIDDLEWARE (skip Zoom webhook)
# --------------------------------------------------------
auth_middleware = AuthMiddleware()

@app.middleware("http")
async def auth_middleware_wrapper(request: Request, call_next):
    if request.url.path.startswith("/api/zoom/events"):
        return await call_next(request)
    return await auth_middleware(request, call_next)


# --------------------------------------------------------
# SECURITY HEADERS
# --------------------------------------------------------
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)

    if request.url.path.startswith("/api/zoom/events"):
        remove_headers = [
            "Strict-Transport-Security",
            "X-Content-Type-Options",
            "Referrer-Policy",
            "X-Frame-Options",
            "Permissions-Policy",
            "Content-Security-Policy"
        ]
        for h in remove_headers:
            if h in response.headers:
                del response.headers[h]
        return response

    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' https:; frame-ancestors 'self' https://*.zoom.us;"
    )

    return response


# --------------------------------------------------------
# IMPORT ROUTERS
# --------------------------------------------------------
from src.routers import (
    auth,
    quiz,
    clustering,
    question,
    zoom_webhook,
    zoom_chatbot,
    course,
    live_question,
    live,
    session,
    push_notification,  # ⭐ NEW ROUTER
    latency,  # 📶 WebRTC-aware latency monitoring
    session_report  # 📊 Session reports with download
)

app.include_router(auth.router)
app.include_router(quiz.router)
app.include_router(clustering.router)
app.include_router(question.router)
app.include_router(zoom_webhook.router)
app.include_router(zoom_chatbot.router)
app.include_router(course.router)
app.include_router(live_question.router)
app.include_router(live.router)
app.include_router(session.router)
app.include_router(push_notification.router)  # ⭐ ADD THIS
app.include_router(latency.router)  # 📶 WebRTC-aware latency monitoring
app.include_router(session_report.router)  # 📊 Session reports with download
app.include_router(session_report.reports_router)  # 📊 All reports API

# 📊 Role-based Reports
from src.routers import instructor_reports, student_reports
app.include_router(instructor_reports.router)  # 📊 Instructor reports (sessions, quiz, engagement)
app.include_router(student_reports.router)  # 📊 Student reports (personal data only)

# 🔄 MySQL Sync (MongoDB → MySQL backup)
from src.routers import mysql_sync
app.include_router(mysql_sync.router)  # 🔄 Sync MongoDB reports to MySQL


# --------------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------------
@app.get("/health")
async def health_check():
    from src.database.connection import get_database
    from src.database.mysql_connection import mysql_backup
    
    # Check MongoDB connection
    mongodb_status = "disconnected"
    try:
        db = get_database()
        if db is not None:
            # Try a simple operation to verify connection
            await db.command("ping")
            mongodb_status = "connected"
    except Exception as e:
        mongodb_status = f"error: {str(e)}"
    
    # Check MySQL backup connection
    mysql_status = "connected" if mysql_backup.is_connected else "disconnected"
    
    return {
        "status": "ok",
        "time": datetime.now().isoformat(),
        "database": {
            "mongodb": mongodb_status,
            "mysql_backup": mysql_status
        }
    }


# --------------------------------------------------------
# TEST GLOBAL WS
# --------------------------------------------------------
@app.get("/test-ws")
async def test_ws():
    message = {
        "type": "test_message",
        "title": "Hello from Backend 👋",
        "body": "If you see this in browser, WebSocket works!",
        "timestamp": datetime.now().isoformat()
    }
    sent = await ws_manager.broadcast_global(message)
    return {"success": True, "sent": sent}


# --------------------------------------------------------
# STUDENT GLOBAL WEBSOCKET
# --------------------------------------------------------
@app.websocket("/ws/global/{student_id}")
async def websocket_global(websocket: WebSocket, student_id: str):
    try:
        await ws_manager.connect_global(websocket)

        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        ws_manager.disconnect_global(websocket)


# --------------------------------------------------------
# 🎯 SESSION-BASED WEBSOCKET (Students join to receive quizzes)
# --------------------------------------------------------
@app.websocket("/ws/session/{session_id}/{student_id}")
async def websocket_session(
    websocket: WebSocket, 
    session_id: str, 
    student_id: str,
    student_name: str = None,
    student_email: str = None
):
    """
    WebSocket endpoint for students to join a session room.
    Only students connected to this room will receive quiz questions
    when the instructor triggers for this session.
    
    Query params:
      - student_name: Student's display name (for reports)
      - student_email: Student's email (for reports)
    """
    try:
        await websocket.accept()
        
        # Get query parameters from URL
        query_params = dict(websocket.query_params)
        print(f"📥 WebSocket query params: {query_params}")
        
        # Use query params if not provided as path params
        if not student_name or student_name == "None":
            student_name = query_params.get("student_name", f"Student {student_id[:8]}")
        if not student_email or student_email == "None":
            student_email = query_params.get("student_email", "")
        
        print(f"📥 WebSocket join: session={session_id}, student={student_id}, name={student_name}, email={student_email}")
        
        # Join the session room
        result = await ws_manager.join_session_room(
            websocket=websocket,
            session_id=session_id,
            student_id=student_id,
            student_name=student_name,
            student_email=student_email
        )
        
        # Send confirmation to student
        await websocket.send_json({
            "type": "session_joined",
            "sessionId": session_id,
            "studentId": student_id,
            "message": "Successfully joined session. You will receive quiz questions.",
            "participantCount": result.get("participantCount", 0),
            "timestamp": datetime.now().isoformat()
        })
        
        # 📬 If a quiz was sent in the last 2 minutes, send it now (catch-up for reconnecting students)
        # Skip re-sending if student already answered (avoids duplicate on reconnect)
        answered_ids = await QuizAnswerModel.get_answered_question_ids(student_id, session_id)
        await ws_manager.send_missed_quiz_if_any(
            session_id, student_id, websocket, answered_question_ids=set(answered_ids)
        )
        
        # Infinite receive loop: keep connection alive; only exit on disconnect
        while True:
            try:
                data = await websocket.receive_text()
            except WebSocketDisconnect:
                raise  # Re-raise so outer handler runs and we leave session room
            except Exception as e:
                print(f"Error in WebSocket receive: {e}")
                continue  # Stay in loop; do not close connection

            try:
                # Handle ping/pong for keepalive
                if data == "ping":
                    await websocket.send_text("pong")
                elif data.startswith("{"):
                    # Handle JSON messages (e.g., reconnection)
                    import json
                    try:
                        msg = json.loads(data)
                        if msg.get("type") == "reconnect":
                            # Re-register student in session room
                            result = await ws_manager.join_session_room(
                                websocket=websocket,
                                session_id=session_id,
                                student_id=student_id,
                                student_name=msg.get("studentName", student_name),
                                student_email=msg.get("studentEmail", student_email)
                            )
                            await websocket.send_json({
                                "type": "reconnected",
                                "sessionId": session_id,
                                "studentId": student_id,
                                "message": "Successfully reconnected to session",
                                "participantCount": result.get("participantCount", 0),
                                "timestamp": datetime.now().isoformat()
                            })
                            # 📬 Send any quiz they missed while disconnected (skip if already answered)
                            answered_ids = await QuizAnswerModel.get_answered_question_ids(student_id, session_id)
                            await ws_manager.send_missed_quiz_if_any(
                                session_id, student_id, websocket, answered_question_ids=set(answered_ids)
                            )
                    except Exception:
                        pass
            except WebSocketDisconnect:
                raise
            except Exception as e:
                print(f"Error in WebSocket message handling: {e}")
                # Continue loop; do not break – keep connection alive

    except WebSocketDisconnect:
        # Immediately mark student offline and remove from room so they receive no further questions
        await ws_manager.leave_session_room(session_id, student_id)
        ws_manager.remove_from_session_room(session_id, student_id)
        print(f"👋 Student {student_id} disconnected from session {session_id} (removed from room)")


# --------------------------------------------------------
# 🎯 GET SESSION STATS (For debugging)
# --------------------------------------------------------
@app.get("/ws/stats")
async def get_ws_stats():
    """Get WebSocket connection statistics"""
    return ws_manager.get_all_stats()


# --------------------------------------------------------
# 🎯 TRIGGER QUIZ TO SESSION (API endpoint)
# --------------------------------------------------------
@app.post("/ws/trigger-session/{session_id}")
async def trigger_quiz_to_session(session_id: str, request: Request):
    """
    Trigger quiz to ONLY students who have joined the session room.
    Reliably sends the same question to all joined students (any page/tab).
    Resolves session_id to the actual room key (zoom id or mongo id) so delivery works.
    """
    try:
        body = await request.json()
        question_data = body.get("question", {})
        
        message = {
            "type": "quiz",
            "sessionId": session_id,
            "question": question_data.get("question", ""),
            "questionId": question_data.get("id", ""),
            "question_id": question_data.get("id", ""),
            "options": question_data.get("options", []),
            "timeLimit": question_data.get("timeLimit", 30),
            "triggeredAt": datetime.now().isoformat()
        }
        
        # Resolve session_id to the room key that has participants (students may join with zoom id or mongo id)
        effective_session_id = session_id
        participants = ws_manager.get_session_participants(session_id)
        if not participants:
            try:
                from src.database.connection import get_database
                from bson import ObjectId
                db = get_database()
                if db and db.sessions:
                    session_doc = None
                    if session_id.isdigit():
                        session_doc = await db.sessions.find_one({"zoomMeetingId": int(session_id)})
                    if not session_doc:
                        session_doc = await db.sessions.find_one({"zoomMeetingId": session_id})
                    if not session_doc and len(session_id) == 24:
                        try:
                            session_doc = await db.sessions.find_one({"_id": ObjectId(session_id)})
                        except Exception:
                            pass
                    if session_doc:
                        zoom_id = str(session_doc.get("zoomMeetingId", "")) if session_doc.get("zoomMeetingId") is not None else None
                        mongo_id = str(session_doc["_id"])
                        for candidate in [zoom_id, mongo_id]:
                            if candidate and ws_manager.get_session_participant_count(candidate) > 0:
                                effective_session_id = candidate
                                participants = ws_manager.get_session_participants(candidate)
                                print(f"📍 Trigger: resolved session to room {effective_session_id} ({len(participants)} participants)")
                                break
            except Exception as resolve_err:
                print(f"⚠️ Trigger: could not resolve session id: {resolve_err}")
        
        # 🎯 Broadcast to session room (one trigger, all joined students receive)
        sent_count = await ws_manager.broadcast_to_session(effective_session_id, message)
        
        participants = ws_manager.get_session_participants(effective_session_id)
        
        return {
            "success": True,
            "sessionId": effective_session_id,
            "sentTo": sent_count,
            "participants": participants,
            "message": f"Quiz sent to {sent_count} students in session"
        }
        
    except Exception as e:
        print(f"❌ Error triggering quiz to session: {e}")
        return {"success": False, "error": str(e)}