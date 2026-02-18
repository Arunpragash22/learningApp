from typing import Dict, List, Optional
from datetime import datetime
import random
import asyncio
from ..models.question import Question
from ..models.quiz_answer import QuizAnswer
from ..models.quiz_answer_model import QuizAnswerModel
from ..models.quiz_performance import QuizPerformance, PerformanceByCluster, TopPerformer
from ..models.question_assignment_model import QuestionAssignmentModel
from ..models.question_session_model import QuestionSessionModel
from ..models.session_participant_model import SessionParticipantModel


class QuizService:
    _instance = None
    # Per-session lock to prevent concurrent preprocessing/clustering
    _clustering_locks: Dict[str, asyncio.Lock] = {}

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

        # ── Auto-trigger preprocessing (+ optional KMeans clustering) ──
        # Generic answers: preprocess only (collect data, no clustering)
        # Cluster answers: preprocess + re-cluster (update labels)
        question_type = (question.get("questionType") or "generic") if question else "generic"
        asyncio.create_task(
            self._run_preprocessing_and_clustering(
                answer.sessionId,
                run_clustering=(question_type == "cluster"),
            )
        )

        return {
            "success": True,
            "isCorrect": is_correct or False,
        }

    async def _run_preprocessing_and_clustering(
        self, session_id: str, run_clustering: bool = True
    ) -> None:
        """
        Background task: preprocess engagement data and optionally run KMeans.

        - Generic answers  → run_clustering=False (preprocess only, collect data)
        - Cluster answers  → run_clustering=True  (preprocess + KMeans re-cluster)

        Uses a per-session lock so that concurrent submissions don't
        create duplicate cluster documents (race condition).
        """
        if session_id not in self._clustering_locks:
            self._clustering_locks[session_id] = asyncio.Lock()
        lock = self._clustering_locks[session_id]

        if lock.locked():
            print(f"⏭️  [BG] Skipping for {session_id} — already in progress")
            return

        async with lock:
            try:
                from ..models.preprocessing import PreprocessingService
                from .clustering_service import ClusteringService
                from ..database.connection import get_database

                # ── Resolve session ID ──────────────────────────────────
                mongo_session_id = session_id
                db = get_database()
                if db is not None:
                    session_doc = await db.sessions.find_one({"zoomMeetingId": session_id})
                    if not session_doc and session_id.isdigit():
                        session_doc = await db.sessions.find_one({"zoomMeetingId": int(session_id)})
                    if session_doc:
                        mongo_session_id = str(session_doc["_id"])
                        print(f"🔗 [BG] Resolved Zoom ID {session_id} → MongoDB ID {mongo_session_id}")

                # Step 1: Preprocess (always runs — data collection)
                print(f"🔄 [BG] Step 1: Preprocessing for session {session_id}...")
                preprocessing = PreprocessingService()
                docs = await preprocessing.run(session_id)
                print(f"{'✅' if docs else '⚠️'} [BG] Preprocessing: {len(docs) if docs else 0} rows")

                if not docs:
                    print(f"⚠️  [BG] No data to process for session {session_id}")
                    return

                if not run_clustering:
                    print(f"📋 [BG] Generic answer — preprocessing done, clustering skipped")
                    return

                # Step 2: Run KMeans model and update clusters
                # Only reached for cluster-type question answers
                print(f"🔄 [BG] Step 2: Running KMeans re-clustering (cluster answer)...")
                clustering = ClusteringService()

                clusters = await clustering.update_clusters(session_id)
                print(f"✅ [BG] Re-clustering complete for session {session_id}: "
                      f"{len(clusters)} clusters → "
                      f"[{', '.join(f'{c.engagementLevel}:{c.studentCount}' for c in clusters)}]")

                # Also store under MongoDB ID (for the instructor frontend)
                if mongo_session_id != session_id:
                    print(f"🔗 [BG] Also storing clusters under MongoDB ID: {mongo_session_id}")
                    from ..models.cluster_model import ClusterModel
                    await ClusterModel.update_clusters_for_session(mongo_session_id, clusters)
                    print(f"✅ [BG] Clusters also saved under MongoDB ID: {mongo_session_id}")

            except Exception as e:
                import traceback
                print(f"❌ [BG] Background preprocessing/clustering error: {e}")
                traceback.print_exc()

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

        # ── Two-phase cluster-aware filtering ──
        # Phase 1 (no clustering): ONLY generic questions
        # Phase 2 (clustering done): ONLY cluster-specific questions for this student
        # get_student_cluster_map now auto-resolves alternate session IDs (MongoDB ↔ Zoom)
        from ..models.cluster_model import ClusterModel
        student_cluster = None
        has_clustering = False
        try:
            cluster_map = await ClusterModel.get_student_cluster_map(session_id)
            if cluster_map:
                has_clustering = True
                student_cluster = cluster_map.get(student_id)
        except Exception as cluster_err:
            print(f"⚠️ Could not load cluster for student {student_id}: {cluster_err}")

        generic_qs = [q for q in questions if q.get("questionType", "generic") == "generic" or not q.get("questionType")]

        if has_clustering and student_cluster:
            # Phase 2: ONLY cluster-specific questions
            cluster_qs = [q for q in questions if q.get("questionType") == "cluster" and q.get("targetCluster") == student_cluster]
            eligible_questions = cluster_qs if cluster_qs else generic_qs
        else:
            # Phase 1: ONLY generic questions
            eligible_questions = generic_qs

        if not eligible_questions:
            eligible_questions = questions

        active_question_ids = await QuestionAssignmentModel.find_active_question_ids(session_id, activation_version)
        available_questions = [
            q for q in eligible_questions
            if str(q.get("id")) not in active_question_ids
        ]

        if not available_questions:
            available_questions = eligible_questions

        question = random.choice(available_questions)
        print(f"🎲 Assigned question to {student_id[:12]}... (cluster={student_cluster or 'none'}) → [{question.get('questionType', 'generic')}]")
        assignment = await QuestionAssignmentModel.create(session_id, student_id, question.get("id"), activation_version)

        return {
            "active": True,
            "assignmentId": assignment.get("id"),
            "question": question,
            "completed": False
        }

