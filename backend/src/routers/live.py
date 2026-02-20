"""
Live Learning Router
Trigger questions → Sent ONLY to students who JOINED the session via WebSocket
🎯 Session-based delivery: Only students connected to /ws/session/<meetingId>/<studentId> receive quizzes

Question delivery strategy:
  - Fallback: current session → previous session → general questions
  - Ordering: generic questions first, then cluster-specific questions
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Dict, List, Optional
from bson import ObjectId
from src.services.ws_manager import ws_manager
from src.services.push_service import push_service
from src.services.quiz_scheduler import quiz_scheduler
from src.database.connection import db
from src.middleware.auth import get_current_user, require_instructor
from src.models.cluster_model import ClusterModel
from src.models.question import Question
import random
from datetime import datetime

router = APIRouter(prefix="/api/live", tags=["Live Learning"])


def _get_eligible_questions(
    all_questions: list,
    student_cluster: Optional[str],
    has_clustering_data: bool = False,
) -> list:
    """
    Return the list of questions a student is eligible to receive.

    Phase 1 — BEFORE clustering:
      → ONLY generic questions

    Phase 2 — AFTER clustering:
      → ONLY questions whose category matches the student's cluster
      → Falls back to generic if no matching cluster questions exist
      → NEVER returns questions from a different cluster
    """
    generic = [
        q for q in all_questions
        if q.get("questionType", "generic") == "generic" or not q.get("questionType")
    ]

    if not has_clustering_data or not student_cluster:
        return generic if generic else all_questions

    cluster_matched = [
        q for q in all_questions
        if q.get("questionType") == "cluster"
        and q.get("category", "").lower() == student_cluster
    ]

    if cluster_matched:
        return cluster_matched

    return generic


def _pick_question_ordered(
    generic_pool: list,
    cluster_pool: list,
    sent_generic_ids: set,
    sent_cluster_ids: set,
) -> Optional[dict]:
    """
    Pick the next question following the ordering rule:
      1. First exhaust unsent generic questions
      2. Then send cluster-specific questions
    If all have been sent, reset and cycle again.
    """
    unsent_generic = [q for q in generic_pool if str(q["_id"]) not in sent_generic_ids]
    if unsent_generic:
        return random.choice(unsent_generic)

    unsent_cluster = [q for q in cluster_pool if str(q["_id"]) not in sent_cluster_ids]
    if unsent_cluster:
        return random.choice(unsent_cluster)

    # All questions sent — pick from any available pool
    combined = generic_pool + cluster_pool
    return random.choice(combined) if combined else None


# ================================================================
# 🎯 TRIGGER QUESTION (Only students who JOINED session receive quiz)
# Fallback: current session → previous session → general questions
# Ordering: generic first, then cluster-specific
# ================================================================
@router.post("/trigger/{meeting_id}")
async def trigger_question(meeting_id: str):
    """
    Instructor triggers a question.
    Questions are fetched with fallback (current session → previous session → general).
    Delivery order: generic questions first, then cluster-specific.
    Sent ONLY to students who joined this session via WebSocket.
    """

    try:
        session_doc = None
        session_mongo_id = None

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

        # 1) Fetch questions with fallback: current session → previous session → general
        instructor_id = session_doc.get("instructorId") if session_doc else None
        course_id = session_doc.get("courseId") if session_doc else None

        if session_mongo_id:
            questions, q_source = await Question.find_for_session_with_fallback(
                session_mongo_id, instructor_id, course_id
            )
        else:
            questions = await db.database.questions.find({}).to_list(length=None)
            q_source = "all_fallback"

        print(f"📝 Trigger: {len(questions)} questions loaded (source: {q_source})")

        if not questions:
            return {"success": False, "message": "No questions found for this session"}

        generic_qs, cluster_qs = Question.split_generic_and_cluster(questions)
        print(f"   Generic: {len(generic_qs)} | Cluster-specific: {len(cluster_qs)}")

        # 2) Get all participants in this session
        participants = ws_manager.get_session_participants(meeting_id)
        session_ids_to_check = [meeting_id]
        effective_meeting_id = meeting_id

        if not participants:
            try:
                if session_doc:
                    zoom_id = str(session_doc.get("zoomMeetingId", "")) if session_doc.get("zoomMeetingId") else None
                    mongo_id = str(session_doc["_id"])
                    if zoom_id and zoom_id not in session_ids_to_check:
                        session_ids_to_check.append(zoom_id)
                    if mongo_id and mongo_id not in session_ids_to_check:
                        session_ids_to_check.append(mongo_id)
                    participants = ws_manager.get_session_participants_by_multiple_ids(session_ids_to_check)
                    if participants:
                        participant_counts = {}
                        for p in participants:
                            sid = p.get("sessionId", meeting_id)
                            participant_counts[sid] = participant_counts.get(sid, 0) + 1
                        if participant_counts:
                            effective_meeting_id = max(participant_counts.items(), key=lambda x: x[1])[0]
            except Exception as lookup_error:
                print(f"⚠️ Error looking up session: {lookup_error}")

        if not participants:
            return {"success": False, "message": "No students connected to this session. Make sure students have joined the meeting from the dashboard."}

        meeting_id = effective_meeting_id
        student_participants = participants

        if not student_participants:
            return {"success": False, "message": "No students found in session (only instructor connected)"}

        # 3) Build student → cluster mapping
        student_cluster_map: Dict[str, str] = {}
        try:
            for sid in session_ids_to_check:
                cluster_map = await ClusterModel.get_student_cluster_map(sid)
                if cluster_map:
                    student_cluster_map.update(cluster_map)
            if session_mongo_id and session_mongo_id not in session_ids_to_check:
                extra_map = await ClusterModel.get_student_cluster_map(session_mongo_id)
                if extra_map:
                    student_cluster_map.update(extra_map)
        except Exception as cluster_err:
            print(f"⚠️ Could not load cluster data (non-fatal): {cluster_err}")

        has_clustering = bool(student_cluster_map)

        # 4) Send questions: generic first, then cluster-specific
        ws_sent_count = 0
        sent_questions = []
        sent_generic_ids: set = set()
        sent_cluster_ids: set = set()

        for participant in student_participants:
            student_id = participant.get("studentId")
            student_session_id = participant.get("sessionId", meeting_id)
            student_cluster = student_cluster_map.get(student_id)

            if has_clustering and student_cluster:
                student_cluster_qs = [
                    q for q in cluster_qs
                    if q.get("category", "").lower() == student_cluster
                ]
            else:
                student_cluster_qs = []

            q = _pick_question_ordered(generic_qs, student_cluster_qs, sent_generic_ids, sent_cluster_ids)

            if not q:
                print(f"   ⚠️ No questions available for {participant.get('studentName', student_id)}")
                continue

            qid = str(q["_id"])
            if q.get("questionType") == "cluster":
                sent_cluster_ids.add(qid)
            else:
                sent_generic_ids.add(qid)

            print(f"   🎲 {participant.get('studentName', student_id)} (cluster={student_cluster or 'none'}) → "
                  f"[{q.get('questionType', 'generic')}] {q.get('question', '')[:50]}...")

            message = {
                "type": "quiz",
                "questionId": qid,
                "question": q["question"],
                "options": q.get("options", []),
                "timeLimit": q.get("timeLimit", 30),
                "category": q.get("category", "General"),
                "questionType": q.get("questionType", "generic"),
                "sessionId": student_session_id,
                "studentId": student_id,
                "questionSource": q_source,
                "timestamp": datetime.now().isoformat()
            }

            sent = await ws_manager.send_to_student_in_session(student_session_id, student_id, message)
            if not sent and student_session_id != meeting_id:
                sent = await ws_manager.send_to_student_in_session(meeting_id, student_id, message)
            if sent:
                ws_sent_count += 1
                sent_questions.append({
                    "studentId": student_id,
                    "studentName": participant.get("studentName"),
                    "questionId": qid,
                    "question": q["question"],
                    "questionType": q.get("questionType", "generic"),
                })

        push_sent_count = 0
        try:
            if sent_questions:
                push_sent_count = await push_service.send_quiz_notification(message)
        except Exception as push_error:
            print(f"⚠️ Push notification error (non-fatal): {push_error}")

        return {
            "success": True,
            "sessionId": meeting_id,
            "websocketSent": ws_sent_count,
            "pushSent": push_sent_count,
            "totalReached": ws_sent_count + push_sent_count,
            "participants": student_participants,
            "sentQuestions": sent_questions,
            "questionSource": q_source,
            "message": f"Quiz sent to {ws_sent_count} students (source: {q_source}, generic first then cluster)"
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
# Fallback: current session → previous session → general questions
# Ordering: generic first, then cluster-specific
# ================================================================
@router.post("/trigger-same/{meeting_id}")
async def trigger_same_question_to_all(meeting_id: str, user: dict = Depends(require_instructor)):
    """
    Instructor triggers questions with fallback (current → previous session → general).
    Generic questions are sent first; cluster-specific questions follow.
    """
    try:
        session_doc = None
        session_mongo_id = None
        effective_meeting_id = meeting_id
        session_ids_to_check = [meeting_id]

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

        # Fetch questions with fallback
        instructor_id = session_doc.get("instructorId") if session_doc else None
        course_id = session_doc.get("courseId") if session_doc else None

        if session_mongo_id:
            questions, q_source = await Question.find_for_session_with_fallback(
                session_mongo_id, instructor_id, course_id
            )
        else:
            questions = await db.database.questions.find({}).to_list(length=None)
            q_source = "all_fallback"

        print(f"📝 trigger-same: {len(questions)} questions (source: {q_source})")

        if not questions:
            return {"success": False, "message": "No questions found for this session", "sentTo": 0}

        generic_qs, cluster_qs = Question.split_generic_and_cluster(questions)
        print(f"   Generic: {len(generic_qs)} | Cluster-specific: {len(cluster_qs)}")

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

        # Build cluster mapping
        student_cluster_map: Dict[str, str] = {}
        try:
            for sid in session_ids_to_check:
                cluster_map = await ClusterModel.get_student_cluster_map(sid)
                if cluster_map:
                    student_cluster_map.update(cluster_map)
            if session_mongo_id and session_mongo_id not in session_ids_to_check:
                extra_map = await ClusterModel.get_student_cluster_map(session_mongo_id)
                if extra_map:
                    student_cluster_map.update(extra_map)
        except Exception as cluster_err:
            print(f"⚠️ trigger-same: Could not load clusters (non-fatal): {cluster_err}")

        has_clustering = bool(student_cluster_map)

        # Send questions: generic first, then cluster-specific
        ws_sent_count = 0
        sent_generic_ids: set = set()
        sent_cluster_ids: set = set()

        for participant in participants:
            student_id = participant.get("studentId")
            student_session_id = participant.get("sessionId", effective_meeting_id)
            student_cluster = student_cluster_map.get(student_id)

            if has_clustering and student_cluster:
                student_cluster_qs = [
                    q for q in cluster_qs
                    if q.get("category", "").lower() == student_cluster
                ]
            else:
                student_cluster_qs = []

            q = _pick_question_ordered(generic_qs, student_cluster_qs, sent_generic_ids, sent_cluster_ids)
            if not q:
                continue

            qid = str(q["_id"])
            if q.get("questionType") == "cluster":
                sent_cluster_ids.add(qid)
            else:
                sent_generic_ids.add(qid)

            message = {
                "type": "quiz",
                "questionId": qid,
                "question_id": qid,
                "question": q["question"],
                "options": q.get("options", []),
                "timeLimit": q.get("timeLimit", 30),
                "questionType": q.get("questionType", "generic"),
                "sessionId": student_session_id,
                "studentId": student_id,
                "questionSource": q_source,
                "triggeredAt": datetime.now().isoformat(),
            }

            sent = await ws_manager.send_to_student_in_session(student_session_id, student_id, message)
            if not sent and student_session_id != effective_meeting_id:
                sent = await ws_manager.send_to_student_in_session(effective_meeting_id, student_id, message)
            if sent:
                ws_sent_count += 1
                print(f"   ✅ {participant.get('studentName', student_id)} "
                      f"(cluster={student_cluster or 'none'}) → [{q.get('questionType', 'generic')}]")

        participants_list = ws_manager.get_session_participants(effective_meeting_id)
        return {
            "success": True,
            "sessionId": effective_meeting_id,
            "sentTo": ws_sent_count,
            "participants": participants_list,
            "questionSource": q_source,
            "message": f"Questions sent to {ws_sent_count} student(s) (source: {q_source}, generic first then cluster)",
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
