from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from pathlib import Path
import uuid
import os
from ..models.course import CourseModel
from ..models.user import UserModel
from ..middleware.auth import get_current_user, require_instructor
from ..database.connection import get_database

# Directory for uploaded course materials (PDFs)
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "course_materials"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


router = APIRouter(prefix="/api/courses", tags=["courses"])


class CreateCourseRequest(BaseModel):
    title: str
    description: str
    category: Optional[str] = None
    duration: Optional[str] = None
    courseCode: Optional[str] = None
    thumbnail: Optional[str] = None
    syllabus: Optional[List[dict]] = []
    maxStudents: Optional[int] = None
    status: Optional[str] = "draft"
    startDate: Optional[str] = None
    endDate: Optional[str] = None


class UpdateCourseRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    duration: Optional[str] = None
    courseCode: Optional[str] = None
    thumbnail: Optional[str] = None
    syllabus: Optional[List[dict]] = None
    maxStudents: Optional[int] = None
    status: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None


@router.post("/create")
async def create_course(
    request_data: CreateCourseRequest,
    current_user: dict = Depends(require_instructor)
):
    """Create a new course (instructor only)"""
    try:
        # Prepare course data
        course_data = {
            "title": request_data.title,
            "description": request_data.description,
            "instructorId": current_user["id"],
            "instructorName": f"{current_user['firstName']} {current_user['lastName']}",
            "instructorEmail": current_user["email"],
            "category": request_data.category,
            "duration": request_data.duration,
            "courseCode": request_data.courseCode,
            "thumbnail": request_data.thumbnail,
            "syllabus": request_data.syllabus or [],
            "maxStudents": request_data.maxStudents,
            "status": request_data.status or "draft",
            "enrolledStudents": []
        }
        
        # Handle date fields
        if request_data.startDate:
            try:
                course_data["startDate"] = datetime.fromisoformat(request_data.startDate.replace('Z', '+00:00'))
            except:
                pass
        
        if request_data.endDate:
            try:
                course_data["endDate"] = datetime.fromisoformat(request_data.endDate.replace('Z', '+00:00'))
            except:
                pass
        
        # Create course
        course = await CourseModel.create(course_data)
        
        # Convert datetime objects to ISO format strings
        if "createdAt" in course and hasattr(course["createdAt"], "isoformat"):
            course["createdAt"] = course["createdAt"].isoformat()
        if "updatedAt" in course and hasattr(course["updatedAt"], "isoformat"):
            course["updatedAt"] = course["updatedAt"].isoformat()
        if "startDate" in course and course["startDate"] and hasattr(course["startDate"], "isoformat"):
            course["startDate"] = course["startDate"].isoformat()
        if "endDate" in course and course["endDate"] and hasattr(course["endDate"], "isoformat"):
            course["endDate"] = course["endDate"].isoformat()
        
        return {
            "success": True,
            "message": "Course created successfully",
            "course": course
        }
    except Exception as e:
        print(f"Error creating course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create course: {str(e)}"
        )


@router.get("/")
async def get_all_courses():
    """Get all published courses"""
    try:
        courses = await CourseModel.find_all({"status": "published"})
        
        # Convert datetime objects to ISO format strings
        for course in courses:
            if "createdAt" in course and hasattr(course["createdAt"], "isoformat"):
                course["createdAt"] = course["createdAt"].isoformat()
            if "updatedAt" in course and hasattr(course["updatedAt"], "isoformat"):
                course["updatedAt"] = course["updatedAt"].isoformat()
            if "startDate" in course and course.get("startDate") and hasattr(course["startDate"], "isoformat"):
                course["startDate"] = course["startDate"].isoformat()
            if "endDate" in course and course.get("endDate") and hasattr(course["endDate"], "isoformat"):
                course["endDate"] = course["endDate"].isoformat()
        
        return {
            "success": True,
            "count": len(courses),
            "courses": courses
        }
    except Exception as e:
        print(f"Error fetching courses: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch courses"
        )


@router.get("/all")
async def get_all_courses_including_drafts(current_user: dict = Depends(require_instructor)):
    """Get all courses including drafts (instructor only)"""
    try:
        courses = await CourseModel.find_all()
        
        # Convert datetime objects
        for course in courses:
            if "createdAt" in course and hasattr(course["createdAt"], "isoformat"):
                course["createdAt"] = course["createdAt"].isoformat()
            if "updatedAt" in course and hasattr(course["updatedAt"], "isoformat"):
                course["updatedAt"] = course["updatedAt"].isoformat()
            if "startDate" in course and course.get("startDate") and hasattr(course["startDate"], "isoformat"):
                course["startDate"] = course["startDate"].isoformat()
            if "endDate" in course and course.get("endDate") and hasattr(course["endDate"], "isoformat"):
                course["endDate"] = course["endDate"].isoformat()
        
        return {
            "success": True,
            "count": len(courses),
            "courses": courses
        }
    except Exception as e:
        print(f"Error fetching courses: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch courses"
        )


@router.get("/my-courses")
async def get_my_courses(current_user: dict = Depends(require_instructor)):
    """Get all courses created by the current instructor"""
    try:
        courses = await CourseModel.find_by_instructor(current_user["id"])
        
        # Convert datetime objects
        for course in courses:
            if "createdAt" in course and hasattr(course["createdAt"], "isoformat"):
                course["createdAt"] = course["createdAt"].isoformat()
            if "updatedAt" in course and hasattr(course["updatedAt"], "isoformat"):
                course["updatedAt"] = course["updatedAt"].isoformat()
            if "startDate" in course and course.get("startDate") and hasattr(course["startDate"], "isoformat"):
                course["startDate"] = course["startDate"].isoformat()
            if "endDate" in course and course.get("endDate") and hasattr(course["endDate"], "isoformat"):
                course["endDate"] = course["endDate"].isoformat()
        
        return {
            "success": True,
            "count": len(courses),
            "courses": courses
        }
    except Exception as e:
        print(f"Error fetching instructor courses: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch courses"
        )


# NOTE: This route MUST be before /{course_id} to avoid route conflict
@router.get("/my-enrolled-courses")
async def get_my_enrolled_courses(current_user: dict = Depends(get_current_user)):
    """Get all courses the current student is enrolled in"""
    try:
        courses = await CourseModel.find_enrolled_courses(current_user["id"])
        
        # Convert datetime objects
        for course in courses:
            if "createdAt" in course and hasattr(course["createdAt"], "isoformat"):
                course["createdAt"] = course["createdAt"].isoformat()
            if "updatedAt" in course and hasattr(course["updatedAt"], "isoformat"):
                course["updatedAt"] = course["updatedAt"].isoformat()
            if "startDate" in course and course.get("startDate") and hasattr(course["startDate"], "isoformat"):
                course["startDate"] = course["startDate"].isoformat()
            if "endDate" in course and course.get("endDate") and hasattr(course["endDate"], "isoformat"):
                course["endDate"] = course["endDate"].isoformat()
            
            # Remove enrollment key from student response
            course.pop("enrollmentKey", None)
            course.pop("enrolledStudentDetails", None)
        
        return {
            "success": True,
            "count": len(courses),
            "courses": courses
        }
    except Exception as e:
        print(f"Error fetching enrolled courses: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch enrolled courses"
        )


# ============================================================
# ENROLLMENT KEY ENDPOINTS (MUST be before /{course_id} routes)
# ============================================================

class EnrollWithKeyRequest(BaseModel):
    enrollment_key: str


@router.post("/enroll-with-key")
async def enroll_with_key(
    request_data: EnrollWithKeyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Enroll in a course using enrollment key (students only)"""
    try:
        if current_user.get("role") != "student":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only students can enroll in courses"
            )
        
        result = await CourseModel.enroll_student_with_key(
            request_data.enrollment_key.upper(),
            current_user
        )
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to enroll in course"
            )
        
        if "error" in result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result["error"]
            )
        
        # Convert datetime objects
        course = result
        if "createdAt" in course and hasattr(course["createdAt"], "isoformat"):
            course["createdAt"] = course["createdAt"].isoformat()
        if "updatedAt" in course and hasattr(course["updatedAt"], "isoformat"):
            course["updatedAt"] = course["updatedAt"].isoformat()
        if "startDate" in course and course.get("startDate") and hasattr(course["startDate"], "isoformat"):
            course["startDate"] = course["startDate"].isoformat()
        if "endDate" in course and course.get("endDate") and hasattr(course["endDate"], "isoformat"):
            course["endDate"] = course["endDate"].isoformat()
        
        return {
            "success": True,
            "message": f"Successfully enrolled in '{course.get('title')}'",
            "course": course
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error enrolling with key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enroll in course"
        )


@router.get("/{course_id}")
async def get_course_by_id(course_id: str):
    """Get a specific course by ID"""
    try:
        course = await CourseModel.find_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        # Convert datetime objects
        if "createdAt" in course and hasattr(course["createdAt"], "isoformat"):
            course["createdAt"] = course["createdAt"].isoformat()
        if "updatedAt" in course and hasattr(course["updatedAt"], "isoformat"):
            course["updatedAt"] = course["updatedAt"].isoformat()
        if "startDate" in course and course.get("startDate") and hasattr(course["startDate"], "isoformat"):
            course["startDate"] = course["startDate"].isoformat()
        if "endDate" in course and course.get("endDate") and hasattr(course["endDate"], "isoformat"):
            course["endDate"] = course["endDate"].isoformat()
        
        return {
            "success": True,
            "course": course
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch course"
        )


@router.put("/{course_id}")
async def update_course(
    course_id: str,
    request_data: UpdateCourseRequest,
    current_user: dict = Depends(require_instructor)
):
    """Update a course (instructor only - can only update their own courses)"""
    try:
        # Check if course exists and belongs to instructor
        course = await CourseModel.find_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        if course["instructorId"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only update your own courses"
            )
        
        # Prepare update data (only include fields that are provided)
        update_data = {}
        if request_data.title is not None:
            update_data["title"] = request_data.title
        if request_data.description is not None:
            update_data["description"] = request_data.description
        if request_data.category is not None:
            update_data["category"] = request_data.category
        if request_data.duration is not None:
            update_data["duration"] = request_data.duration
        if request_data.courseCode is not None:
            update_data["courseCode"] = request_data.courseCode
        if request_data.thumbnail is not None:
            update_data["thumbnail"] = request_data.thumbnail
        if request_data.syllabus is not None:
            update_data["syllabus"] = request_data.syllabus
        if request_data.maxStudents is not None:
            update_data["maxStudents"] = request_data.maxStudents
        if request_data.status is not None:
            update_data["status"] = request_data.status
        
        # Handle date fields
        if request_data.startDate is not None:
            try:
                update_data["startDate"] = datetime.fromisoformat(request_data.startDate.replace('Z', '+00:00'))
            except:
                pass
        
        if request_data.endDate is not None:
            try:
                update_data["endDate"] = datetime.fromisoformat(request_data.endDate.replace('Z', '+00:00'))
            except:
                pass
        
        # Update course
        updated_course = await CourseModel.update(course_id, update_data)
        if not updated_course:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update course"
            )
        
        # Convert datetime objects
        if "createdAt" in updated_course and hasattr(updated_course["createdAt"], "isoformat"):
            updated_course["createdAt"] = updated_course["createdAt"].isoformat()
        if "updatedAt" in updated_course and hasattr(updated_course["updatedAt"], "isoformat"):
            updated_course["updatedAt"] = updated_course["updatedAt"].isoformat()
        if "startDate" in updated_course and updated_course.get("startDate") and hasattr(updated_course["startDate"], "isoformat"):
            updated_course["startDate"] = updated_course["startDate"].isoformat()
        if "endDate" in updated_course and updated_course.get("endDate") and hasattr(updated_course["endDate"], "isoformat"):
            updated_course["endDate"] = updated_course["endDate"].isoformat()
        
        return {
            "success": True,
            "message": "Course updated successfully",
            "course": updated_course
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update course"
        )


@router.post("/{course_id}/materials/upload")
async def upload_course_material(
    course_id: str,
    file: UploadFile = File(...),
    title: str = Form(...),
    description: Optional[str] = Form(None),
    current_user: dict = Depends(require_instructor),
):
    """Upload a PDF material for a course (instructor only). Returns URL to store in syllabus."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF files are allowed")
    course = await CourseModel.find_by_id(course_id)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    if course["instructorId"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only add materials to your own courses")
    course_dir = UPLOAD_DIR / course_id
    course_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = course_dir / safe_name
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to save file: {str(e)}")
    # URL the frontend can use to download (same origin)
    file_url = f"/api/courses/{course_id}/materials/files/{safe_name}"
    # Optionally add to course syllabus in one go (frontend can also update course after)
    return {
        "success": True,
        "url": file_url,
        "filename": safe_name,
        "title": title,
        "description": description or "",
    }


@router.get("/{course_id}/materials/files/{filename}")
async def get_course_material_file(
    course_id: str,
    filename: str,
    current_user: dict = Depends(get_current_user),
):
    """Serve a course material file. Access: instructor of course or enrolled student."""
    course = await CourseModel.find_by_id(course_id)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    user_id = current_user.get("id")
    role = current_user.get("role", "")
    if role == "admin":
        pass
    elif role == "instructor":
        if course.get("instructorId") != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        enrolled = await CourseModel.is_student_enrolled(course_id, user_id)
        if not enrolled:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You must be enrolled to download materials")
    file_path = UPLOAD_DIR / course_id / filename
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileResponse(path=str(file_path), filename=filename.split("_", 1)[-1] if "_" in filename else filename, media_type="application/pdf")


@router.delete("/{course_id}")
async def delete_course(
    course_id: str,
    current_user: dict = Depends(require_instructor)
):
    """Delete a course (instructor only - can only delete their own courses)"""
    try:
        # Check if course exists and belongs to instructor
        course = await CourseModel.find_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        if course["instructorId"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own courses"
            )
        
        # Delete course
        success = await CourseModel.delete(course_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete course"
            )
        
        return {
            "success": True,
            "message": "Course deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete course"
        )


@router.post("/{course_id}/enroll")
async def enroll_in_course(
    course_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Enroll current user in a course"""
    try:
        # Check if course exists
        course = await CourseModel.find_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        # Check if course is published
        if course.get("status") != "published":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This course is not available for enrollment"
            )
        
        # Check max students limit
        max_students = course.get("maxStudents")
        enrolled = course.get("enrolledStudents", [])
        if max_students and len(enrolled) >= max_students:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Course is full"
            )
        
        # Enroll student
        updated_course = await CourseModel.enroll_student(course_id, current_user["id"])
        if not updated_course:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to enroll in course"
            )
        
        # Convert datetime objects
        if "createdAt" in updated_course and hasattr(updated_course["createdAt"], "isoformat"):
            updated_course["createdAt"] = updated_course["createdAt"].isoformat()
        if "updatedAt" in updated_course and hasattr(updated_course["updatedAt"], "isoformat"):
            updated_course["updatedAt"] = updated_course["updatedAt"].isoformat()
        if "startDate" in updated_course and updated_course.get("startDate") and hasattr(updated_course["startDate"], "isoformat"):
            updated_course["startDate"] = updated_course["startDate"].isoformat()
        if "endDate" in updated_course and updated_course.get("endDate") and hasattr(updated_course["endDate"], "isoformat"):
            updated_course["endDate"] = updated_course["endDate"].isoformat()
        
        return {
            "success": True,
            "message": "Successfully enrolled in course",
            "course": updated_course
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error enrolling in course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enroll in course"
        )


@router.post("/{course_id}/unenroll")
async def unenroll_from_course(
    course_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Unenroll current user from a course"""
    try:
        # Check if course exists
        course = await CourseModel.find_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        # Unenroll student
        updated_course = await CourseModel.unenroll_student(course_id, current_user["id"])
        if not updated_course:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to unenroll from course"
            )
        
        # Convert datetime objects
        if "createdAt" in updated_course and hasattr(updated_course["createdAt"], "isoformat"):
            updated_course["createdAt"] = updated_course["createdAt"].isoformat()
        if "updatedAt" in updated_course and hasattr(updated_course["updatedAt"], "isoformat"):
            updated_course["updatedAt"] = updated_course["updatedAt"].isoformat()
        if "startDate" in updated_course and updated_course.get("startDate") and hasattr(updated_course["startDate"], "isoformat"):
            updated_course["startDate"] = updated_course["startDate"].isoformat()
        if "endDate" in updated_course and updated_course.get("endDate") and hasattr(updated_course["endDate"], "isoformat"):
            updated_course["endDate"] = updated_course["endDate"].isoformat()
        
        return {
            "success": True,
            "message": "Successfully unenrolled from course",
            "course": updated_course
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error unenrolling from course: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unenroll from course"
        )


@router.get("/instructor/{instructor_id}")
async def get_courses_by_instructor(instructor_id: str):
    """Get all published courses by a specific instructor"""
    try:
        # Get all courses by instructor
        courses = await CourseModel.find_by_instructor(instructor_id)
        
        # Filter only published courses
        published_courses = [c for c in courses if c.get("status") == "published"]
        
        # Convert datetime objects
        for course in published_courses:
            if "createdAt" in course and hasattr(course["createdAt"], "isoformat"):
                course["createdAt"] = course["createdAt"].isoformat()
            if "updatedAt" in course and hasattr(course["updatedAt"], "isoformat"):
                course["updatedAt"] = course["updatedAt"].isoformat()
            if "startDate" in course and course.get("startDate") and hasattr(course["startDate"], "isoformat"):
                course["startDate"] = course["startDate"].isoformat()
            if "endDate" in course and course.get("endDate") and hasattr(course["endDate"], "isoformat"):
                course["endDate"] = course["endDate"].isoformat()
        
        return {
            "success": True,
            "count": len(published_courses),
            "courses": published_courses
        }
    except Exception as e:
        print(f"Error fetching instructor courses: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch courses"
        )


@router.post("/{course_id}/regenerate-key")
async def regenerate_enrollment_key(
    course_id: str,
    current_user: dict = Depends(require_instructor)
):
    """Regenerate enrollment key for a course (instructor only)"""
    try:
        # Check if course exists and belongs to instructor
        course = await CourseModel.find_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        if course["instructorId"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only manage your own courses"
            )
        
        new_key = await CourseModel.regenerate_enrollment_key(course_id)
        if not new_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to regenerate enrollment key"
            )
        
        return {
            "success": True,
            "message": "Enrollment key regenerated successfully",
            "enrollmentKey": new_key
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error regenerating key: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to regenerate enrollment key"
        )


@router.post("/{course_id}/toggle-enrollment")
async def toggle_enrollment(
    course_id: str,
    active: bool,
    current_user: dict = Depends(require_instructor)
):
    """Enable or disable enrollment for a course (instructor only)"""
    try:
        # Check if course exists and belongs to instructor
        course = await CourseModel.find_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        if course["instructorId"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only manage your own courses"
            )
        
        updated = await CourseModel.toggle_enrollment_key(course_id, active)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update enrollment status"
            )
        
        return {
            "success": True,
            "message": f"Enrollment {'enabled' if active else 'disabled'} successfully",
            "enrollmentKeyActive": active
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error toggling enrollment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update enrollment status"
        )


@router.get("/{course_id}/students")
async def get_course_students(
    course_id: str,
    current_user: dict = Depends(require_instructor)
):
    """Get all students enrolled in a course (instructor only)"""
    try:
        # Check if course exists and belongs to instructor
        course = await CourseModel.find_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        if course["instructorId"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view students in your own courses"
            )
        
        return {
            "success": True,
            "courseId": course_id,
            "courseTitle": course.get("title"),
            "enrollmentKey": course.get("enrollmentKey"),
            "enrollmentKeyActive": course.get("enrollmentKeyActive", True),
            "totalStudents": len(course.get("enrolledStudents", [])),
            "students": course.get("enrolledStudentDetails", [])
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching course students: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch students"
        )


@router.delete("/{course_id}/students/{student_id}")
async def remove_student_from_course(
    course_id: str,
    student_id: str,
    current_user: dict = Depends(require_instructor)
):
    """Remove a student from a course (instructor only)"""
    try:
        # Check if course exists and belongs to instructor
        course = await CourseModel.find_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found"
            )
        
        if course["instructorId"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only manage your own courses"
            )
        
        result = await CourseModel.unenroll_student(course_id, student_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to remove student"
            )
        
        return {
            "success": True,
            "message": "Student removed successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing student: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove student"
        )
