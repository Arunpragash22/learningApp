from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from bson import ObjectId

from src.database.connection import db
from src.middleware.auth import get_current_user

router = APIRouter(prefix="/api/profile", tags=["Profile"])


class ProfileUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    bio: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None


@router.get("")
async def get_profile(user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile along with real statistics."""
    try:
        user_id = user.get("id")
        user_email = user.get("email", "")
        user_role = user.get("role", "student")

        user_doc = await db.database.users.find_one({"_id": ObjectId(user_id)})
        if not user_doc:
            raise HTTPException(status_code=404, detail="User not found")

        # ---- real stats ------------------------------------------------
        if user_role == "student":
            stats = await _student_stats(user_id, user_email)
        elif user_role == "instructor":
            stats = await _instructor_stats(user_id)
        else:
            stats = await _admin_stats()

        return {
            "success": True,
            "profile": {
                "id": user_id,
                "firstName": user_doc.get("firstName", ""),
                "lastName": user_doc.get("lastName", ""),
                "email": user_doc.get("email", ""),
                "role": user_doc.get("role", "student"),
                "status": user_doc.get("status", 0),
                "bio": user_doc.get("bio", ""),
                "phone": user_doc.get("phone", ""),
                "department": user_doc.get("department", ""),
                "createdAt": user_doc.get("createdAt").isoformat() if user_doc.get("createdAt") else None,
            },
            "stats": stats,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch profile")


@router.put("")
async def update_profile(
    body: ProfileUpdate,
    user: dict = Depends(get_current_user),
):
    """Update editable profile fields (firstName, lastName, bio, phone, department)."""
    try:
        user_id = user.get("id")

        update_fields = {}
        for field in ("firstName", "lastName", "bio", "phone", "department"):
            value = getattr(body, field, None)
            if value is not None:
                update_fields[field] = value

        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        update_fields["updatedAt"] = datetime.utcnow()

        await db.database.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_fields},
        )

        updated_user = await db.database.users.find_one({"_id": ObjectId(user_id)})
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "success": True,
            "message": "Profile updated successfully",
            "profile": {
                "id": user_id,
                "firstName": updated_user.get("firstName", ""),
                "lastName": updated_user.get("lastName", ""),
                "email": updated_user.get("email", ""),
                "role": updated_user.get("role", "student"),
                "bio": updated_user.get("bio", ""),
                "phone": updated_user.get("phone", ""),
                "department": updated_user.get("department", ""),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating profile: {e}")
        raise HTTPException(status_code=500, detail="Failed to update profile")


# -------------------------------------------------------------------
# Stat helpers
# -------------------------------------------------------------------

async def _student_stats(student_id: str, student_email: str) -> dict:
    courses_enrolled = await db.database.course_enrollments.count_documents(
        {"studentId": student_id}
    )

    sessions_attended = await db.database.session_participants.count_documents(
        {"studentId": student_id}
    )

    total_questions = await db.database.question_assignments.count_documents(
        {"studentId": student_id}
    )
    correct_answers = await db.database.question_assignments.count_documents(
        {"studentId": student_id, "isCorrect": True}
    )

    if total_questions == 0:
        total_questions = await db.database.quiz_answers.count_documents(
            {"studentId": student_id}
        )
        correct_answers = await db.database.quiz_answers.count_documents(
            {"studentId": student_id, "isCorrect": True}
        )

    avg_score = round((correct_answers / total_questions * 100), 1) if total_questions > 0 else 0

    total_minutes = 0
    async for p in db.database.session_participants.find({"studentId": student_id}):
        joined = p.get("joinedAt")
        left = p.get("leftAt")
        if joined and left:
            total_minutes += max(0, int((left - joined).total_seconds() / 60))

    return {
        "coursesEnrolled": courses_enrolled,
        "sessionsAttended": sessions_attended,
        "quizzesCompleted": total_questions,
        "averageScore": avg_score,
        "totalMinutes": total_minutes,
    }


async def _instructor_stats(instructor_id: str) -> dict:
    total_sessions = await db.database.sessions.count_documents(
        {"instructorId": instructor_id}
    )
    total_courses = await db.database.courses.count_documents(
        {"instructorId": instructor_id}
    )

    instructor_session_ids = []
    async for s in db.database.sessions.find(
        {"instructorId": instructor_id}, {"_id": 1}
    ):
        instructor_session_ids.append(str(s["_id"]))

    total_students = set()
    if instructor_session_ids:
        async for p in db.database.session_participants.find(
            {"sessionId": {"$in": instructor_session_ids}}
        ):
            sid = p.get("studentId")
            if sid:
                total_students.add(sid)

    total_questions = await db.database.questions.count_documents(
        {"instructorId": instructor_id}
    )

    return {
        "totalSessions": total_sessions,
        "totalCourses": total_courses,
        "totalStudents": len(total_students),
        "totalQuestions": total_questions,
    }


async def _admin_stats() -> dict:
    total_users = await db.database.users.count_documents({})
    total_sessions = await db.database.sessions.count_documents({})
    total_courses = await db.database.courses.count_documents({})

    return {
        "totalUsers": total_users,
        "totalSessions": total_sessions,
        "totalCourses": total_courses,
    }
