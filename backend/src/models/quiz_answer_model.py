from typing import List, Optional
from datetime import datetime
from bson import ObjectId
import asyncio
from ..database.connection import get_database
from .quiz_answer import QuizAnswer


class QuizAnswerModel:
    @staticmethod
    async def create(answer: QuizAnswer, is_correct: Optional[bool] = None) -> dict:
        """Store a quiz answer. Optionally set is_correct for session stats."""
        database = get_database()
        if database is None:
            raise Exception("Database not connected")

        answer_data = answer.model_dump()
        answer_data["timestamp"] = datetime.now()
        if is_correct is not None:
            answer_data["isCorrect"] = is_correct

        result = await database.quiz_answers.insert_one(answer_data)
        answer_data["id"] = str(result.inserted_id)
        
        # ============================================================
        # MYSQL BACKUP: Auto-backup new quiz answer (non-blocking)
        # ============================================================
        try:
            from ..services.mysql_backup_service import mysql_backup_service
            asyncio.create_task(mysql_backup_service.backup_quiz_answer(answer_data))
            print(f"📦 MySQL backup triggered for quiz_answer: {answer_data['id']}")
        except Exception as e:
            print(f"⚠️ MySQL quiz_answer backup failed (non-fatal): {e}")
        
        return answer_data

    @staticmethod
    async def find_by_question(question_id: str) -> List[dict]:
        """Find all answers for a question"""
        database = get_database()
        if database is None:
            return []
        
        answers = []
        async for answer in database.quiz_answers.find({"questionId": question_id}):
            answer["id"] = str(answer["_id"])
            del answer["_id"]
            answers.append(answer)
        return answers

    @staticmethod
    async def find_by_question_and_session(question_id: str, session_id: str) -> List[dict]:
        """Find answers for a question in a specific session"""
        database = get_database()
        if database is None:
            return []

        answers = []
        async for answer in database.quiz_answers.find({
            "questionId": question_id,
            "sessionId": session_id
        }):
            answer["id"] = str(answer["_id"])
            del answer["_id"]
            answers.append(answer)
        return answers

    @staticmethod
    async def find_one_by_student_question_session(
        student_id: str, question_id: str, session_id: str
    ) -> Optional[dict]:
        """Find one answer by student + question + session (for idempotent submit check)."""
        database = get_database()
        if database is None:
            return None
        session_ids = [session_id]
        try:
            if database.sessions is not None:
                if session_id.isdigit():
                    doc = await database.sessions.find_one({"zoomMeetingId": int(session_id)})
                else:
                    doc = await database.sessions.find_one({"zoomMeetingId": session_id})
                if not doc:
                    try:
                        doc = await database.sessions.find_one({"_id": ObjectId(session_id)})
                    except Exception:
                        pass
                if doc:
                    mongo_id = str(doc["_id"])
                    zoom_id = doc.get("zoomMeetingId")
                    if mongo_id not in session_ids:
                        session_ids.append(mongo_id)
                    if zoom_id is not None and str(zoom_id) not in session_ids:
                        session_ids.append(str(zoom_id))
        except Exception:
            pass
        doc = await database.quiz_answers.find_one({
            "studentId": student_id,
            "questionId": question_id,
            "sessionId": {"$in": session_ids},
        })
        if not doc:
            return None
        doc["id"] = str(doc["_id"])
        del doc["_id"]
        return doc

    @staticmethod
    async def get_answered_question_ids(student_id: str, session_id: str) -> List[str]:
        """Return list of question IDs this student has already answered in this session."""
        database = get_database()
        if database is None:
            return []
        session_ids = [session_id]
        try:
            if database.sessions is not None:
                if session_id.isdigit():
                    doc = await database.sessions.find_one({"zoomMeetingId": int(session_id)})
                else:
                    doc = await database.sessions.find_one({"zoomMeetingId": session_id})
                if not doc:
                    try:
                        doc = await database.sessions.find_one({"_id": ObjectId(session_id)})
                    except Exception:
                        pass
                if doc:
                    mongo_id = str(doc["_id"])
                    zoom_id = doc.get("zoomMeetingId")
                    if mongo_id not in session_ids:
                        session_ids.append(mongo_id)
                    if zoom_id is not None and str(zoom_id) not in session_ids:
                        session_ids.append(str(zoom_id))
        except Exception:
            pass
        cursor = database.quiz_answers.find(
            {"studentId": student_id, "sessionId": {"$in": session_ids}},
            {"questionId": 1},
        )
        ids = []
        async for doc in cursor:
            qid = doc.get("questionId")
            if qid and qid not in ids:
                ids.append(qid)
        return ids

    @staticmethod
    async def delete_by_question_and_session(question_id: str, session_id: str) -> int:
        """Delete answers for a question in a session"""
        database = get_database()
        if database is None:
            return 0
        
        result = await database.quiz_answers.delete_many({
            "questionId": question_id,
            "sessionId": session_id
        })
        return result.deleted_count

    @staticmethod
    async def delete_by_session(session_id: str) -> int:
        """Delete all answers for a specific session"""
        database = get_database()
        if database is None:
            return 0

        result = await database.quiz_answers.delete_many({
            "sessionId": session_id
        })
        return result.deleted_count

    @staticmethod
    async def get_student_session_stats(student_id: str, session_id: str) -> dict:
        """
        Get cumulative stats for a student in a session (for dashboard rehydration).
        Answers may be stored with zoom meeting id or mongo session id; resolve both.
        """
        database = get_database()
        if database is None:
            return {"questionsAnswered": 0, "correctAnswers": 0, "questionsReceived": 0}

        session_ids = [session_id]
        try:
            if database.sessions is not None:
                from bson import ObjectId
                if session_id.isdigit():
                    doc = await database.sessions.find_one({"zoomMeetingId": int(session_id)})
                else:
                    doc = await database.sessions.find_one({"zoomMeetingId": session_id})
                if not doc:
                    try:
                        doc = await database.sessions.find_one({"_id": ObjectId(session_id)})
                    except Exception:
                        pass
                if doc:
                    mongo_id = str(doc["_id"])
                    zoom_id = doc.get("zoomMeetingId")
                    if mongo_id not in session_ids:
                        session_ids.append(mongo_id)
                    if zoom_id is not None and str(zoom_id) not in session_ids:
                        session_ids.append(str(zoom_id))
        except Exception:
            pass

        student_filter = {"studentId": student_id, "sessionId": {"$in": session_ids}}
        session_filter = {"sessionId": {"$in": session_ids}}
        cursor = database.quiz_answers.find(student_filter)
        questions_answered = 0
        correct_answers = 0
        answered_question_ids = []
        async for doc in cursor:
            questions_answered += 1
            if doc.get("isCorrect") is True:
                correct_answers += 1
            qid = doc.get("questionId")
            if qid and qid not in answered_question_ids:
                answered_question_ids.append(qid)

        distinct = await database.quiz_answers.distinct("questionId", session_filter)
        questions_received = len(distinct)

        return {
            "questionsAnswered": questions_answered,
            "correctAnswers": correct_answers,
            "questionsReceived": max(questions_received, questions_answered),
            "answeredQuestionIds": answered_question_ids,
        }
