from typing import Dict, Optional, Any, List, Tuple
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

    @staticmethod
    async def find_for_session_with_fallback(
        session_id: str,
        instructor_id: Optional[str] = None,
        course_id: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], str]:
        """
        Find questions for a session with intelligent fallback:
          1. Current session's questions
          2. Most recent previous session's questions (same course/instructor)
          3. Instructor's general questions (no sessionId)

        Returns (questions_list, source_label) where source_label is one of:
          "current_session", "previous_session", "general", "all_fallback"
        """
        database = get_database()
        if database is None:
            return [], "none"

        # --- 1. Current session ---
        questions: List[Dict[str, Any]] = []
        async for q in database.questions.find({"sessionId": session_id}):
            q["id"] = str(q["_id"])
            questions.append(q)
        if questions:
            print(f"📝 Fallback: Found {len(questions)} questions for current session {session_id}")
            return questions, "current_session"

        # Resolve instructor_id / course_id from session doc if not provided
        session_doc = None
        try:
            session_doc = await database.sessions.find_one({"_id": ObjectId(session_id)})
        except Exception:
            pass
        if session_doc:
            if not instructor_id:
                instructor_id = session_doc.get("instructorId")
            if not course_id:
                course_id = session_doc.get("courseId")

        # --- 2. Previous session's questions ---
        if instructor_id:
            prev_session = await Question._find_previous_session(
                database, session_id, instructor_id, course_id
            )
            if prev_session:
                prev_sid = str(prev_session["_id"])
                async for q in database.questions.find({"sessionId": prev_sid}):
                    q["id"] = str(q["_id"])
                    questions.append(q)
                if questions:
                    print(f"📝 Fallback: Found {len(questions)} questions from previous session {prev_sid}")
                    return questions, "previous_session"

        # --- 3. Instructor's general questions (no sessionId) ---
        if instructor_id:
            query = {
                "$and": [
                    {"$or": [{"instructorId": instructor_id}, {"createdBy": instructor_id}]},
                    {"$or": [{"sessionId": None}, {"sessionId": {"$exists": False}}]}
                ]
            }
            async for q in database.questions.find(query):
                q["id"] = str(q["_id"])
                questions.append(q)
            if questions:
                print(f"📝 Fallback: Found {len(questions)} general questions from instructor")
                return questions, "general"

        # --- 4. Ultimate fallback: all questions in DB ---
        async for q in database.questions.find({}):
            q["id"] = str(q["_id"])
            questions.append(q)
        print(f"📝 Fallback: Using all {len(questions)} questions in database")
        return questions, "all_fallback"

    @staticmethod
    async def _find_previous_session(
        database, current_session_id: str, instructor_id: str, course_id: Optional[str]
    ) -> Optional[Dict]:
        """
        Find the most recent completed/live session BEFORE the current one
        for the same instructor (and preferably same course).
        """
        current_session = None
        try:
            current_session = await database.sessions.find_one({"_id": ObjectId(current_session_id)})
        except Exception:
            pass

        current_date = None
        if current_session:
            current_date = current_session.get("createdAt") or current_session.get("date")

        # Build query: same instructor, different session, has questions
        base_query = {
            "instructorId": instructor_id,
            "_id": {"$ne": ObjectId(current_session_id)},
            "status": {"$in": ["completed", "live", "upcoming"]},
        }
        if course_id:
            base_query["courseId"] = course_id

        sort_field = "createdAt"
        sort_order = -1  # newest first

        prev_session = await database.sessions.find_one(base_query, sort=[(sort_field, sort_order)])

        if not prev_session and course_id:
            # Retry without course filter (any session from this instructor)
            del base_query["courseId"]
            prev_session = await database.sessions.find_one(base_query, sort=[(sort_field, sort_order)])

        if prev_session:
            prev_sid = str(prev_session["_id"])
            has_questions = await database.questions.count_documents({"sessionId": prev_sid})
            if has_questions > 0:
                print(f"📝 Found previous session {prev_sid} with {has_questions} questions")
                return prev_session
            # If the most recent one has no questions, search further back
            base_query["_id"] = {"$ne": ObjectId(current_session_id), "$lt": prev_session["_id"]}
            if course_id:
                base_query["courseId"] = course_id
            async for s in database.sessions.find(base_query).sort(sort_field, sort_order).limit(5):
                s_id = str(s["_id"])
                count = await database.questions.count_documents({"sessionId": s_id})
                if count > 0:
                    print(f"📝 Found earlier session {s_id} with {count} questions")
                    return s

        return None

    @staticmethod
    def split_generic_and_cluster(questions: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        """
        Split questions into generic and cluster-specific lists.
        Returns (generic_questions, cluster_questions).
        """
        generic = []
        cluster = []
        for q in questions:
            qtype = q.get("questionType", "generic")
            if qtype == "cluster":
                cluster.append(q)
            else:
                generic.append(q)
        return generic, cluster

