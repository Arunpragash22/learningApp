"""
Feedback Router
===============

Endpoints for personalized student feedback (Model-2).
Data is retrieved from MongoDB — no file uploads needed.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from ..middleware.auth import get_current_user
from ..services.feedback_service import (
    get_student_feedback,
    get_session_feedback,
    generate_feedback_csv,
)
import io

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.get("/student/{student_id}")
async def student_feedback(
    student_id: str,
    sessionId: str,
    user: dict = Depends(get_current_user),
):
    """
    Get personalized feedback for a single student in a session.
    Called by the student dashboard.
    """
    try:
        fb = await get_student_feedback(sessionId, student_id)
        if fb is None:
            return {
                "feedback": None,
                "message": "No quiz data yet. Answer some questions to receive feedback.",
            }
        return {"feedback": fb}
    except Exception as e:
        print(f"Error getting student feedback: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/session/{session_id}")
async def session_feedback(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Get personalized feedback for ALL students in a session.
    Called by the instructor analytics page.
    """
    try:
        results = await get_session_feedback(session_id)
        return {"feedback": results, "count": len(results)}
    except Exception as e:
        print(f"Error getting session feedback: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/session/{session_id}/download")
async def download_feedback_csv(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Download the students_with_feedback.csv for a session.
    Same format as the Colab notebook output.
    """
    try:
        csv_text = await generate_feedback_csv(session_id)
        if not csv_text:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No feedback data available for this session.",
            )

        return StreamingResponse(
            io.StringIO(csv_text),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=students_with_feedback_{session_id}.csv"
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating feedback CSV: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
