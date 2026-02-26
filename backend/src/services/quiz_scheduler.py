"""
Quiz Scheduler Service
Automated question triggering for live sessions

Features:
- Auto-trigger first question 2 minutes after session starts
- Auto-trigger subsequent questions every 10 minutes
- Each question sent only once (tracks sent question IDs per session)
- Stops when session ends
"""
import asyncio
from typing import Dict, Set, Optional
from datetime import datetime
import random
from bson import ObjectId


class QuizScheduler:
    """
    Manages automated quiz delivery for live sessions.
    
    Configuration (per session):
    - first_delay_seconds: Delay before first question (default: 120 = 2 minutes)
    - interval_seconds: Interval between subsequent questions (default: 600 = 10 minutes)
    - max_questions: Maximum questions to auto-trigger (default: None = unlimited)
    - stagger_window_seconds: Time window within which each student receives the
      question at a DIFFERENT random time (default: 1/3 of interval_seconds).
      E.g. interval=1800s (30 min) → stagger_window=600s (10 min):
      each student gets the question at a random time within those first 10 minutes.
    """
    
    def __init__(self):
        # Active session schedules: {session_id: {"task": asyncio.Task, "config": {...}}}
        self.active_schedules: Dict[str, dict] = {}
        
        # Sent questions per session: {session_id: set(question_ids)}
        self.sent_questions: Dict[str, Set[str]] = {}
        
        # Default configuration
        self.default_first_delay = 120  # 2 minutes
        self.default_interval = 600     # 10 minutes
        self.default_max_questions = None  # Unlimited
        self.default_stagger_window = None  # None = auto (1/3 of interval)
    
    async def start_automation(
        self,
        session_id: str,
        zoom_meeting_id: Optional[str] = None,
        first_delay_seconds: int = None,
        interval_seconds: int = None,
        max_questions: int = None,
        stagger_window_seconds: int = None
    ) -> dict:
        """
        Start automated question triggering for a session.
        
        Args:
            session_id: MongoDB session ID
            zoom_meeting_id: Zoom meeting ID (if available)
            first_delay_seconds: Delay before first question (default: 120s = 2min)
            interval_seconds: Interval between questions (default: 600s = 10min)
            max_questions: Max questions to send (default: unlimited)
            stagger_window_seconds: Time window for staggered delivery (default: 1/3 of interval).
                Each student receives the question at a random time within this window.
        
        Returns:
            Status dict with success and schedule info
        """
        # Cancel existing schedule if any
        if session_id in self.active_schedules:
            await self.stop_automation(session_id)
        
        effective_interval = interval_seconds or self.default_interval

        # Stagger window: if not provided, use 1/3 of the interval
        if stagger_window_seconds is not None:
            effective_stagger = stagger_window_seconds
        elif self.default_stagger_window is not None:
            effective_stagger = self.default_stagger_window
        else:
            effective_stagger = effective_interval // 3

        # Ensure stagger window doesn't exceed the interval
        effective_stagger = min(effective_stagger, effective_interval - 10)
        # At least 5 seconds of spread (if interval is large enough)
        effective_stagger = max(effective_stagger, 5) if effective_interval > 15 else 0

        config = {
            "session_id": session_id,
            "zoom_meeting_id": zoom_meeting_id,
            "first_delay_seconds": first_delay_seconds or self.default_first_delay,
            "interval_seconds": effective_interval,
            "stagger_window_seconds": effective_stagger,
            "max_questions": max_questions or self.default_max_questions,
            "started_at": datetime.utcnow().isoformat(),
            "questions_sent": 0,
            "enabled": True
        }
        
        # Initialize sent questions tracking
        if session_id not in self.sent_questions:
            self.sent_questions[session_id] = set()
        
        # Create background task for this session
        task = asyncio.create_task(self._run_schedule(config))
        
        self.active_schedules[session_id] = {
            "task": task,
            "config": config
        }
        
        print(f"🤖 Quiz automation STARTED for session {session_id}")
        print(f"   First question in: {config['first_delay_seconds']} seconds")
        print(f"   Interval: {config['interval_seconds']} seconds")
        print(f"   Stagger window: {config['stagger_window_seconds']} seconds "
              f"(each student gets question at a random time within this window)")
        
        return {
            "success": True,
            "message": "Quiz automation started",
            "session_id": session_id,
            "first_trigger_in_seconds": config["first_delay_seconds"],
            "interval_seconds": config["interval_seconds"],
            "stagger_window_seconds": config["stagger_window_seconds"]
        }
    
    async def stop_automation(self, session_id: str) -> dict:
        """
        Stop automated question triggering for a session.
        Called when session ends or instructor disables automation.
        """
        if session_id not in self.active_schedules:
            return {"success": False, "message": "No active automation for this session"}
        
        schedule = self.active_schedules[session_id]
        task = schedule.get("task")
        
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        questions_sent = schedule.get("config", {}).get("questions_sent", 0)
        del self.active_schedules[session_id]
        
        # Clean up sent questions tracking (keep for potential analytics)
        # Note: We keep self.sent_questions[session_id] for potential report generation
        
        print(f"🛑 Quiz automation STOPPED for session {session_id}")
        print(f"   Total questions auto-triggered: {questions_sent}")
        
        return {
            "success": True,
            "message": "Quiz automation stopped",
            "session_id": session_id,
            "questions_triggered": questions_sent
        }
    
    async def _run_schedule(self, config: dict):
        """
        Background task that runs the scheduled question delivery.
        First question after first_delay_seconds, then every interval_seconds.
        Each question is delivered to students at staggered random times
        within a configurable window (stagger_window_seconds).
        """
        session_id = config["session_id"]
        zoom_meeting_id = config.get("zoom_meeting_id")
        first_delay = config["first_delay_seconds"]
        max_questions = config.get("max_questions")
        
        try:
            print(f"⏰ Session {session_id}: Waiting {first_delay}s for first question...")
            await asyncio.sleep(first_delay)
            
            while True:
                if session_id not in self.active_schedules:
                    print(f"🛑 Session {session_id}: Automation stopped externally")
                    break
                
                schedule_info = self.active_schedules.get(session_id, {})
                current_config = schedule_info.get("config", {})
                
                if not current_config.get("enabled", True):
                    print(f"🛑 Session {session_id}: Automation disabled")
                    break
                
                questions_sent = current_config.get("questions_sent", 0)
                if max_questions is not None and questions_sent >= max_questions:
                    print(f"🏁 Session {session_id}: Reached max questions ({max_questions})")
                    break
                
                # Re-read config values each iteration
                interval = current_config.get("interval_seconds", 600)
                stagger_window = current_config.get("stagger_window_seconds", interval // 3)
                
                print(f"📤 Session {session_id}: Triggering question #{questions_sent + 1} "
                      f"(stagger window: {stagger_window}s)...")
                result = await self._trigger_question_staggered(
                    session_id, zoom_meeting_id, stagger_window
                )
                
                if result.get("success"):
                    current_config["questions_sent"] = questions_sent + 1
                    print(f"✅ Session {session_id}: Auto-triggered question #{questions_sent + 1} → "
                          f"{result.get('sentTo', 0)} students (staggered over {stagger_window}s)")
                else:
                    print(f"⚠️ Session {session_id}: Trigger failed - {result.get('message')} "
                          f"(will retry in {interval}s)")
                
                print(f"⏰ Session {session_id}: Next question in {interval}s...")
                await asyncio.sleep(interval)
                
        except asyncio.CancelledError:
            print(f"🛑 Session {session_id}: Schedule cancelled")
            raise
        except Exception as e:
            print(f"❌ Session {session_id}: Schedule error: {e}")
            import traceback
            traceback.print_exc()
    
    async def _trigger_question_staggered(
        self,
        session_id: str,
        zoom_meeting_id: Optional[str] = None,
        stagger_window: int = 0
    ) -> dict:
        """
        Staggered delivery with fallback + ordering:
          - Fallback: current session → previous session → general questions
          - Ordering: generic questions first, then cluster-specific
        """
        from ..database.connection import db
        from .ws_manager import ws_manager
        from ..models.cluster_model import ClusterModel
        from ..models.question_assignment_model import QuestionAssignmentModel
        from ..models.question import Question

        try:
            # ── 1. Find session doc ─────────────────────────────────────
            session_doc = None
            try:
                if len(session_id) == 24:
                    session_doc = await db.database.sessions.find_one(
                        {"_id": ObjectId(session_id)}
                    )
            except Exception:
                pass

            if not session_doc and zoom_meeting_id:
                try:
                    session_doc = await db.database.sessions.find_one(
                        {"zoomMeetingId": int(zoom_meeting_id)}
                    )
                except Exception:
                    session_doc = await db.database.sessions.find_one(
                        {"zoomMeetingId": zoom_meeting_id}
                    )

            # ── 2. Find questions with fallback ─────────────────────────
            instructor_id = session_doc.get("instructorId") if session_doc else None
            course_id = session_doc.get("courseId") if session_doc else None

            questions, q_source = await Question.find_for_session_with_fallback(
                session_id, instructor_id, course_id
            )
            print(f"📝 Auto-trigger: {len(questions)} questions (source: {q_source})")

            if not questions:
                return {"success": False, "message": "No questions found for this session"}

            generic_qs, cluster_qs_all = Question.split_generic_and_cluster(questions)

            # Merge cluster questions from selected source sessions
            if session_doc:
                try:
                    from ..routers.session import _normalize_cluster_sources, _fetch_cluster_questions_from_sources
                    source_ids = _normalize_cluster_sources(
                        session_doc.get("clusterQuestionSource"),
                        session_doc.get("instructorId"),
                    )
                    if source_ids:
                        prev_cluster_qs = await _fetch_cluster_questions_from_sources(
                            source_ids, session_doc.get("instructorId"), session_id
                        )
                        if prev_cluster_qs:
                            seen_ids = {q.get("id") or str(q.get("_id")) for q in cluster_qs_all}
                            for q in prev_cluster_qs:
                                qid = q.get("id") or str(q.get("_id"))
                                if qid not in seen_ids:
                                    cluster_qs_all.append(q)
                                    seen_ids.add(qid)
                            print(f"   📋 Auto-trigger: Merged to {len(cluster_qs_all)} cluster questions (current + source sessions {source_ids})")
                except Exception as prev_err:
                    print(f"   ⚠️ Auto-trigger: Failed to fetch cluster questions from sources: {prev_err}")

            print(f"   Generic: {len(generic_qs)} | Cluster-specific: {len(cluster_qs_all)}")

            # ── 3. Build cluster map ────────────────────────────────────
            student_cluster_map: Dict[str, str] = {}
            session_ids_to_check = [session_id]
            if zoom_meeting_id and zoom_meeting_id not in session_ids_to_check:
                session_ids_to_check.append(str(zoom_meeting_id))
            if session_doc:
                mongo_id = str(session_doc["_id"])
                if mongo_id not in session_ids_to_check:
                    session_ids_to_check.append(mongo_id)

            try:
                for sid in session_ids_to_check:
                    cmap = await ClusterModel.get_student_cluster_map(sid)
                    if cmap:
                        student_cluster_map.update(cmap)
            except Exception as e:
                print(f"⚠️ Auto-trigger: cluster lookup error (non-fatal): {e}")

            # If no clustering data yet, trigger clustering now so cluster
            # questions can be sent on subsequent rounds.
            if not student_cluster_map:
                try:
                    from ..services.clustering_service import ClusteringService
                    clustering_svc = ClusteringService()
                    for sid in session_ids_to_check:
                        await clustering_svc.update_clusters(sid)
                        cmap = await ClusterModel.get_student_cluster_map(sid)
                        if cmap:
                            student_cluster_map.update(cmap)
                        if student_cluster_map:
                            break
                    if student_cluster_map:
                        print(f"🔄 Auto-trigger: Triggered clustering → {len(student_cluster_map)} students mapped")
                except Exception as e:
                    print(f"⚠️ Auto-trigger: on-demand clustering failed (non-fatal): {e}")

            has_clustering = bool(student_cluster_map)

            # Determine if this is the first question for the session
            schedule_info = self.active_schedules.get(session_id, {})
            current_config = schedule_info.get("config", {})
            is_first_question = current_config.get("questions_sent", 0) == 0

            if is_first_question:
                print(f"🟢 Auto-trigger: First question → GENERIC only for all students")
            elif has_clustering:
                print(f"🔵 Auto-trigger: Subsequent question, clustering active ({len(student_cluster_map)} mapped) → CLUSTER-WISE")
            else:
                print(f"📋 Auto-trigger: Subsequent question, no clustering → will distribute cluster questions randomly")

            # ── 4. Collect all joined students ──────────────────────────
            ids_to_try = [str(s) for s in session_ids_to_check]

            students_to_send: Dict[str, str] = {}
            for room_id in ids_to_try:
                participants = ws_manager.get_session_participants(room_id)
                for p in participants:
                    sid_val = p["studentId"]
                    if sid_val not in students_to_send:
                        students_to_send[sid_val] = room_id

            total_students = len(students_to_send)
            if total_students == 0:
                for room_id in ids_to_try:
                    ws_manager.last_session_quiz[room_id] = {
                        "message": {"type": "quiz", "sessionId": room_id},
                        "sent_at": datetime.now()
                    }
                print(f"⚠️ No participants in session — stored quiz for reconnect catch-up")
                return {"success": True, "message": "Question stored (no online students)", "sentTo": 0}

            # ── 5. Pick a question PER student: generic first, then cluster ──
            sent_ids = self.sent_questions.get(session_id, set())
            student_questions: Dict[str, dict] = {}

            # Pre-build cluster label list for random assignment when clustering is unavailable
            cluster_labels = ["active", "moderate", "passive"]

            for sid_val in students_to_send:
                student_cluster = student_cluster_map.get(sid_val) if has_clustering else None

                if is_first_question:
                    # First question → ONLY generic
                    unsent_generic = [q for q in generic_qs if str(q["_id"]) not in sent_ids]
                    if unsent_generic:
                        q = random.choice(unsent_generic)
                    else:
                        q = random.choice(generic_qs) if generic_qs else (random.choice(questions) if questions else None)
                else:
                    # Subsequent questions → cluster-wise first, then generic fallback
                    if has_clustering and student_cluster:
                        # Known cluster assignment → pick matching cluster questions
                        student_cluster_qs = [
                            q for q in cluster_qs_all
                            if q.get("category", "").lower() == student_cluster
                        ]
                    elif cluster_qs_all:
                        # No clustering data but cluster questions exist →
                        # assign a random cluster label so the student still
                        # receives a cluster question instead of always getting generic
                        random_cluster = random.choice(cluster_labels)
                        student_cluster_qs = [
                            q for q in cluster_qs_all
                            if q.get("category", "").lower() == random_cluster
                        ]
                        # If the random cluster has no questions, use all cluster questions
                        if not student_cluster_qs:
                            student_cluster_qs = list(cluster_qs_all)
                    else:
                        student_cluster_qs = []

                    unsent_cluster = [q for q in student_cluster_qs if str(q["_id"]) not in sent_ids]
                    if unsent_cluster:
                        q = random.choice(unsent_cluster)
                    else:
                        unsent_generic = [q for q in generic_qs if str(q["_id"]) not in sent_ids]
                        if unsent_generic:
                            q = random.choice(unsent_generic)
                        else:
                            pool = student_cluster_qs + generic_qs
                            if not pool:
                                pool = generic_qs if generic_qs else questions
                            q = random.choice(pool) if pool else None

                if q:
                    student_questions[sid_val] = q
                    self.sent_questions.setdefault(session_id, set()).add(str(q["_id"]))

            if not student_questions:
                return {"success": False, "message": "No eligible questions for any student"}

            # ── 6. Assign stagger delays ────────────────────────────────
            student_delays: Dict[str, float] = {}
            for sid_val in student_questions:
                student_delays[sid_val] = random.uniform(0, stagger_window) if stagger_window > 0 else 0.0

            sorted_students = sorted(student_delays.items(), key=lambda x: x[1])
            print(f"🎯 Staggered delivery plan for {len(sorted_students)} students "
                  f"(window: {stagger_window}s):")
            for sid_val, delay in sorted_students:
                room_id = students_to_send[sid_val]
                participants = ws_manager.get_session_participants(room_id)
                name = next(
                    (p.get("studentName", sid_val[:8]) for p in participants if p["studentId"] == sid_val),
                    sid_val[:8]
                )
                q = student_questions[sid_val]
                print(f"   🕐 {name}: +{delay:.0f}s → [{q.get('questionType', 'generic')}] "
                      f"{q.get('category', 'Generic')}")

            # ── 7. Deliver per-student ──────────────────────────────────
            async def _deliver_to_student(sid_val: str, room_id: str, delay: float):
                if delay > 0:
                    await asyncio.sleep(delay)
                q = student_questions[sid_val]
                opts = q.get("options") or []
                if not isinstance(opts, list):
                    opts = list(opts) if opts else []
                opts = [str(o) for o in opts]
                msg = {
                    "type": "quiz",
                    "questionId": str(q["_id"]),
                    "question_id": str(q["_id"]),
                    "question": str(q.get("question", "")),
                    "options": opts,
                    "timeLimit": int(q.get("timeLimit", 30)),
                    "category": q.get("category", "General"),
                    "questionType": q.get("questionType", "generic"),
                    "sessionId": room_id,
                    "studentId": sid_val,
                    "questionSource": q_source,
                    "triggeredAt": datetime.utcnow().isoformat(),
                    "autoTriggered": True,
                }
                ok = await ws_manager.send_to_student_in_session(room_id, sid_val, msg)
                if ok:
                    ws_manager.last_student_quiz.setdefault(room_id, {})[sid_val] = {
                        "message": msg, "sent_at": datetime.now()
                    }
                    try:
                        await QuestionAssignmentModel.create(room_id, sid_val, str(q["_id"]), 0)
                    except Exception:
                        pass
                    print(f"   ✅ Sent to {sid_val[:12]}...")
                return ok

            tasks = []
            for sid_val, delay in sorted_students:
                room_id = students_to_send[sid_val]
                tasks.append(asyncio.create_task(_deliver_to_student(sid_val, room_id, delay)))

            # Store last quiz for reconnect catch-up
            for room_id in ids_to_try:
                first_q = next(iter(student_questions.values()))
                opts = first_q.get("options") or []
                if not isinstance(opts, list):
                    opts = list(opts) if opts else []
                ws_manager.last_session_quiz[room_id] = {
                    "message": {
                        "type": "quiz",
                        "questionId": str(first_q["_id"]),
                        "question": str(first_q.get("question", "")),
                        "options": [str(o) for o in opts],
                        "timeLimit": int(first_q.get("timeLimit", 30)),
                        "sessionId": room_id,
                        "triggeredAt": datetime.utcnow().isoformat(),
                        "autoTriggered": True,
                    },
                    "sent_at": datetime.now()
                }
                print(f"   📌 Stored last quiz for session {room_id} (reconnect catch-up)")

            results = await asyncio.gather(*tasks, return_exceptions=True)
            sent_count = sum(1 for r in results if r is True)

            return {
                "success": True,
                "message": f"Question sent to {sent_count}/{total_students} students "
                           f"(staggered over {stagger_window}s, source: {q_source})",
                "sentTo": sent_count,
                "totalStudents": total_students,
                "questionSource": q_source,
            }

        except Exception as e:
            print(f"❌ Error triggering staggered question: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "message": str(e)}
    
    def get_automation_status(self, session_id: str) -> dict:
        """Get current automation status for a session."""
        if session_id not in self.active_schedules:
            return {
                "active": False,
                "session_id": session_id
            }
        
        schedule = self.active_schedules[session_id]
        config = schedule.get("config", {})
        
        return {
            "active": True,
            "session_id": session_id,
            "started_at": config.get("started_at"),
            "questions_sent": config.get("questions_sent", 0),
            "first_delay_seconds": config.get("first_delay_seconds"),
            "interval_seconds": config.get("interval_seconds"),
            "stagger_window_seconds": config.get("stagger_window_seconds"),
            "max_questions": config.get("max_questions"),
            "sent_question_ids": list(self.sent_questions.get(session_id, set()))
        }
    
    def get_all_active_sessions(self) -> list:
        """Get list of all sessions with active automation."""
        return [
            self.get_automation_status(session_id)
            for session_id in self.active_schedules.keys()
        ]
    
    async def update_config(
        self,
        session_id: str,
        interval_seconds: int = None,
        max_questions: int = None,
        enabled: bool = None,
        stagger_window_seconds: int = None
    ) -> dict:
        """Update automation configuration for a running session."""
        if session_id not in self.active_schedules:
            return {"success": False, "message": "No active automation for this session"}
        
        config = self.active_schedules[session_id].get("config", {})
        
        if interval_seconds is not None:
            config["interval_seconds"] = interval_seconds
        if max_questions is not None:
            config["max_questions"] = max_questions
        if enabled is not None:
            config["enabled"] = enabled
        if stagger_window_seconds is not None:
            config["stagger_window_seconds"] = stagger_window_seconds
        
        return {
            "success": True,
            "message": "Configuration updated",
            "config": config
        }


# Singleton instance
quiz_scheduler = QuizScheduler()
