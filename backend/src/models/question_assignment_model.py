from typing import List, Optional
from datetime import datetime
from bson import ObjectId
from ..database.connection import get_database


class QuestionAssignmentModel:
    @staticmethod
    async def create(
        session_id: str,
        student_id: str,
        question_id: str,
        activation_version: int,
        round_id: Optional[str] = None,
    ) -> Optional[dict]:
        """Create a question assignment for a student"""
        database = get_database()
        if database is None:
            raise Exception("Database not connected")

        assignment = {
            "sessionId": session_id,
            "studentId": student_id,
            "questionId": question_id,
            "assignedAt": datetime.utcnow(),
            "answered": False,
            "activationVersion": activation_version,
            "roundId": round_id,
        }

        result = await database.question_assignments.insert_one(assignment)
        assignment["id"] = str(result.inserted_id)
        return assignment

    @staticmethod
    async def find_active(session_id: str, student_id: str, activation_version: int) -> Optional[dict]:
        """Find active (unanswered) assignment for a student in current activation cycle"""
        database = get_database()
        if database is None:
            return None

        assignment = await database.question_assignments.find_one({
            "sessionId": session_id,
            "studentId": student_id,
            "answered": False,
            "activationVersion": activation_version
        })

        if assignment:
            assignment["id"] = str(assignment["_id"])
            del assignment["_id"]
        return assignment

    @staticmethod
    async def find_for_student(session_id: str, student_id: str, activation_version: int) -> Optional[dict]:
        """Find assignment for a student regardless of answered status"""
        database = get_database()
        if database is None:
            return None

        assignment = await database.question_assignments.find_one({
            "sessionId": session_id,
            "studentId": student_id,
            "activationVersion": activation_version
        })

        if assignment:
            assignment["id"] = str(assignment["_id"])
            del assignment["_id"]
        return assignment

    @staticmethod
    async def find_active_question_ids(session_id: str, activation_version: int) -> List[str]:
        """Return list of question IDs currently assigned (not yet answered) in a session"""
        database = get_database()
        if database is None:
            return []

        question_ids: List[str] = []
        async for assignment in database.question_assignments.find({
            "sessionId": session_id,
            "answered": False,
            "activationVersion": activation_version
        }):
            question_ids.append(str(assignment.get("questionId")))
        return question_ids

    @staticmethod
    async def reset_session(session_id: str) -> int:
        """Remove all assignments for a session"""
        database = get_database()
        if database is None:
            return 0

        result = await database.question_assignments.delete_many({
            "sessionId": session_id
        })
        return result.deleted_count

    @staticmethod
    async def mark_answered(
        session_id: str,
        student_id: str,
        question_id: str,
        is_correct: bool,
        answer_id: Optional[str] = None,
        time_taken: Optional[float] = None,
        answer_index: Optional[int] = None,
        activation_version: Optional[int] = None
    ) -> bool:
        """Mark an assignment as answered and store summary"""
        database = get_database()
        if database is None:
            return False

        filter_query = {
            "sessionId": session_id,
            "studentId": student_id,
            "questionId": question_id
        }
        if activation_version is not None:
            filter_query["activationVersion"] = activation_version

        update_result = await database.question_assignments.update_one(
            filter_query,
            {
                "$set": {
                    "answered": True,
                    "answeredAt": datetime.utcnow(),
                    "isCorrect": is_correct,
                    "answerId": answer_id,
                    "timeTaken": time_taken,
                    "answerIndex": answer_index
                }
            }
        )
        return update_result.modified_count > 0

