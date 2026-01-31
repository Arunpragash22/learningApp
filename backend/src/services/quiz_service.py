from typing import Dict, List, Optional
from datetime import datetime
import random
from ..models.question import Question
from ..models.quiz_answer import QuizAnswer
from ..models.quiz_answer_model import QuizAnswerModel
from ..models.quiz_performance import QuizPerformance, PerformanceByCluster, TopPerformer
from ..models.question_assignment_model import QuestionAssignmentModel
from ..models.question_session_model import QuestionSessionModel
from ..models.session_participant_model import SessionParticipantModel


class QuizService:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(QuizService, cls).__new__(cls)
        return cls._instance

    async def _initialize_mock_data(self):
        """Initialize mock questions if they don't exist"""
        # Check if questions already exist
        existing_questions = await Question.find_all()
        if len(existing_questions) > 0:
            return  # Questions already exist
        
        # Create mock questions for testing
        await Question.create({
            "question": "What is the primary purpose of backpropagation in neural networks?",
            "options": [
                "To initialize weights randomly",
                "To update weights based on error gradients",
                "To add more layers to the network",
                "To visualize the network structure"
            ],
            "correctAnswer": 1,
            "difficulty": "medium",
            "category": "Neural Networks",
        })

        await Question.create({
            "question": "Which activation function is commonly used in hidden layers?",
            "options": [
                "Sigmoid",
                "ReLU",
                "Linear",
                "Step function"
            ],
            "correctAnswer": 1,
            "difficulty": "easy",
            "category": "Neural Networks",
        })

        await Question.create({
            "question": "What is the main advantage of using dropout in neural networks?",
            "options": [
                "Increases training speed",
                "Prevents overfitting",
                "Reduces model size",
                "Improves accuracy on all datasets"
            ],
            "correctAnswer": 1,
            "difficulty": "hard",
            "category": "Neural Networks",
        })

    async def submit_answer(self, answer: QuizAnswer) -> Dict:
        """Store answer in MongoDB. Idempotent: same student+question+session counted once."""
        await self._initialize_mock_data()

        # Idempotent: if student already answered this question in this session, return existing result
        existing = await QuizAnswerModel.find_one_by_student_question_session(
            answer.studentId, answer.questionId, answer.sessionId
        )
        if existing is not None:
            return {
                "success": True,
                "isCorrect": existing.get("isCorrect") is True,
            }
        # Get question to check correctness before storing
        question = await Question.find_by_id(answer.questionId)
        is_correct = question and answer.answerIndex == question.get("correctAnswer")

        # Store answer with isCorrect so session stats can be rehydrated
        stored_answer = await QuizAnswerModel.create(answer, is_correct=is_correct or False)

        session_state = await QuestionSessionModel.get_state(answer.sessionId)
        activation_version = session_state.get("version") if session_state else None

        # Mark assignment as answered (if exists)
        await QuestionAssignmentModel.mark_answered(
            session_id=answer.sessionId,
            student_id=answer.studentId,
            question_id=answer.questionId,
            is_correct=is_correct or False,
            answer_id=stored_answer.get("id") if stored_answer else None,
            time_taken=answer.timeTaken,
            answer_index=answer.answerIndex,
            activation_version=activation_version
        )

        return {
            "success": True,
            "isCorrect": is_correct or False,
        }

    async def get_performance(self, question_id: str, session_id: str) -> QuizPerformance:
        """Get performance data from MongoDB"""
        await self._initialize_mock_data()
        
        # Get answers from database
        answer_docs = await QuizAnswerModel.find_by_question_and_session(question_id, session_id)
        
        if len(answer_docs) == 0:
            return QuizPerformance(
                totalStudents=0,
                answeredStudents=0,
                correctAnswers=0,
                averageTime=0,
                correctPercentage=0,
                performanceByCluster=[],
                topPerformers=[],
            )

        question = await Question.find_by_id(question_id)
        if not question:
            raise ValueError("Question not found")

        # Convert answer docs to QuizAnswer objects for processing
        session_answers = [
            QuizAnswer(**{k: v for k, v in doc.items() if k != "id" and k != "_id"})
            for doc in answer_docs
        ]

        correct_answers = sum(
            1 for a in session_answers
            if a.answerIndex == question.get("correctAnswer")
        )

        average_time = (
            sum(a.timeTaken for a in session_answers) / len(session_answers)
            if session_answers else 0
        )

        # Get top performers
        top_performers = [
            TopPerformer(
                studentName=f"Student {a.studentId[:8]}",
                isCorrect=a.answerIndex == question.get("correctAnswer"),
                timeTaken=a.timeTaken,
            )
            for a in session_answers[-10:]
        ]

        # Calculate performance by cluster (mock data for now)
        performance_by_cluster = [
            PerformanceByCluster(
                clusterName="Active Participants",
                answered=int(len(session_answers) * 0.6),
                correct=int(correct_answers * 0.7),
                percentage=83.3,
            ),
            PerformanceByCluster(
                clusterName="Moderate Participants",
                answered=int(len(session_answers) * 0.3),
                correct=int(correct_answers * 0.25),
                percentage=62.5,
            ),
            PerformanceByCluster(
                clusterName="At-Risk Students",
                answered=int(len(session_answers) * 0.1),
                correct=int(correct_answers * 0.05),
                percentage=0,
            ),
        ]

        return QuizPerformance(
            totalStudents=32,  # TODO: Get from session
            answeredStudents=len(session_answers),
            correctAnswers=correct_answers,
            averageTime=average_time,
            correctPercentage=(correct_answers / len(session_answers) * 100) if session_answers else 0,
            performanceByCluster=performance_by_cluster,
            topPerformers=top_performers,
        )

    async def trigger_question(self, question_id: str, session_id: str) -> Dict:
        """Trigger question - activate individual question mode so each student gets a different question"""
        # Activate individual question mode - each student will get a different question
        activation_state = await QuestionSessionModel.activate(session_id, mode="individual")
        
        # Clear previous answers for this session
        await QuizAnswerModel.delete_by_session(session_id)
        await QuestionAssignmentModel.reset_session(session_id)

        # TODO: Emit Socket.IO event to all students in session
        # io.to(sessionId).emit('question:triggered', { mode: "individual" })

        return {
            "success": True, 
            "mode": "individual",
            "version": activation_state.get("version"),
            "message": "Individual questions activated - each student will receive a unique question"
        }

    async def trigger_individual_questions(self, session_id: str) -> Dict:
        """Prepare session for individualized questions"""
        await QuestionAssignmentModel.reset_session(session_id)
        await QuizAnswerModel.delete_by_session(session_id)
        activation_state = await QuestionSessionModel.activate(session_id, mode="individual")
        return {"success": True, "mode": "individual", "version": activation_state.get("version")}

    async def get_assignment_for_student(self, session_id: str, student_id: str) -> Dict:
        """Fetch or create a personalized question assignment for a student.
        
        IMPORTANT: Only students who have joined the session (are participants) 
        will receive question assignments. Students who haven't joined will get
        notParticipant: True response.
        """
        session_state = await QuestionSessionModel.get_state(session_id)
        if not session_state or not session_state.get("active"):
            return {"active": False}

        activation_version = session_state.get("version", 1)

        # Check if student has an existing assignment first
        assignment = await QuestionAssignmentModel.find_for_student(session_id, student_id, activation_version)

        if assignment:
            if assignment.get("answered"):
                return {
                    "active": True,
                    "assignmentId": assignment.get("id"),
                    "completed": True
                }

            question = await Question.find_by_id(assignment.get("questionId"))
            if question:
                return {
                    "active": True,
                    "assignmentId": assignment.get("id"),
                    "question": question,
                    "completed": False
                }

        # ============ PARTICIPANT CHECK ============
        # Only create new assignment if student is a participant (joined session before trigger)
        is_participant = await SessionParticipantModel.is_participant(session_id, student_id)
        
        if not is_participant:
            # Student hasn't joined the session - don't give them a question
            return {
                "active": True,
                "notParticipant": True,
                "message": "You must join the session before the quiz is triggered to participate"
            }

        # Need to create a new assignment for participant
        questions = await Question.find_all()
        if not questions:
            await self._initialize_mock_data()
            questions = await Question.find_all()

        if not questions:
            raise ValueError("No questions available in the database")

        active_question_ids = await QuestionAssignmentModel.find_active_question_ids(session_id, activation_version)
        available_questions = [
            q for q in questions
            if str(q.get("id")) not in active_question_ids
        ]

        if not available_questions:
            available_questions = questions

        question = random.choice(available_questions)
        assignment = await QuestionAssignmentModel.create(session_id, student_id, question.get("id"), activation_version)

        return {
            "active": True,
            "assignmentId": assignment.get("id"),
            "question": question,
            "completed": False
        }

