from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId
import secrets
import string
import asyncio
from ..database.connection import get_database
from ..services.mysql_backup_service import mysql_backup_service


def generate_enrollment_key(length: int = 8) -> str:
    """Generate a unique enrollment key like 'ABC12345'"""
    # Mix of uppercase letters and digits for readability
    chars = string.ascii_uppercase + string.digits
    # Remove confusing characters (0, O, I, 1, L)
    chars = chars.replace('0', '').replace('O', '').replace('I', '').replace('1', '').replace('L', '')
    return ''.join(secrets.choice(chars) for _ in range(length))


class Course(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    instructorId: str
    instructorName: str
    instructorEmail: str
    category: Optional[str] = None
    duration: Optional[str] = None
    courseCode: Optional[str] = None  # e.g., CS101, WEB201
    thumbnail: Optional[str] = None
    syllabus: Optional[List[dict]] = []
    enrolledStudents: Optional[List[str]] = []  # List of student IDs
    enrolledStudentDetails: Optional[List[dict]] = []  # List of {id, name, email, enrolledAt}
    enrollmentKey: Optional[str] = None  # Unique key for students to enroll
    enrollmentKeyActive: bool = True  # Whether key is currently accepting enrollments
    maxStudents: Optional[int] = None
    status: str = "draft"  # draft, published, archived
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None

    class Config:
        json_schema_extra = {
            "example": {
                "title": "Introduction to Python Programming",
                "description": "Learn Python from scratch",
                "instructorId": "507f1f77bcf86cd799439011",
                "instructorName": "John Doe",
                "instructorEmail": "john@example.com",
                "category": "Programming",
                "duration": "8 weeks",
                "courseCode": "CS101",
                "status": "published"
            }
        }


class CourseModel:
    @staticmethod
    async def create(course_data: dict) -> dict:
        """Create a new course with auto-generated enrollment key"""
        database = get_database()
        if database is None:
            raise Exception("Database not connected")
        
        course_data["createdAt"] = datetime.now()
        course_data["updatedAt"] = datetime.now()
        course_data["enrolledStudents"] = course_data.get("enrolledStudents", [])
        course_data["enrolledStudentDetails"] = course_data.get("enrolledStudentDetails", [])
        course_data["syllabus"] = course_data.get("syllabus", [])
        
        # Generate unique enrollment key
        while True:
            enrollment_key = generate_enrollment_key()
            # Check if key already exists
            existing = await database.courses.find_one({"enrollmentKey": enrollment_key})
            if not existing:
                break
        
        course_data["enrollmentKey"] = enrollment_key
        course_data["enrollmentKeyActive"] = True
        
        result = await database.courses.insert_one(course_data)
        course_data["id"] = str(result.inserted_id)
        
        # ============================================================
        # MYSQL BACKUP: Backup new course to MySQL (non-blocking)
        # ============================================================
        try:
            asyncio.create_task(mysql_backup_service.backup_course(course_data))
            print(f"📦 MySQL backup triggered for new course: {course_data.get('title')}")
        except Exception as e:
            print(f"⚠️ MySQL course backup failed (non-fatal): {e}")
        
        # Remove _id to avoid serialization issues
        if "_id" in course_data:
            del course_data["_id"]
        return course_data

    @staticmethod
    async def find_by_id(course_id: str) -> Optional[dict]:
        """Find course by ID"""
        database = get_database()
        if database is None:
            return None
        try:
            course = await database.courses.find_one({"_id": ObjectId(course_id)})
            if course:
                course["id"] = str(course["_id"])
                del course["_id"]
            return course
        except Exception as e:
            print(f"Error finding course: {e}")
            return None

    @staticmethod
    async def find_by_instructor(instructor_id: str) -> List[dict]:
        """Find all courses by instructor"""
        database = get_database()
        if database is None:
            return []
        
        courses = []
        async for course in database.courses.find({"instructorId": instructor_id}):
            course["id"] = str(course["_id"])
            del course["_id"]
            courses.append(course)
        return courses

    @staticmethod
    async def find_all(filters: dict = None) -> List[dict]:
        """Find all courses with optional filters"""
        database = get_database()
        if database is None:
            return []
        
        query = filters if filters else {}
        courses = []
        async for course in database.courses.find(query):
            course["id"] = str(course["_id"])
            del course["_id"]
            courses.append(course)
        return courses

    @staticmethod
    async def update(course_id: str, update_data: dict) -> Optional[dict]:
        """Update course"""
        database = get_database()
        if database is None:
            return None
        
        update_data["updatedAt"] = datetime.now()
        
        try:
            result = await database.courses.update_one(
                {"_id": ObjectId(course_id)},
                {"$set": update_data}
            )
            
            if result.modified_count or result.matched_count:
                return await CourseModel.find_by_id(course_id)
            return None
        except Exception as e:
            print(f"Error updating course: {e}")
            return None

    @staticmethod
    async def delete(course_id: str) -> bool:
        """Delete course"""
        database = get_database()
        if database is None:
            return False
        
        try:
            result = await database.courses.delete_one({"_id": ObjectId(course_id)})
            return result.deleted_count > 0
        except Exception as e:
            print(f"Error deleting course: {e}")
            return False

    @staticmethod
    async def enroll_student(course_id: str, student_id: str) -> Optional[dict]:
        """Enroll a student in a course"""
        database = get_database()
        if database is None:
            return None
        
        try:
            # Check if student is already enrolled
            course = await CourseModel.find_by_id(course_id)
            if not course:
                return None
            
            enrolled = course.get("enrolledStudents", [])
            if student_id in enrolled:
                return course  # Already enrolled
            
            # Add student to enrolled list
            result = await database.courses.update_one(
                {"_id": ObjectId(course_id)},
                {
                    "$push": {"enrolledStudents": student_id},
                    "$set": {"updatedAt": datetime.now()}
                }
            )
            
            if result.modified_count:
                return await CourseModel.find_by_id(course_id)
            return None
        except Exception as e:
            print(f"Error enrolling student: {e}")
            return None

    @staticmethod
    async def unenroll_student(course_id: str, student_id: str) -> Optional[dict]:
        """Unenroll a student from a course"""
        database = get_database()
        if database is None:
            return None
        
        try:
            result = await database.courses.update_one(
                {"_id": ObjectId(course_id)},
                {
                    "$pull": {
                        "enrolledStudents": student_id,
                        "enrolledStudentDetails": {"id": student_id}
                    },
                    "$set": {"updatedAt": datetime.now()}
                }
            )
            
            if result.modified_count:
                return await CourseModel.find_by_id(course_id)
            return None
        except Exception as e:
            print(f"Error unenrolling student: {e}")
            return None

    @staticmethod
    async def find_by_enrollment_key(enrollment_key: str) -> Optional[dict]:
        """Find course by enrollment key"""
        database = get_database()
        if database is None:
            return None
        try:
            course = await database.courses.find_one({"enrollmentKey": enrollment_key.upper()})
            if course:
                course["id"] = str(course["_id"])
                del course["_id"]
            return course
        except Exception as e:
            print(f"Error finding course by key: {e}")
            return None

    @staticmethod
    async def enroll_student_with_key(enrollment_key: str, student_data: dict) -> Optional[dict]:
        """Enroll a student using enrollment key"""
        database = get_database()
        if database is None:
            return None
        
        try:
            # Find course by enrollment key
            course = await CourseModel.find_by_enrollment_key(enrollment_key)
            if not course:
                return {"error": "Invalid enrollment key"}
            
            # Check if enrollment key is active
            if not course.get("enrollmentKeyActive", True):
                return {"error": "Enrollment is closed for this course"}
            
            # Check if course is published
            if course.get("status") != "published":
                return {"error": "This course is not available for enrollment"}
            
            # Check max students limit
            max_students = course.get("maxStudents")
            enrolled = course.get("enrolledStudents", [])
            if max_students and len(enrolled) >= max_students:
                return {"error": "Course is full"}
            
            # Check if student is already enrolled
            if student_data["id"] in enrolled:
                return {"error": "You are already enrolled in this course", "course": course}
            
            # Add student to enrolled list
            student_detail = {
                "id": student_data["id"],
                "name": f"{student_data.get('firstName', '')} {student_data.get('lastName', '')}".strip(),
                "email": student_data.get("email", ""),
                "enrolledAt": datetime.now().isoformat()
            }
            
            result = await database.courses.update_one(
                {"enrollmentKey": enrollment_key.upper()},
                {
                    "$push": {
                        "enrolledStudents": student_data["id"],
                        "enrolledStudentDetails": student_detail
                    },
                    "$set": {"updatedAt": datetime.now()}
                }
            )
            
            if result.modified_count:
                return await CourseModel.find_by_enrollment_key(enrollment_key)
            return None
        except Exception as e:
            print(f"Error enrolling student with key: {e}")
            return None

    @staticmethod
    async def regenerate_enrollment_key(course_id: str) -> Optional[str]:
        """Generate a new enrollment key for a course"""
        database = get_database()
        if database is None:
            return None
        
        try:
            # Generate unique new key
            while True:
                new_key = generate_enrollment_key()
                existing = await database.courses.find_one({"enrollmentKey": new_key})
                if not existing:
                    break
            
            result = await database.courses.update_one(
                {"_id": ObjectId(course_id)},
                {
                    "$set": {
                        "enrollmentKey": new_key,
                        "updatedAt": datetime.now()
                    }
                }
            )
            
            if result.modified_count:
                return new_key
            return None
        except Exception as e:
            print(f"Error regenerating enrollment key: {e}")
            return None

    @staticmethod
    async def toggle_enrollment_key(course_id: str, active: bool) -> Optional[dict]:
        """Enable or disable enrollment key"""
        database = get_database()
        if database is None:
            return None
        
        try:
            result = await database.courses.update_one(
                {"_id": ObjectId(course_id)},
                {
                    "$set": {
                        "enrollmentKeyActive": active,
                        "updatedAt": datetime.now()
                    }
                }
            )
            
            if result.modified_count or result.matched_count:
                return await CourseModel.find_by_id(course_id)
            return None
        except Exception as e:
            print(f"Error toggling enrollment key: {e}")
            return None

    @staticmethod
    async def find_enrolled_courses(student_id: str) -> List[dict]:
        """Find all courses a student is enrolled in"""
        database = get_database()
        if database is None:
            return []
        
        courses = []
        async for course in database.courses.find({"enrolledStudents": student_id}):
            course["id"] = str(course["_id"])
            del course["_id"]
            courses.append(course)
        return courses

    @staticmethod
    async def is_student_enrolled(course_id: str, student_id: str) -> bool:
        """Check if a student is enrolled in a course"""
        database = get_database()
        if database is None:
            return False
        
        try:
            course = await database.courses.find_one({
                "_id": ObjectId(course_id),
                "enrolledStudents": student_id
            })
            return course is not None
        except Exception as e:
            print(f"Error checking enrollment: {e}")
            return False

