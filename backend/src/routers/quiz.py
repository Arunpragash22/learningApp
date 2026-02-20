from typing import Dict, Optional, List
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from pydantic import BaseModel
from ..services.quiz_service import QuizService
from ..services.ws_manager import ws_manager
from ..models.quiz_answer import QuizAnswer, NetworkStrength
from ..models.quiz_performance import QuizPerformance
from ..models.session_participant_model import SessionParticipantModel
from ..middleware.auth import get_current_user, require_instructor

router = APIRouter(prefix="/api/quiz", tags=["quiz"])
quiz_service = QuizService()


class SubmitAnswerRequest(BaseModel):
    questionId: str
    answerIndex: int
    timeTaken: float
    studentId: str
    sessionId: str
    networkStrength: Optional[NetworkStrength] = None  # Network quality at answer time


class TriggerQuestionRequest(BaseModel):
    questionId: str
    sessionId: str


class TriggerIndividualRequest(BaseModel):
    sessionId: str


class JoinSessionRequest(BaseModel):
    sessionId: str
    studentName: Optional[str] = None
    studentEmail: Optional[str] = None


class AssignmentResponse(BaseModel):
    active: bool
    assignmentId: Optional[str] = None
    question: Optional[Dict] = None
    completed: Optional[bool] = None
    notParticipant: Optional[bool] = None  # True if student hasn't joined session


@router.post("/submit")
async def submit_answer(
    request_data: SubmitAnswerRequest,
    request: Request,
    user: dict = Depends(get_current_user)
):
    """Submit quiz answer with network strength data"""
    try:
        answer = QuizAnswer(
            questionId=request_data.questionId,
            answerIndex=request_data.answerIndex,
            timeTaken=request_data.timeTaken,
            studentId=request_data.studentId,
            sessionId=request_data.sessionId,
            networkStrength=request_data.networkStrength,
        )

        result = await quiz_service.submit_answer(answer)

        # Push real-time feedback update via WebSocket (fire-and-forget)
        asyncio.create_task(
            _push_feedback_update(request_data.sessionId, request_data.studentId)
        )

        return result
    except Exception as e:
        print(f"Error submitting answer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


async def _push_feedback_update(session_id: str, student_id: str):
    """Generate updated feedback and push to student via WebSocket."""
    try:
        from ..services.feedback_service import get_student_feedback
        fb = await get_student_feedback(session_id, student_id)
        if not fb:
            return

        message = {
            "type": "feedback_update",
            "feedback": {
                "type": fb.get("type", "encouragement"),
                "message": fb.get("message", ""),
                "clusterContext": fb.get("clusterContext", ""),
                "suggestions": fb.get("suggestions", []),
                "cluster_label": fb.get("cluster_label", "Moderate"),
            },
            "stats": {
                "accuracy": fb.get("accuracy"),
                "totalAttempts": fb.get("totalAttempts", 0),
                "correctAnswers": fb.get("correctAnswers", 0),
                "responseTime": fb.get("medianResponseTime"),
                "cluster": fb.get("cluster_label", "Moderate"),
                "history": fb.get("history", []),
            },
        }

        sent = await ws_manager.send_to_student_in_session(session_id, student_id, message)
        if not sent:
            # Try alternate session IDs (Zoom ↔ MongoDB)
            from ..database.connection import get_database
            db = get_database()
            if db:
                alt_ids = []
                try:
                    from bson import ObjectId
                    if len(session_id) == 24:
                        doc = await db.sessions.find_one({"_id": ObjectId(session_id)}, {"zoomMeetingId": 1})
                        if doc and doc.get("zoomMeetingId"):
                            alt_ids.append(str(doc["zoomMeetingId"]))
                except Exception:
                    pass
                for variant in ([session_id] + ([int(session_id)] if session_id.isdigit() else [])):
                    doc = await db.sessions.find_one({"zoomMeetingId": variant}, {"_id": 1})
                    if doc:
                        alt_ids.append(str(doc["_id"]))
                for alt in alt_ids:
                    if alt != session_id:
                        sent = await ws_manager.send_to_student_in_session(alt, student_id, message)
                        if sent:
                            break
    except Exception as e:
        print(f"⚠️ Failed to push feedback_update: {e}")


@router.get("/performance/{question_id}")
async def get_performance(
    question_id: str,
    session_id: str = Query(..., alias="sessionId"),
    user: dict = Depends(get_current_user)
):
    """Get quiz performance (instructor only)"""
    try:
        if not question_id or not session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required parameters"
            )

        # Check if user is instructor (for development, allow all)
        if user.get("role") not in ["instructor", "admin"]:
            print("Warning: Non-instructor accessing performance data")

        performance = await quiz_service.get_performance(question_id, session_id)
        return performance
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        print(f"Error getting performance: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/trigger")
async def trigger_question(
    request_data: TriggerQuestionRequest,
    request: Request,
    user: dict = Depends(require_instructor)
):
    """Trigger question (instructor only)"""
    try:
        if not request_data.questionId or not request_data.sessionId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required fields"
            )

        result = await quiz_service.trigger_question(
            request_data.questionId,
            request_data.sessionId
        )
        return result
    except Exception as e:
        print(f"Error triggering question: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.post("/trigger/individual")
async def trigger_individual_questions(
    request_data: TriggerIndividualRequest,
    user: dict = Depends(require_instructor)
):
    """Trigger personalized questions (each student gets a unique question)"""
    try:
        if not request_data.sessionId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing sessionId"
            )

        result = await quiz_service.trigger_individual_questions(request_data.sessionId)
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error triggering individual questions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@router.get("/assignment", response_model=AssignmentResponse)
async def get_personalized_assignment(
    session_id: str = Query(..., alias="sessionId"),
    student_id: str = Query(..., alias="studentId"),
    user: dict = Depends(get_current_user)
):
    """Get or create personalized question assignment for a student"""
    try:
        if user.get("role") not in ["instructor", "admin"] and user.get("id") != student_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: cannot access other student's assignment"
            )

        assignment = await quiz_service.get_assignment_for_student(session_id, student_id)
        return assignment
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        print(f"Error retrieving assignment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


# ============ Session Participant Endpoints ============

@router.post("/session/join")
async def join_session(
    request_data: JoinSessionRequest,
    user: dict = Depends(get_current_user)
):
    """Student joins a session - must join before receiving quiz questions"""
    try:
        if not request_data.sessionId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing sessionId"
            )

        student_id = user.get("id")
        student_name = request_data.studentName or f"{user.get('firstName', '')} {user.get('lastName', '')}".strip()
        student_email = request_data.studentEmail or user.get("email")

        participant = await SessionParticipantModel.join_session(
            session_id=request_data.sessionId,
            student_id=student_id,
            student_name=student_name,
            student_email=student_email
        )

        return {
            "success": True,
            "message": "Successfully joined session",
            "participant": participant
        }
    except Exception as e:
        print(f"Error joining session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to join session"
        )


@router.post("/session/leave")
async def leave_session(
    request_data: JoinSessionRequest,
    user: dict = Depends(get_current_user)
):
    """Student leaves a session"""
    try:
        if not request_data.sessionId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing sessionId"
            )

        student_id = user.get("id")
        success = await SessionParticipantModel.leave_session(
            session_id=request_data.sessionId,
            student_id=student_id
        )

        return {
            "success": success,
            "message": "Left session" if success else "Not found in session"
        }
    except Exception as e:
        print(f"Error leaving session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to leave session"
        )


@router.get("/session/participants")
async def get_session_participants(
    session_id: str = Query(..., alias="sessionId"),
    user: dict = Depends(get_current_user)
):
    """Get list of participants in a session (instructor only)"""
    try:
        # Allow instructors and admins to view participants
        if user.get("role") not in ["instructor", "admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Forbidden: Instructor access required"
            )

        participants = await SessionParticipantModel.get_active_participants(session_id)
        count = len(participants)

        return {
            "success": True,
            "count": count,
            "participants": participants
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting participants: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get participants"
        )


@router.get("/session/participant-status")
async def check_participant_status(
    session_id: str = Query(..., alias="sessionId"),
    user: dict = Depends(get_current_user)
):
    """Check if current user is a participant in the session"""
    try:
        student_id = user.get("id")
        is_participant = await SessionParticipantModel.is_participant(session_id, student_id)

        return {
            "isParticipant": is_participant,
            "sessionId": session_id,
            "studentId": student_id
        }
    except Exception as e:
        print(f"Error checking participant status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check participant status"
        )


@router.get("/session-stats")
async def get_session_stats(
    session_id: str = Query(..., alias="sessionId"),
    user: dict = Depends(get_current_user)
):
    """
    Get cumulative session stats for the current student (dashboard rehydration).
    Returns questionsAnswered, correctAnswers, questionsReceived so the dashboard
    can restore state after refresh without resetting to zero.
    """
    try:
        student_id = user.get("id")
        if not student_id or not session_id:
            return {
                "questionsAnswered": 0,
                "correctAnswers": 0,
                "questionsReceived": 0,
                "answeredQuestionIds": [],
            }

        from ..models.quiz_answer_model import QuizAnswerModel
        stats = await QuizAnswerModel.get_student_session_stats(student_id, session_id)
        return stats
    except Exception as e:
        print(f"Error getting session stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

