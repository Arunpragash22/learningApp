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

        # ── Auto-trigger preprocessing + KMeans clustering ──
        # Every answer (generic or cluster) triggers preprocessing AND clustering.
        # Generic answers build the INITIAL clusters; cluster answers RE-cluster.
        # Pass student_id so a corrected feedback_update is pushed after clustering.
        asyncio.create_task(
            self._run_preprocessing_and_clustering(
                answer.sessionId,
                run_clustering=True,
                student_id=answer.studentId,
            )
        )

        return {
            "success": True,
            "isCorrect": is_correct or False,
        }

    async def _run_preprocessing_and_clustering(
        self, session_id: str, run_clustering: bool = True, student_id: str = None
    ) -> None:
        """
        Background task: preprocess engagement data and run KMeans clustering.

        Every student answer triggers preprocessing + clustering so that:
        - Generic answers build the INITIAL cluster assignments
        - Cluster answers RE-cluster with updated engagement data

        After clustering completes, pushes updated feedback to the student
        via WebSocket so the dashboard reflects the correct cluster immediately.

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
                    print(f"📋 [BG] Preprocessing done, clustering skipped (flag=False)")
                    return

                # Step 2: Run KMeans model and update clusters
                print(f"🔄 [BG] Step 2: Running KMeans clustering...")
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

                # Stamp the student's latest quiz_answer with their fresh cluster
                # so the per-question cluster timeline graph shows actual changes.
                if student_id:
                    await self._stamp_cluster_on_latest_answer(session_id, student_id)

                # Push corrected feedback to the student now that clusters are fresh
                if student_id:
                    await self._push_post_clustering_feedback(session_id, student_id)

            except Exception as e:
                import traceback
                print(f"❌ [BG] Background preprocessing/clustering error: {e}")
                traceback.print_exc()

    async def _stamp_cluster_on_latest_answer(self, session_id: str, student_id: str):
        """Save the student's current cluster on their most recent quiz_answer.

        Called right after clustering completes so each answer carries the
        cluster assignment that was computed using that answer's data.
        This powers the per-question cluster timeline graph.
        """
        try:
            from ..database.connection import get_database
            from ..models.cluster_model import ClusterModel

            db = get_database()
            if db is None:
                return

            # Resolve all session ID variants
            all_ids = [session_id]
            try:
                from bson import ObjectId
                if len(session_id) == 24:
                    doc = await db.sessions.find_one({"_id": ObjectId(session_id)}, {"zoomMeetingId": 1})
                    if doc and doc.get("zoomMeetingId"):
                        z = str(doc["zoomMeetingId"])
                        if z not in all_ids:
                            all_ids.append(z)
                for variant in ([session_id] + ([int(session_id)] if session_id.isdigit() else [])):
                    doc = await db.sessions.find_one({"zoomMeetingId": variant}, {"_id": 1, "zoomMeetingId": 1})
                    if doc:
                        mid = str(doc["_id"])
                        if mid not in all_ids:
                            all_ids.append(mid)
                        zv = doc.get("zoomMeetingId")
                        if zv and str(zv) not in all_ids:
                            all_ids.append(str(zv))
            except Exception:
                pass

            # Get student's cluster from the freshly computed clusters
            student_cluster = None
            for sid in all_ids:
                cluster_map = await ClusterModel.get_student_cluster_map(sid)
                if cluster_map and student_id in cluster_map:
                    student_cluster = cluster_map[student_id]
                    break

            if not student_cluster:
                return

            # Find the student's most recent answer in this session and stamp it
            latest_answer = await db.quiz_answers.find_one(
                {"studentId": student_id, "sessionId": {"$in": all_ids}},
                sort=[("timestamp", -1)],
            )
            if latest_answer:
                await db.quiz_answers.update_one(
                    {"_id": latest_answer["_id"]},
                    {"$set": {"clusterAtAnswer": student_cluster}},
                )
                print(f"📌 [BG] Stamped clusterAtAnswer={student_cluster} on answer {latest_answer['_id']}")
        except Exception as e:
            print(f"⚠️ [BG] Failed to stamp clusterAtAnswer: {e}")

    async def _push_post_clustering_feedback(self, session_id: str, student_id: str):
        """Push corrected feedback via WebSocket after clustering completes.

        The initial feedback_update (sent immediately after answer submit)
        may carry a stale cluster label because clustering hadn't finished yet.
        This re-sends the feedback with the freshly computed cluster so the
        student dashboard shows the correct cluster immediately.
        """
        try:
            from ..services.feedback_service import get_student_feedback
            from ..services.ws_manager import ws_manager

            fb = await get_student_feedback(session_id, student_id)
            if not fb:
                return

            message = {
                "type": "feedback_update",
                "feedback": {
                    "type": fb.get("type", "encouragement"),
                    "message": fb.get("message", ""),
                    "clusterContext": fb.get("clusterContext", ""),
                    "suggestions": fb.get("suggestions", []),
                    "cluster_label": fb.get("cluster_label", "Moderate"),
                },
                "stats": {
                    "accuracy": fb.get("accuracy"),
                    "totalAttempts": fb.get("totalAttempts", 0),
                    "correctAnswers": fb.get("correctAnswers", 0),
                    "responseTime": fb.get("medianResponseTime"),
                    "cluster": fb.get("cluster_label", "Moderate"),
                    "history": fb.get("history", []),
                },
            }

            sent = await ws_manager.send_to_student_in_session(session_id, student_id, message)
            if not sent:
                from ..database.connection import get_database
                db = get_database()
                if db:
                    alt_ids = []
                    try:
                        from bson import ObjectId
                        if len(session_id) == 24:
                            doc = await db.sessions.find_one({"_id": ObjectId(session_id)}, {"zoomMeetingId": 1})
                            if doc and doc.get("zoomMeetingId"):
                                alt_ids.append(str(doc["zoomMeetingId"]))
                    except Exception:
                        pass
                    for variant in ([session_id] + ([int(session_id)] if session_id.isdigit() else [])):
                        try:
                            doc = await db.sessions.find_one({"zoomMeetingId": variant}, {"_id": 1})
                            if doc:
                                alt_ids.append(str(doc["_id"]))
                        except Exception:
                            pass
                    for alt in alt_ids:
                        if alt != session_id:
                            sent = await ws_manager.send_to_student_in_session(alt, student_id, message)
                            if sent:
                                break

            print(f"{'✅' if sent else '⚠️'} [BG] Post-clustering feedback push to {student_id[:12]}... "
                  f"(cluster={fb.get('cluster_label', '?')})")
        except Exception as e:
            print(f"⚠️ [BG] Failed to push post-clustering feedback: {e}")

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

        # ── First question = generic, subsequent = cluster-wise ──
        # Check if this student has already answered any question in this session.
        # If not, this is their first question → always generic.
        # If yes, use cluster-specific questions (fall back to generic if none).
        from ..models.cluster_model import ClusterModel
        student_cluster = None
        has_clustering = False
        is_first_question = True
        try:
            answered_ids = await QuizAnswerModel.get_answered_question_ids(student_id, session_id)
            if len(answered_ids) > 0:
                is_first_question = False
        except Exception:
            pass

        try:
            cluster_map = await ClusterModel.get_student_cluster_map(session_id)
            if cluster_map:
                has_clustering = True
                student_cluster = cluster_map.get(student_id)
        except Exception as cluster_err:
            print(f"⚠️ Could not load cluster for student {student_id}: {cluster_err}")

        generic_qs = [q for q in questions if q.get("questionType", "generic") == "generic" or not q.get("questionType")]

        if is_first_question:
            eligible_questions = generic_qs if generic_qs else questions
            print(f"🟢 First question for {student_id[:12]}... → GENERIC only")
        elif has_clustering and student_cluster:
            cluster_qs = [
                q for q in questions
                if q.get("questionType") == "cluster"
                and q.get("category", "").lower() == student_cluster
            ]
            eligible_questions = cluster_qs if cluster_qs else generic_qs
            print(f"🔵 Subsequent question for {student_id[:12]}... (cluster={student_cluster}) → CLUSTER-WISE")
        else:
            eligible_questions = generic_qs if generic_qs else questions

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

