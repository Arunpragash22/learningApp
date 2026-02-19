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

    # Load KMeans ML model (optional, non-blocking)
    try:
        from src.ml_models.kmeans_predictor import KMeansPredictor
        predictor = KMeansPredictor()
        predictor.load()
    except FileNotFoundError as e:
        print(f"⚠️  KMeans model not loaded: {e}")
        print("   Clustering will use default clusters until the model file is available.")
    except Exception as e:
        print(f"⚠️  KMeans model loading error: {e}")
    
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
    session_report,  # 📊 Session reports with download
    preprocessing,  # 📊 Preprocessing engagement data
    feedback,  # 🎯 Personalized student feedback (Model-2)
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
app.include_router(preprocessing.router)  # 📊 Preprocessing engagement data
app.include_router(feedback.router)  # 🎯 Personalized student feedback (Model-2)

from src.routers import profile
app.include_router(profile.router)

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
        # Start a grace period instead of removing immediately.
        # If the student reconnects within 60 seconds (e.g. network blip,
        # phone screen off), they stay in the session and keep receiving questions.
        ws_manager.start_disconnect_grace_period(session_id, student_id)
        print(f"👋 Student {student_id} WebSocket disconnected from session {session_id} "
              f"(grace period started — will be removed if no reconnect)")


# --------------------------------------------------------
# 🎯 GET SESSION STATS (For debugging)
# --------------------------------------------------------
@app.get("/ws/stats")
async def get_ws_stats():
    """Get WebSocket connection statistics"""
    return ws_manager.get_all_stats()


# --------------------------------------------------------
# 🎯 TRIGGER QUIZ TO SESSION (API endpoint)
# Two-phase cluster-aware delivery:
#   Phase 1 (no clusters): send instructor's chosen question to all
#   Phase 2 (clusters exist): per-student cluster-matched questions
# --------------------------------------------------------
@app.post("/ws/trigger-session/{session_id}")
async def trigger_quiz_to_session(session_id: str, request: Request):
    """
    Trigger quiz to ONLY students who have joined the session room.
    Phase 1 (before clustering): sends the instructor's selected question to all.
    Phase 2 (after clustering): picks a cluster-matched question per student.
    """
    import random
    from src.database.connection import get_database
    from bson import ObjectId
    from src.models.cluster_model import ClusterModel
    from src.models.question_assignment_model import QuestionAssignmentModel

    try:
        body = await request.json()
        question_data = body.get("question", {})
        db = get_database()

        # ── 1. Resolve session IDs ──────────────────────────────────
        session_ids = [session_id]
        session_doc = None
        if db:
            try:
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
                    if zoom_id and zoom_id not in session_ids:
                        session_ids.append(zoom_id)
                    if mongo_id and mongo_id not in session_ids:
                        session_ids.append(mongo_id)
            except Exception as resolve_err:
                print(f"⚠️ Trigger: could not resolve session id: {resolve_err}")

        # ── 2. Find participants across all room IDs ────────────────
        all_participants = {}  # student_id → {participant_info, room_id}
        for sid in session_ids:
            for p in ws_manager.get_session_participants(sid):
                student_id = p.get("studentId")
                if student_id and student_id not in all_participants:
                    all_participants[student_id] = {"info": p, "room_id": sid}

        if not all_participants:
            print(f"⚠️ Trigger: no participants in rooms {session_ids}")
            return {"success": False, "sentTo": 0, "message": "No students connected to this session."}

        # ── 3. Check for cluster data ───────────────────────────────
        student_cluster_map = {}
        try:
            for sid in session_ids:
                cmap = await ClusterModel.get_student_cluster_map(sid)
                if cmap:
                    student_cluster_map.update(cmap)
        except Exception as e:
            print(f"⚠️ Trigger: cluster lookup error: {e}")

        has_clustering = bool(student_cluster_map)

        # ── 4a. Phase 1: No clustering → broadcast instructor's question ──
        if not has_clustering:
            print(f"📋 Trigger Phase 1: No clusters → broadcasting to all {len(all_participants)} students")
            message = {
                "type": "quiz",
                "sessionId": session_id,
                "question": question_data.get("question", ""),
                "questionId": question_data.get("id", ""),
                "question_id": question_data.get("id", ""),
                "options": question_data.get("options", []),
                "timeLimit": question_data.get("timeLimit", 30),
                "category": question_data.get("category", "General"),
                "questionType": "generic",
                "triggeredAt": datetime.now().isoformat()
            }
            sent_count = 0
            q_id = question_data.get("id", "")
            for student_id, data in all_participants.items():
                msg = {**message, "sessionId": data["room_id"], "studentId": student_id}
                ok = await ws_manager.send_to_student_in_session(data["room_id"], student_id, msg)
                if ok:
                    sent_count += 1
                    if q_id:
                        try:
                            await QuestionAssignmentModel.create(data["room_id"], student_id, q_id, 0)
                        except Exception:
                            pass
            print(f"✅ Phase 1: Sent generic question to {sent_count}/{len(all_participants)} students")
            return {"success": True, "sessionId": session_id, "sentTo": sent_count,
                    "message": f"Generic question sent to {sent_count} students"}

        # ── 4b. Phase 2: Clustering exists → per-student question ───
        print(f"📋 Trigger Phase 2: Clusters exist → per-student delivery ({len(student_cluster_map)} mapped)")

        # Fetch all questions for this session
        all_questions = []
        for sid in session_ids:
            qs = await db.questions.find({"sessionId": sid}).to_list(length=None) if db else []
            all_questions.extend(qs)
        # Deduplicate by _id
        seen_ids = set()
        questions = []
        for q in all_questions:
            qid = str(q["_id"])
            if qid not in seen_ids:
                seen_ids.add(qid)
                questions.append(q)

        generic_qs = [q for q in questions if q.get("questionType", "generic") == "generic" or not q.get("questionType")]

        sent_count = 0
        for student_id, data in all_participants.items():
            student_cluster = student_cluster_map.get(student_id)
            room_id = data["room_id"]
            name = data["info"].get("studentName", student_id[:12])

            if student_cluster:
                cluster_qs = [
                    q for q in questions
                    if q.get("questionType") == "cluster"
                    and q.get("category", "").lower() == student_cluster
                ]
                eligible = cluster_qs if cluster_qs else generic_qs
            else:
                eligible = generic_qs if generic_qs else questions

            if not eligible:
                print(f"   ⚠️ No questions for {name} (cluster={student_cluster or 'none'}) — skipping")
                continue

            q = random.choice(eligible)
            opts = q.get("options") or []
            if not isinstance(opts, list):
                opts = list(opts) if opts else []
            opts = [str(o) for o in opts]

            msg = {
                "type": "quiz",
                "questionId": str(q["_id"]),
                "question_id": str(q["_id"]),
                "question": str(q.get("question", "")),
                "options": opts,
                "timeLimit": int(q.get("timeLimit", 30)),
                "category": q.get("category", "General"),
                "questionType": q.get("questionType", "generic"),
                "sessionId": room_id,
                "studentId": student_id,
                "triggeredAt": datetime.now().isoformat()
            }
            ok = await ws_manager.send_to_student_in_session(room_id, student_id, msg)
            if ok:
                sent_count += 1
                try:
                    await QuestionAssignmentModel.create(room_id, student_id, str(q["_id"]), 0)
                except Exception:
                    pass
                print(f"   ✅ {name} (cluster={student_cluster}) → [{q.get('questionType')}] {q.get('category', 'General')}")

        print(f"✅ Phase 2: Sent cluster-matched questions to {sent_count}/{len(all_participants)} students")
        return {"success": True, "sessionId": session_id, "sentTo": sent_count,
                "message": f"Cluster questions sent to {sent_count} students"}

    except Exception as e:
        print(f"❌ Error triggering quiz to session: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}