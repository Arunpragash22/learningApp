from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from ..models.live_question_session import LiveQuestionSessionModel
from ..models.question_response import QuestionResponseModel
from ..models.question import Question
from ..middleware.auth import get_current_user, require_instructor
from ..services.zoom_chat_service import ZoomChatService
import random
import os


router = APIRouter(prefix="/api/live-questions", tags=["live-questions"])
zoom_chat_service = ZoomChatService()


class TriggerQuestionRequest(BaseModel):
    questionId: Optional[str] = None  # If None, pick random
    zoomMeetingId: str
    courseId: Optional[str] = None
    timeLimit: Optional[int] = 30
    sendToZoom: Optional[bool] = True  # Whether to send to Zoom chat


class SubmitAnswerRequest(BaseModel):
    selectedAnswer: int
    responseTime: float  # Time taken in seconds
    studentName: Optional[str] = None
    studentEmail: Optional[str] = None
    studentId: Optional[str] = None


@router.post("/trigger")
async def trigger_question(
    request_data: TriggerQuestionRequest,
    current_user: dict = Depends(require_instructor)
):
    """
    Trigger a question in a Zoom meeting
    - Picks a question (random or specified)
    - Creates a unique session
    - Generates URL
    - Sends to Zoom chat
    """
    try:
        from bson import ObjectId
        from ..database.connection import db
        
        # Find the session to get its MongoDB ID for filtering questions
        session_doc = None
        session_mongo_id = None
        zoom_meeting_id = request_data.zoomMeetingId
        
        # Try to find the session document by zoom meeting ID
        if zoom_meeting_id.isdigit():
            try:
                session_doc = await db.database.sessions.find_one({"zoomMeetingId": int(zoom_meeting_id)})
            except:
                pass
        
        if not session_doc:
            session_doc = await db.database.sessions.find_one({"zoomMeetingId": zoom_meeting_id})
        
        if not session_doc and len(zoom_meeting_id) == 24:
            try:
                session_doc = await db.database.sessions.find_one({"_id": ObjectId(zoom_meeting_id)})
            except:
                pass
        
        if session_doc:
            session_mongo_id = str(session_doc["_id"])
        
        # Get the question
        if request_data.questionId:
            question = await Question.find_by_id(request_data.questionId)
            if not question:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Question not found"
                )
        else:
            # Pick random question - prioritize session-specific questions
            questions = []
            
            # Try to get questions specific to this session
            if session_mongo_id:
                questions = await Question.find_by_session(session_mongo_id, current_user["id"])
                print(f"📝 live-questions trigger: Found {len(questions)} questions for session {session_mongo_id}")
            
            # Fallback to instructor's questions without sessionId
            if not questions:
                questions = await Question.find_by_instructor(
                    current_user["id"],
                    session_id=None  # Get questions without sessionId
                )
                # Filter to only questions without sessionId
                questions = [q for q in questions if not q.get("sessionId")]
                print(f"📝 live-questions trigger: Found {len(questions)} general questions from instructor")
            
            # Final fallback: get all questions
            if not questions:
                questions = await Question.find_all()
                print(f"📝 live-questions trigger: Fallback - Found {len(questions)} total questions")
            
            if not questions:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No questions available for this session"
                )
            question = random.choice(questions)
        
        # Calculate expiry time
        time_limit = request_data.timeLimit or 30
        triggered_at = datetime.now()
        expires_at = triggered_at + timedelta(seconds=time_limit + 300)  # Extra 5 min buffer
        
        # Create live session
        session_data = {
            "questionId": question["id"],
            "question": question["question"],
            "options": question["options"],
            "correctAnswer": question["correctAnswer"],
            "instructorId": current_user["id"],
            "instructorName": f"{current_user.get('firstName', '')} {current_user.get('lastName', '')}",
            "zoomMeetingId": request_data.zoomMeetingId,
            "courseId": request_data.courseId,
            "timeLimit": time_limit,
            "triggeredAt": triggered_at,
            "expiresAt": expires_at,
            "status": "active"
        }
        
        session = await LiveQuestionSessionModel.create(session_data)
        
        # Generate URL
        base_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        question_url = f"{base_url}/question/{session['sessionToken']}"
        
        # 🔔 Send real-time notification to all connected students
        from ..services.ws_manager import ws_manager
        
        # Prepare notification message
        notification_message = {
            "type": "quiz",
            "question": question["question"],
            "options": question["options"],
            "sessionToken": session['sessionToken'],
            "questionUrl": question_url,
            "instructorName": f"{current_user.get('firstName', '')} {current_user.get('lastName', '')}",
            "timeLimit": time_limit,
            "triggeredAt": triggered_at.isoformat(),
            "timestamp": datetime.now().isoformat()
        }
        
        notification_count = await ws_manager.broadcast_to_meeting(
            meeting_id=request_data.zoomMeetingId,
            message=notification_message
        )
        print(f"✅ Sent notifications to {notification_count} students")
        
        # Send to Zoom chat if requested
        zoom_sent = False
        if request_data.sendToZoom:
            zoom_sent = zoom_chat_service.send_question_link(
                meeting_id=request_data.zoomMeetingId,
                question_text=question["question"],
                question_url=question_url,
                time_limit=time_limit
            )
        
        # Convert datetime objects for response
        if "triggeredAt" in session and hasattr(session["triggeredAt"], "isoformat"):
            session["triggeredAt"] = session["triggeredAt"].isoformat()
        if "expiresAt" in session and hasattr(session["expiresAt"], "isoformat"):
            session["expiresAt"] = session["expiresAt"].isoformat()
        if "createdAt" in session and hasattr(session["createdAt"], "isoformat"):
            session["createdAt"] = session["createdAt"].isoformat()
        if "updatedAt" in session and hasattr(session["updatedAt"], "isoformat"):
            session["updatedAt"] = session["updatedAt"].isoformat()
        
        return {
            "success": True,
            "message": "Question triggered successfully",
            "session": session,
            "questionUrl": question_url,
            "zoomMessageSent": zoom_sent,
            "notificationsSent": notification_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error triggering question: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger question: {str(e)}"
        )


@router.get("/session/{token}")
async def get_question_by_token(token: str):
    """
    Get question details by session token (for students)
    - Public endpoint (no auth required)
    - Students click link from Zoom chat
    """
    try:
        session = await LiveQuestionSessionModel.find_by_token(token)
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question session not found"
            )
        
        # Check if session is still active
        if session["status"] != "active":
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail=f"This question session has {session['status']}"
            )
        
        # Check if expired
        expires_at = session.get("expiresAt")
        if expires_at and isinstance(expires_at, datetime) and expires_at < datetime.now():
            # Mark as expired
            await LiveQuestionSessionModel.update(session["id"], {"status": "expired"})
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="This question session has expired"
            )
        
        # Return question without correct answer
        response_data = {
            "sessionToken": session["sessionToken"],
            "sessionId": session["id"],
            "question": session["question"],
            "options": session["options"],
            "timeLimit": session["timeLimit"],
            "triggeredAt": session["triggeredAt"].isoformat() if hasattr(session.get("triggeredAt"), "isoformat") else session.get("triggeredAt"),
            "expiresAt": session["expiresAt"].isoformat() if hasattr(session.get("expiresAt"), "isoformat") else session.get("expiresAt")
        }
        
        return {
            "success": True,
            "question": response_data
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting question: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get question"
        )


@router.post("/submit/{token}")
async def submit_answer(
    token: str,
    request: Request,
    answer_data: SubmitAnswerRequest
):
    """
    Submit answer to a question
    - Public endpoint (no auth required)
    - Records response time
    - Checks if correct
    - Prevents duplicate submissions
    """
    try:
        # Get session
        session = await LiveQuestionSessionModel.find_by_token(token)
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question session not found"
            )
        
        # Check if session is still active
        if session["status"] != "active":
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail=f"This question session is {session['status']}"
            )
        
        # Check for duplicate submission
        student_identifier = (
            answer_data.studentId or 
            answer_data.studentEmail or 
            answer_data.studentName or 
            request.client.host
        )
        
        existing_response = await QuestionResponseModel.find_by_student_and_session(
            student_identifier,
            session["id"]
        )
        
        if existing_response:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already submitted an answer to this question"
            )
        
        # Check if answer is correct
        is_correct = answer_data.selectedAnswer == session["correctAnswer"]
        
        # Create response record
        response_data = {
            "sessionId": session["id"],
            "sessionToken": token,
            "questionId": session["questionId"],
            "studentId": answer_data.studentId,
            "studentName": answer_data.studentName or "Anonymous",
            "studentEmail": answer_data.studentEmail,
            "selectedAnswer": answer_data.selectedAnswer,
            "isCorrect": is_correct,
            "responseTime": answer_data.responseTime,
            "submittedAt": datetime.now(),
            "ipAddress": request.client.host
        }
        
        response = await QuestionResponseModel.create(response_data)
        
        # Update session stats
        await LiveQuestionSessionModel.add_response(
            session["id"],
            response["id"],
            is_correct
        )
        
        # Convert datetime for response
        if "submittedAt" in response and hasattr(response["submittedAt"], "isoformat"):
            response["submittedAt"] = response["submittedAt"].isoformat()
        if "createdAt" in response and hasattr(response["createdAt"], "isoformat"):
            response["createdAt"] = response["createdAt"].isoformat()
        
        return {
            "success": True,
            "message": "Answer submitted successfully",
            "isCorrect": is_correct,
            "correctAnswer": session["correctAnswer"],
            "responseTime": answer_data.responseTime,
            "response": response
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error submitting answer: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to submit answer"
        )


@router.get("/dashboard/active")
async def get_active_sessions(current_user: dict = Depends(require_instructor)):
    """Get all active sessions for instructor dashboard"""
    try:
        sessions = await LiveQuestionSessionModel.find_active_sessions(current_user["id"])
        
        # Convert datetime objects
        for session in sessions:
            if "triggeredAt" in session and hasattr(session["triggeredAt"], "isoformat"):
                session["triggeredAt"] = session["triggeredAt"].isoformat()
            if "expiresAt" in session and hasattr(session["expiresAt"], "isoformat"):
                session["expiresAt"] = session["expiresAt"].isoformat()
            if "createdAt" in session and hasattr(session["createdAt"], "isoformat"):
                session["createdAt"] = session["createdAt"].isoformat()
            if "updatedAt" in session and hasattr(session["updatedAt"], "isoformat"):
                session["updatedAt"] = session["updatedAt"].isoformat()
        
        return {
            "success": True,
            "count": len(sessions),
            "sessions": sessions
        }
    except Exception as e:
        print(f"Error getting active sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get active sessions"
        )


@router.get("/dashboard/session/{session_id}/responses")
async def get_session_responses(
    session_id: str,
    current_user: dict = Depends(require_instructor)
):
    """Get live responses for a session"""
    try:
        # Verify session belongs to instructor
        session = await LiveQuestionSessionModel.find_by_id(session_id)
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        if session["instructorId"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own sessions"
            )
        
        # Get responses
        responses = await QuestionResponseModel.get_live_responses(session_id)
        
        # Get statistics
        stats = await QuestionResponseModel.get_session_statistics(session_id)
        
        # Convert datetime objects in responses
        for response in responses:
            if "submittedAt" in response and hasattr(response["submittedAt"], "isoformat"):
                response["submittedAt"] = response["submittedAt"].isoformat()
            if "createdAt" in response and hasattr(response["createdAt"], "isoformat"):
                response["createdAt"] = response["createdAt"].isoformat()
        
        return {
            "success": True,
            "session": {
                "id": session["id"],
                "question": session["question"],
                "status": session["status"]
            },
            "statistics": stats,
            "responses": responses
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting session responses: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get responses"
        )


@router.post("/dashboard/session/{session_id}/complete")
async def complete_session(
    session_id: str,
    current_user: dict = Depends(require_instructor)
):
    """Mark a session as completed"""
    try:
        # Verify session belongs to instructor
        session = await LiveQuestionSessionModel.find_by_id(session_id)
        
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        if session["instructorId"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only manage your own sessions"
            )
        
        success = await LiveQuestionSessionModel.complete_session(session_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to complete session"
            )
        
        return {
            "success": True,
            "message": "Session completed successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error completing session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete session"
        )


@router.get("/meeting/{meeting_id}/sessions")
async def get_meeting_sessions(
    meeting_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all question sessions for a specific Zoom meeting"""
    try:
        sessions = await LiveQuestionSessionModel.find_by_meeting_id(meeting_id)
        
        # Convert datetime objects
        for session in sessions:
            if "triggeredAt" in session and hasattr(session["triggeredAt"], "isoformat"):
                session["triggeredAt"] = session["triggeredAt"].isoformat()
            if "expiresAt" in session and hasattr(session["expiresAt"], "isoformat"):
                session["expiresAt"] = session["expiresAt"].isoformat()
            if "createdAt" in session and hasattr(session["createdAt"], "isoformat"):
                session["createdAt"] = session["createdAt"].isoformat()
            if "updatedAt" in session and hasattr(session["updatedAt"], "isoformat"):
                session["updatedAt"] = session["updatedAt"].isoformat()
        
        return {
            "success": True,
            "count": len(sessions),
            "sessions": sessions
        }
    except Exception as e:
        print(f"Error getting meeting sessions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get meeting sessions"
        )


@router.get("/test-zoom")
async def test_zoom_connection(current_user: dict = Depends(require_instructor)):
    """Test Zoom API connection"""
    try:
        result = zoom_chat_service.test_connection()
        return result
    except Exception as e:
        return {
            "success": False,
            "message": f"Error testing connection: {str(e)}"
        }

