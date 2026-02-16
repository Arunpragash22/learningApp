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
        Trigger a question and deliver it to each student at a DIFFERENT
        random time within the stagger window.

        Example: stagger_window=600 (10 min)
          - Student A receives the question after 47 seconds
          - Student B receives the question after 312 seconds
          - Student C receives the question after 589 seconds
          All within the 10-minute window, but NOT at the same time.
        """
        from ..database.connection import db
        from .ws_manager import ws_manager

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

            # ── 2. Find available questions ─────────────────────────────
            questions = []

            if session_id:
                questions = await db.database.questions.find(
                    {"sessionId": session_id}
                ).to_list(length=None)
                print(f"📝 Auto-trigger: Found {len(questions)} questions for session {session_id}")

            if not questions and session_doc:
                instructor_id = session_doc.get("instructorId")
                if instructor_id:
                    questions = await db.database.questions.find({
                        "instructorId": instructor_id,
                        "$or": [{"sessionId": None}, {"sessionId": {"$exists": False}}]
                    }).to_list(length=None)
                    print(f"📝 Auto-trigger: Found {len(questions)} general questions from instructor")

            if not questions:
                questions = await db.database.questions.find({}).to_list(length=None)
                print(f"📝 Auto-trigger: Fallback - Found {len(questions)} total questions")

            if not questions:
                return {"success": False, "message": "No questions found for this session"}

            # Filter out already-sent questions
            sent_ids = self.sent_questions.get(session_id, set())
            available_questions = [
                q for q in questions if str(q["_id"]) not in sent_ids
            ]

            if not available_questions:
                print(f"📚 Session {session_id}: All questions sent, resetting pool...")
                self.sent_questions[session_id] = set()
                available_questions = questions

            # Pick a random question (same question for all students)
            question = random.choice(available_questions)
            question_id = str(question["_id"])
            self.sent_questions[session_id].add(question_id)

            # ── 3. Build quiz message ───────────────────────────────────
            opts = question.get("options") or []
            if not isinstance(opts, list):
                opts = list(opts) if opts else []
            opts = [str(o) for o in opts]

            base_message = {
                "type": "quiz",
                "questionId": question_id,
                "question_id": question_id,
                "question": str(question.get("question", "")),
                "options": opts,
                "timeLimit": int(question.get("timeLimit", 30)),
                "sessionId": session_id,
                "triggeredAt": datetime.utcnow().isoformat(),
                "autoTriggered": True,
            }

            # ── 4. Collect all joined students from both room IDs ───────
            ids_to_try = [str(session_id)]
            zoom_str = str(zoom_meeting_id).strip() if zoom_meeting_id else None
            if zoom_str and zoom_str not in ids_to_try:
                ids_to_try.append(zoom_str)

            # Gather unique students: {student_id: room_id}
            students_to_send: Dict[str, str] = {}
            for room_id in ids_to_try:
                participants = ws_manager.get_session_participants(room_id)
                for p in participants:
                    sid = p["studentId"]
                    if sid not in students_to_send:
                        students_to_send[sid] = room_id

            total_students = len(students_to_send)
            if total_students == 0:
                # Still store as last quiz so reconnecting students get it
                for room_id in ids_to_try:
                    msg = {**base_message, "sessionId": room_id}
                    ws_manager.last_session_quiz[room_id] = {
                        "message": msg, "sent_at": datetime.now()
                    }
                print(f"⚠️ No participants in session — stored quiz for reconnect catch-up")
                return {
                    "success": True,
                    "message": "Question stored (no online students)",
                    "sentTo": 0,
                    "questionId": question_id,
                }

            # ── 5. Assign a random delay to each student ────────────────
            # Spread students across the stagger window.
            # Minimum gap = 0s, Maximum gap = stagger_window.
            student_delays: Dict[str, float] = {}
            for sid in students_to_send:
                if stagger_window > 0:
                    student_delays[sid] = random.uniform(0, stagger_window)
                else:
                    student_delays[sid] = 0.0

            # Sort by delay so log output is in delivery order
            sorted_students = sorted(student_delays.items(), key=lambda x: x[1])
            print(f"🎯 Staggered delivery plan for {total_students} students "
                  f"(window: {stagger_window}s):")
            for sid, delay in sorted_students:
                room_id = students_to_send[sid]
                participants = ws_manager.get_session_participants(room_id)
                name = next(
                    (p.get("studentName", sid[:8]) for p in participants if p["studentId"] == sid),
                    sid[:8]
                )
                print(f"   🕐 {name}: +{delay:.0f}s")

            # ── 6. Create per-student delivery tasks ────────────────────
            async def _deliver_to_student(sid: str, room_id: str, delay: float):
                """Wait the random delay, then send the question to one student."""
                if delay > 0:
                    await asyncio.sleep(delay)
                msg = {**base_message, "sessionId": room_id}
                ok = await ws_manager.send_to_student_in_session(room_id, sid, msg)
                return ok

            tasks = []
            for sid, delay in sorted_students:
                room_id = students_to_send[sid]
                tasks.append(
                    asyncio.create_task(_deliver_to_student(sid, room_id, delay))
                )

            # Store last quiz for reconnect catch-up (stored immediately)
            for room_id in ids_to_try:
                msg = {**base_message, "sessionId": room_id}
                ws_manager.last_session_quiz[room_id] = {
                    "message": msg, "sent_at": datetime.now()
                }
                print(f"   📌 Stored last quiz for session {room_id} (reconnect catch-up)")

            # Wait for all deliveries to complete
            results = await asyncio.gather(*tasks, return_exceptions=True)
            sent_count = sum(
                1 for r in results if r is True
            )

            return {
                "success": True,
                "message": f"Question sent to {sent_count}/{total_students} students "
                           f"(staggered over {stagger_window}s)",
                "sentTo": sent_count,
                "totalStudents": total_students,
                "questionId": question_id,
                "question": str(question.get("question", ""))[:50] + "..."
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
