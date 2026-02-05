from typing import Dict, Optional, Any, List
from bson import ObjectId
import asyncio
from ..database.connection import get_database


class Question:
    @staticmethod
    async def find_by_id(id: str) -> Optional[Dict[str, Any]]:
        """Find question by ID"""
        database = get_database()
        if database is None:
            return None
        try:
            question = await database.questions.find_one({"_id": ObjectId(id)})
            if question:
                question["id"] = str(question["_id"])
                del question["_id"]
            return question
        except:
            # Try finding by string id if ObjectId fails
            question = await database.questions.find_one({"id": id})
            if question and "_id" in question:
                question["id"] = str(question["_id"])
                del question["_id"]
            return question

    @staticmethod
    async def create(data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new question"""
        try:
            database = get_database()
            if database is None:
                print("❌ Database connection is None")
                raise Exception("Database not connected")
            
            print(f"📝 Database connection OK, inserting question...")
            
            # If id is provided as string, use it; otherwise generate ObjectId
            if "id" in data:
                question_data = {**data}
                if "_id" not in question_data:
                    try:
                        question_data["_id"] = ObjectId(data["id"])
                    except:
                        pass
            else:
                question_data = {**data}
            
            result = await database.questions.insert_one(question_data)
            question_data["id"] = str(result.inserted_id)
            if "_id" in question_data:
                question_data["_id"] = result.inserted_id
            
            print(f"✅ Question inserted to MongoDB with ID: {question_data['id']}")
            
            # ============================================================
            # MYSQL BACKUP: Auto-backup new question (non-blocking)
            # ============================================================
            try:
                from ..services.mysql_backup_service import mysql_backup_service
                # Run backup in background without waiting
                asyncio.create_task(mysql_backup_service.backup_question(question_data))
                print(f"📦 MySQL backup triggered for question: {question_data['id']}")
            except Exception as e:
                # MySQL backup failure is NON-FATAL - just log it
                print(f"⚠️ MySQL question backup failed (non-fatal): {e}")
            
            return question_data
        except Exception as e:
            import traceback
            print(f"❌ Error in Question.create(): {e}")
            print(f"❌ Traceback:\n{traceback.format_exc()}")
            raise

    @staticmethod
    async def find_all() -> List[Dict[str, Any]]:
        """Find all questions"""
        database = get_database()
        if database is None:
            return []
        
        questions = []
        async for question in database.questions.find():
            question["id"] = str(question["_id"])
            del question["_id"]
            questions.append(question)
        return questions

    @staticmethod
    async def find_by_session(session_id: str, instructor_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Find questions for a specific session.
        First tries session-specific questions, then falls back to instructor's general questions.
        """
        database = get_database()
        if database is None:
            return []
        
        questions = []
        
        # First, try to find questions specific to this session
        async for question in database.questions.find({"sessionId": session_id}):
            q = dict(question)
            q["id"] = str(q["_id"])
            del q["_id"]
            questions.append(q)
        
        # If no session-specific questions and instructor_id provided, get general questions
        if not questions and instructor_id:
            query = {
                "$or": [{"instructorId": instructor_id}, {"createdBy": instructor_id}],
                "$or": [{"sessionId": None}, {"sessionId": {"$exists": False}}]
            }
            # Need to use $and for multiple $or conditions
            query = {
                "$and": [
                    {"$or": [{"instructorId": instructor_id}, {"createdBy": instructor_id}]},
                    {"$or": [{"sessionId": None}, {"sessionId": {"$exists": False}}]}
                ]
            }
            async for question in database.questions.find(query):
                q = dict(question)
                q["id"] = str(q["_id"])
                del q["_id"]
                questions.append(q)
        
        return questions

    @staticmethod
    async def find_by_instructor(instructor_id: str, course_id: Optional[str] = None, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Find questions by instructor (instructorId or legacy createdBy), optionally by courseId or sessionId."""
        database = get_database()
        if database is None:
            return []
        query = {"$or": [{"instructorId": instructor_id}, {"createdBy": instructor_id}]}
        if course_id:
            query["courseId"] = course_id
        if session_id:
            query["sessionId"] = session_id
        questions = []
        async for question in database.questions.find(query):
            q = dict(question)
            q["id"] = str(q["_id"])
            del q["_id"]
            questions.append(q)
        return questions

    @staticmethod
    async def update(question_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update question"""
        database = get_database()
        if database is None:
            return None
        
        try:
            result = await database.questions.update_one(
                {"_id": ObjectId(question_id)},
                {"$set": update_data}
            )
            if result.modified_count:
                return await Question.find_by_id(question_id)
        except:
            pass
        return None

    @staticmethod
    async def delete(question_id: str) -> bool:
        """Delete question"""
        database = get_database()
        if database is None:
            return False
        
        try:
            result = await database.questions.delete_one({"_id": ObjectId(question_id)})
            return result.deleted_count > 0
        except:
            return False

