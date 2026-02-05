"""
Live Learning Router
Trigger questions → Sent ONLY to students who JOINED the session via WebSocket
🎯 Session-based delivery: Only students connected to /ws/session/<meetingId>/<studentId> receive quizzes
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from bson import ObjectId
from src.services.ws_manager import ws_manager
from src.services.push_service import push_service
from src.services.quiz_scheduler import quiz_scheduler
from src.database.connection import db
from src.middleware.auth import get_current_user, require_instructor
import random
from datetime import datetime

router = APIRouter(prefix="/api/live", tags=["Live Learning"])


# ================================================================
# 🎯 TRIGGER QUESTION (Only students who JOINED session receive quiz)
# ================================================================
@router.post("/trigger/{meeting_id}")
async def trigger_question(meeting_id: str):
    """
    Instructor triggers a question.
    A random question is selected from MongoDB and sent ONLY to students
    who have joined this specific session via WebSocket.
    
    🎯 Students must be connected to /ws/session/<meeting_id>/<student_id>
    """

    try:
        # First, find the session to get its MongoDB ID for filtering questions
        session_doc = None
        session_mongo_id = None
        
        # Try to find the session document
        if meeting_id.isdigit():
            try:
                session_doc = await db.database.sessions.find_one({"zoomMeetingId": int(meeting_id)})
            except:
                pass
        
        if not session_doc:
            session_doc = await db.database.sessions.find_one({"zoomMeetingId": meeting_id})
        
        if not session_doc:
            try:
                if len(meeting_id) == 24:
                    session_doc = await db.database.sessions.find_one({"_id": ObjectId(meeting_id)})
            except:
                pass
        
        if session_doc:
            session_mongo_id = str(session_doc["_id"])
        
        # 1) Fetch questions - first try session-specific, then fall back to instructor's questions
        questions = []
        
        # Try to get questions specific to this session
        if session_mongo_id:
            questions = await db.database.questions.find({"sessionId": session_mongo_id}).to_list(length=None)
            print(f"📝 Found {len(questions)} questions for session {session_mongo_id}")
        
        # If no session-specific questions, get instructor's general questions (without sessionId)
        if not questions and session_doc:
            instructor_id = session_doc.get("instructorId")
            if instructor_id:
                questions = await db.database.questions.find({
                    "instructorId": instructor_id,
                    "$or": [{"sessionId": None}, {"sessionId": {"$exists": False}}]
                }).to_list(length=None)
                print(f"📝 Found {len(questions)} general questions from instructor")
        
        # Final fallback: get all questions
        if not questions:
            questions = await db.database.questions.find({}).to_list(length=None)
            print(f"📝 Fallback: Found {len(questions)} total questions")

        if not questions:
            return {"success": False, "message": "No questions found for this session"}

        # 2) Get all participants in this session
        # Students might be connected using either zoomMeetingId or MongoDB sessionId
        # Check both to find all connected students
        participants = ws_manager.get_session_participants(meeting_id)
        session_ids_to_check = [meeting_id]
        effective_meeting_id = meeting_id
        
        # If no participants found with meeting_id, try to find the session and check both IDs
        if not participants:
            try:
                # Try to find the session document to get both IDs
                session_doc = None
                
                # Try as integer first (Zoom IDs are usually integers)
                if meeting_id.isdigit():
                    try:
                        session_doc = await db.database.sessions.find_one({"zoomMeetingId": int(meeting_id)})
                    except:
                        pass
                
                # Try as string
                if not session_doc:
                    session_doc = await db.database.sessions.find_one({"zoomMeetingId": meeting_id})
                
                # Try as MongoDB ObjectId
                if not session_doc:
                    try:
                        if len(meeting_id) == 24:
                            session_doc = await db.database.sessions.find_one({"_id": ObjectId(meeting_id)})
                    except:
                        pass
                
                if session_doc:
                    # Get both zoomMeetingId and MongoDB sessionId
                    zoom_id = str(session_doc.get("zoomMeetingId", "")) if session_doc.get("zoomMeetingId") else None
                    mongo_id = str(session_doc["_id"])
                    
                    # Add both IDs to check list
                    if zoom_id and zoom_id not in session_ids_to_check:
                        session_ids_to_check.append(zoom_id)
                    if mongo_id and mongo_id not in session_ids_to_check:
                        session_ids_to_check.append(mongo_id)
                    
                    # Get participants from all possible session IDs
                    participants = ws_manager.get_session_participants_by_multiple_ids(session_ids_to_check)
                    
                    if participants:
                        # Use the session ID that has the most participants
                        participant_counts = {}
                        for p in participants:
                            sid = p.get("sessionId", meeting_id)
                            participant_counts[sid] = participant_counts.get(sid, 0) + 1
                        
                        if participant_counts:
                            effective_meeting_id = max(participant_counts.items(), key=lambda x: x[1])[0]
                            print(f"📍 Found {len(participants)} participants across multiple session IDs")
                            print(f"   Using session ID: {effective_meeting_id} (has {participant_counts[effective_meeting_id]} participants)")
                    else:
                        print(f"⚠️ No participants found in any session room: {session_ids_to_check}")
            except Exception as lookup_error:
                print(f"⚠️ Error looking up session: {lookup_error}")
                import traceback
                traceback.print_exc()
        
        if not participants:
            return {"success": False, "message": "No students connected to this session. Make sure students have joined the meeting from the dashboard."}
        
        # Update meeting_id to the effective one for sending messages
        meeting_id = effective_meeting_id

        # Debug: Show session room stats before sending
        all_stats = ws_manager.get_all_stats()
        print(f"📊 WebSocket Stats BEFORE broadcast:")
        print(f"   Session rooms: {all_stats.get('session_rooms', {})}")
        print(f"   Target session: {meeting_id}")
        print(f"   Participants: {len(participants)} students")
        
        # 3) Send DIFFERENT random question to EACH student
        # All connected participants are students if they're in the session room
        # (Instructors don't connect to session rooms, they only trigger questions)
        student_participants = participants
        
        print(f"📊 Found {len(student_participants)} participants to send questions to")
        for p in student_participants:
            print(f"   - {p.get('studentName')} (ID: {p.get('studentId')})")
        
        if not student_participants:
            return {"success": False, "message": "No students found in session (only instructor connected)"}
        
        ws_sent_count = 0
        sent_questions = []
        
        # Send individual random question to each student
        # Use the session_id that each student is actually connected with (from participant data)
        for participant in student_participants:
            student_id = participant.get("studentId")
            # Get the session_id this student is connected with (could be zoomMeetingId or MongoDB sessionId)
            student_session_id = participant.get("sessionId", meeting_id)
            
            # Pick a random question for this student
            q = random.choice(questions)
            
            # Prepare individual message for this student
            message = {
                "type": "quiz",
                "questionId": str(q["_id"]),
                "question": q["question"],
                "options": q["options"],
                "timeLimit": q.get("timeLimit", 30),
                "difficulty": q.get("difficulty", "medium"),
                "category": q.get("category", "General"),
                "sessionId": student_session_id,
                "studentId": student_id,  # Include student ID so they know it's for them
                "timestamp": datetime.now().isoformat()
            }
            
            # Send to this student using their actual session_id
            sent = await ws_manager.send_to_student_in_session(student_session_id, student_id, message)
            
            # If failed, try with the effective meeting_id as fallback
            if not sent and student_session_id != meeting_id:
                sent = await ws_manager.send_to_student_in_session(meeting_id, student_id, message)
                if sent:
                    print(f"   ✅ Sent using fallback session_id: {meeting_id}")
            if sent:
                ws_sent_count += 1
                sent_questions.append({
                    "studentId": student_id,
                    "studentName": participant.get("studentName"),
                    "questionId": str(q["_id"]),
                    "question": q["question"]
                })
                print(f"   ✅ Sent question to {participant.get('studentName', student_id)}: {q['question'][:50]}...")

        print(f"✅ Questions sent to SESSION {meeting_id}: {ws_sent_count} students (each got a different random question)")
        print(f"   Participants: {[p.get('studentName', p.get('studentId', 'unknown')) for p in student_participants]}")

        # 5) Optionally send Web Push Notifications to subscribed students in this session
        # (For now, push is still global - can be made session-specific later)
        push_sent_count = 0
        try:
            push_sent_count = await push_service.send_quiz_notification(message)
            print(f"✅ Push notifications sent to {push_sent_count} students")
        except Exception as push_error:
            print(f"⚠️ Push notification error (non-fatal): {push_error}")

        return {
            "success": True,
            "sessionId": meeting_id,
            "websocketSent": ws_sent_count,
            "pushSent": push_sent_count,
            "totalReached": ws_sent_count + push_sent_count,
            "participants": student_participants,
            "sentQuestions": sent_questions,  # List of questions sent to each student
            "message": f"Quiz sent to {ws_sent_count} students in session {meeting_id} (each received a different random question)"
        }

    except Exception as e:
        print(f"❌ Error triggering question: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"Error: {str(e)}"
        }


# ================================================================
# 🎯 TRIGGER SAME QUESTION TO ALL (Instructor Dashboard one-click)
# Same question sent to all joined students via WebSocket broadcast.
# ================================================================
@router.post("/trigger-same/{meeting_id}")
async def trigger_same_question_to_all(meeting_id: str, user: dict = Depends(require_instructor)):
    """
    Instructor triggers one random question; it is sent to ALL students
    currently joined in the meeting (same question to everyone).
    Reliable delivery via WebSocket broadcast; works regardless of student page/tab.
    """
    try:
        # First, find the session to get its MongoDB ID for filtering questions
        session_doc = None
        session_mongo_id = None
        effective_meeting_id = meeting_id
        session_ids_to_check = [meeting_id]
        
        # Try to find the session document
        if meeting_id.isdigit():
            try:
                session_doc = await db.database.sessions.find_one({"zoomMeetingId": int(meeting_id)})
            except:
                pass
        
        if not session_doc:
            session_doc = await db.database.sessions.find_one({"zoomMeetingId": meeting_id})
        
        if not session_doc and len(meeting_id) == 24:
            try:
                session_doc = await db.database.sessions.find_one({"_id": ObjectId(meeting_id)})
            except:
                pass
        
        if session_doc:
            session_mongo_id = str(session_doc["_id"])
            zoom_id = str(session_doc.get("zoomMeetingId", "")) if session_doc.get("zoomMeetingId") is not None else None
            if zoom_id and zoom_id not in session_ids_to_check:
                session_ids_to_check.append(zoom_id)
            if session_mongo_id and session_mongo_id not in session_ids_to_check:
                session_ids_to_check.append(session_mongo_id)
        
        # Fetch questions - first try session-specific, then fall back to instructor's questions
        questions = []
        
        # Try to get questions specific to this session
        if session_mongo_id:
            questions = await db.database.questions.find({"sessionId": session_mongo_id}).to_list(length=None)
            print(f"📝 trigger-same: Found {len(questions)} questions for session {session_mongo_id}")
        
        # If no session-specific questions, get instructor's general questions (without sessionId)
        if not questions and session_doc:
            instructor_id = session_doc.get("instructorId")
            if instructor_id:
                questions = await db.database.questions.find({
                    "instructorId": instructor_id,
                    "$or": [{"sessionId": None}, {"sessionId": {"$exists": False}}]
                }).to_list(length=None)
                print(f"📝 trigger-same: Found {len(questions)} general questions from instructor")
        
        # Final fallback: get all questions
        if not questions:
            questions = await db.database.questions.find({}).to_list(length=None)
            print(f"📝 trigger-same: Fallback - Found {len(questions)} total questions")
        
        if not questions:
            return {"success": False, "message": "No questions found for this session"}

        participants = ws_manager.get_session_participants(meeting_id)

        if not participants:
            try:
                participants = ws_manager.get_session_participants_by_multiple_ids(session_ids_to_check)
                if participants:
                    participant_counts = {}
                    for p in participants:
                        sid = p.get("sessionId", meeting_id)
                        participant_counts[sid] = participant_counts.get(sid, 0) + 1
                    if participant_counts:
                        effective_meeting_id = max(participant_counts.items(), key=lambda x: x[1])[0]
            except Exception as lookup_error:
                print(f"⚠️ trigger-same: resolve error: {lookup_error}")

        if not participants:
            return {
                "success": False,
                "message": "No students connected to this session. Ask students to join the meeting first.",
                "sentTo": 0,
            }

        q = random.choice(questions)
        message = {
            "type": "quiz",
            "questionId": str(q["_id"]),
            "question_id": str(q["_id"]),
            "question": q["question"],
            "options": q.get("options", []),
            "timeLimit": q.get("timeLimit", 30),
            "sessionId": effective_meeting_id,
            "triggeredAt": datetime.now().isoformat(),
        }

        sent_count = await ws_manager.broadcast_to_session(effective_meeting_id, message)
        participants_list = ws_manager.get_session_participants(effective_meeting_id)

        return {
            "success": True,
            "sessionId": effective_meeting_id,
            "sentTo": sent_count,
            "participants": participants_list,
            "message": f"Question sent to {sent_count} student(s) in session",
        }
    except Exception as e:
        print(f"❌ Error trigger-same: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "message": str(e), "sentTo": 0}


# ================================================================
# ⭐ MEETING STATS (Optional – still works)
# ================================================================
@router.get("/stats/{meeting_id}")
async def get_meeting_stats(meeting_id: str):
    stats = ws_manager.get_meeting_stats(meeting_id)
    return {"success": True, "stats": stats}


# ================================================================
# ⭐ GLOBAL STATS (Optional)
# ================================================================
@router.get("/stats")
async def get_all_stats():
    stats = ws_manager.get_all_stats()
    return {"success": True, "stats": stats}


# ================================================================
# 📬 LATEST QUIZ (Student: fetch missed quiz when opening dashboard after push)
# ================================================================
@router.get("/latest-quiz/{session_id}")
async def get_latest_quiz_for_student(session_id: str, user: dict = Depends(get_current_user)):
    """
    If a quiz was sent to this session in the last 2 minutes, return it so the student
    can see the quiz popup (e.g. after clicking the push notification).
    Does not return a quiz the student has already answered (avoids duplicate on refresh).
    """
    student_id = user.get("id") or user.get("_id")
    if not student_id:
        return {"success": False, "quiz": None, "message": "User not found"}
    quiz = ws_manager.get_recent_quiz_for_student(session_id, str(student_id), max_age_seconds=120)
    if not quiz:
        return {"success": True, "quiz": None, "message": "No recent quiz"}
    question_id = quiz.get("questionId") or quiz.get("question_id")
    if question_id:
        from ..models.quiz_answer_model import QuizAnswerModel
        existing = await QuizAnswerModel.find_one_by_student_question_session(
            str(student_id), question_id, session_id
        )
        if existing is not None:
            return {"success": True, "quiz": None, "alreadyAnswered": True, "message": "Already answered"}
    return {"success": True, "quiz": quiz, "message": "Recent quiz found"}


# ================================================================
# 🤖 AUTOMATION CONTROL ENDPOINTS
# ================================================================

class AutomationConfigRequest(BaseModel):
    """Request body for updating automation configuration"""
    intervalSeconds: Optional[int] = None
    maxQuestions: Optional[int] = None
    enabled: Optional[bool] = None


@router.get("/automation/{session_id}")
async def get_automation_status(session_id: str, user: dict = Depends(require_instructor)):
    """
    Get current automation status for a session.
    Returns whether automation is active and current configuration.
    """
    status = quiz_scheduler.get_automation_status(session_id)
    return {"success": True, "automation": status}


@router.post("/automation/{session_id}/start")
async def start_automation(
    session_id: str,
    first_delay_seconds: int = 120,
    interval_seconds: int = 600,
    max_questions: Optional[int] = None,
    user: dict = Depends(require_instructor)
):
    """
    Start quiz automation for a session.
    
    Parameters:
    - first_delay_seconds: Seconds before first question (default: 120 = 2 minutes)
    - interval_seconds: Seconds between questions (default: 600 = 10 minutes)
    - max_questions: Maximum questions to auto-trigger (default: None = unlimited)
    """
    # Get session to find zoomMeetingId
    session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        return {"success": False, "message": "Session not found"}
    
    zoom_meeting_id = session.get("zoomMeetingId")
    
    result = await quiz_scheduler.start_automation(
        session_id=session_id,
        zoom_meeting_id=str(zoom_meeting_id) if zoom_meeting_id else None,
        first_delay_seconds=first_delay_seconds,
        interval_seconds=interval_seconds,
        max_questions=max_questions
    )
    return result


@router.post("/automation/{session_id}/stop")
async def stop_automation(session_id: str, user: dict = Depends(require_instructor)):
    """
    Stop quiz automation for a session.
    """
    result = await quiz_scheduler.stop_automation(session_id)
    return result


@router.put("/automation/{session_id}/config")
async def update_automation_config(
    session_id: str,
    request: AutomationConfigRequest,
    user: dict = Depends(require_instructor)
):
    """
    Update automation configuration for a running session.
    
    Can update:
    - intervalSeconds: Change interval between questions
    - maxQuestions: Change max questions limit
    - enabled: Enable/disable automation
    """
    result = await quiz_scheduler.update_config(
        session_id=session_id,
        interval_seconds=request.intervalSeconds,
        max_questions=request.maxQuestions,
        enabled=request.enabled
    )
    return result


@router.get("/automation/all")
async def get_all_automations(user: dict = Depends(require_instructor)):
    """
    Get all active automations across all sessions.
    Useful for admin monitoring.
    """
    automations = quiz_scheduler.get_all_active_sessions()
    return {"success": True, "automations": automations, "count": len(automations)}
