from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime
from ..models.question import Question
from ..middleware.auth import get_current_user, require_instructor


router = APIRouter(prefix="/api/questions", tags=["questions"])


class QuestionOption(BaseModel):
    question: str
    options: List[str]
    correctAnswer: int
    difficulty: str
    category: str
    tags: Optional[List[str]] = []
    timeLimit: Optional[int] = 30
    courseId: Optional[str] = None  # Optional: which course this question belongs to
    sessionId: Optional[str] = None  # Optional: which session this question belongs to
    questionType: Optional[str] = "generic"  # 'generic' or 'cluster'
    targetCluster: Optional[str] = None  # 'passive', 'moderate', 'active' (only when questionType is 'cluster')


class QuestionResponse(BaseModel):
    id: str
    question: str
    options: List[str]
    correctAnswer: int
    difficulty: str
    category: str
    tags: List[str]
    timeLimit: Optional[int] = 30
    createdAt: Optional[str] = None
    instructorId: Optional[str] = None
    courseId: Optional[str] = None
    sessionId: Optional[str] = None
    questionType: Optional[str] = "generic"  # 'generic' or 'cluster'
    targetCluster: Optional[str] = None  # 'passive', 'moderate', 'active'


@router.post("/", response_model=QuestionResponse)
async def create_question(
    question_data: QuestionOption,
    user: dict = Depends(require_instructor)
):
    """Create a new question (instructor only). Stored per instructor; optional courseId or sessionId for filtering."""
    try:
        instructor_id = user.get("id", "")
        print(f"📝 Creating question by instructor: {user.get('email', 'unknown')} ({instructor_id})")
        
        question_dict = question_data.dict()
        question_dict["createdAt"] = datetime.now().isoformat()
        question_dict["createdBy"] = instructor_id
        question_dict["createdByEmail"] = user.get("email", "")
        question_dict["instructorId"] = instructor_id
        if question_data.courseId:
            question_dict["courseId"] = question_data.courseId
        if question_data.sessionId:
            question_dict["sessionId"] = question_data.sessionId
        
        created_question = await Question.create(question_dict)
        print(f"✅ Question created with ID: {created_question.get('id', '')}")
        
        response = QuestionResponse(
            id=created_question.get("id", ""),
            question=created_question.get("question", ""),
            options=created_question.get("options", []),
            correctAnswer=created_question.get("correctAnswer", 0),
            difficulty=created_question.get("difficulty", "medium"),
            category=created_question.get("category", ""),
            tags=created_question.get("tags", []),
            timeLimit=created_question.get("timeLimit", 30),
            createdAt=created_question.get("createdAt"),
            instructorId=instructor_id,
            courseId=question_dict.get("courseId"),
            sessionId=question_dict.get("sessionId"),
            questionType=created_question.get("questionType", "generic"),
            targetCluster=created_question.get("targetCluster"),
        )
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"❌ Error creating question: {e}")
        print(f"❌ Full traceback:\n{error_details}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create question: {str(e)}"
        )


@router.get("/", response_model=List[QuestionResponse])
async def get_all_questions(
    course_id: Optional[str] = None,
    session_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Get questions: instructors see only their own; optional filter by courseId or sessionId."""
    try:
        role = user.get("role", "student")
        user_id = user.get("id", "")
        
        if role in ("instructor", "admin"):
            questions = await Question.find_by_instructor(user_id, course_id=course_id, session_id=session_id)
        else:
            questions = []
        
        response = []
        for q in questions:
            response.append(QuestionResponse(
                id=q.get("id", ""),
                question=q.get("question", ""),
                options=q.get("options", []),
                correctAnswer=q.get("correctAnswer", 0),
                difficulty=q.get("difficulty", "medium"),
                category=q.get("category", ""),
                tags=q.get("tags", []),
                timeLimit=q.get("timeLimit", 30),
                createdAt=q.get("createdAt"),
                instructorId=q.get("instructorId"),
                courseId=q.get("courseId"),
                sessionId=q.get("sessionId"),
                questionType=q.get("questionType", "generic"),
                targetCluster=q.get("targetCluster"),
            ))
        
        return response
    except Exception as e:
        print(f"Error retrieving questions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve questions: {str(e)}"
        )


def _question_owned_by(question: dict, user: dict) -> bool:
    """True if user owns this question (instructorId/createdBy) or is admin."""
    if user.get("role") == "admin":
        return True
    uid = user.get("id", "")
    return question.get("instructorId") == uid or question.get("createdBy") == uid


@router.get("/{question_id}", response_model=QuestionResponse)
async def get_question_by_id(
    question_id: str,
    user: dict = Depends(get_current_user)
):
    """Get a specific question by ID (instructor sees only their own)."""
    try:
        question = await Question.find_by_id(question_id)
        
        if not question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question not found"
            )
        if user.get("role") in ("instructor", "admin") and not _question_owned_by(question, user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own questions")
        
        return QuestionResponse(
            id=question.get("id", ""),
            question=question.get("question", ""),
            options=question.get("options", []),
            correctAnswer=question.get("correctAnswer", 0),
            difficulty=question.get("difficulty", "medium"),
            category=question.get("category", ""),
            tags=question.get("tags", []),
            timeLimit=question.get("timeLimit", 30),
            createdAt=question.get("createdAt"),
            instructorId=question.get("instructorId"),
            courseId=question.get("courseId"),
            questionType=question.get("questionType", "generic"),
            targetCluster=question.get("targetCluster"),
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error retrieving question: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve question: {str(e)}"
        )


@router.put("/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: str,
    question_data: QuestionOption,
    user: dict = Depends(require_instructor)
):
    """Update a question (instructor only, own questions only)."""
    try:
        existing = await Question.find_by_id(question_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
        if not _question_owned_by(existing, user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only update your own questions")
        
        update_dict = question_data.dict()
        if question_data.courseId is not None:
            update_dict["courseId"] = question_data.courseId
        updated_question = await Question.update(question_id, update_dict)
        
        if not updated_question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question not found"
            )
        
        return QuestionResponse(
            id=updated_question.get("id", ""),
            question=updated_question.get("question", ""),
            options=updated_question.get("options", []),
            correctAnswer=updated_question.get("correctAnswer", 0),
            difficulty=updated_question.get("difficulty", "medium"),
            category=updated_question.get("category", ""),
            tags=updated_question.get("tags", []),
            timeLimit=updated_question.get("timeLimit", 30),
            createdAt=updated_question.get("createdAt"),
            instructorId=updated_question.get("instructorId"),
            courseId=updated_question.get("courseId"),
            questionType=updated_question.get("questionType", "generic"),
            targetCluster=updated_question.get("targetCluster"),
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating question: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update question: {str(e)}"
        )


@router.delete("/{question_id}")
async def delete_question(
    question_id: str,
    user: dict = Depends(require_instructor)
):
    """Delete a question (instructor only, own questions only)."""
    try:
        existing = await Question.find_by_id(question_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
        if not _question_owned_by(existing, user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own questions")
        
        success = await Question.delete(question_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Question not found"
            )
        
        return {"success": True, "message": "Question deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting question: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete question: {str(e)}"
        )

