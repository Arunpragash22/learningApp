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
    
    async def start_automation(
        self,
        session_id: str,
        zoom_meeting_id: Optional[str] = None,
        first_delay_seconds: int = None,
        interval_seconds: int = None,
        max_questions: int = None
    ) -> dict:
        """
        Start automated question triggering for a session.
        
        Args:
            session_id: MongoDB session ID
            zoom_meeting_id: Zoom meeting ID (if available)
            first_delay_seconds: Delay before first question (default: 120s = 2min)
            interval_seconds: Interval between questions (default: 600s = 10min)
            max_questions: Max questions to send (default: unlimited)
        
        Returns:
            Status dict with success and schedule info
        """
        # Cancel existing schedule if any
        if session_id in self.active_schedules:
            await self.stop_automation(session_id)
        
        config = {
            "session_id": session_id,
            "zoom_meeting_id": zoom_meeting_id,
            "first_delay_seconds": first_delay_seconds or self.default_first_delay,
            "interval_seconds": interval_seconds or self.default_interval,
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
        
        return {
            "success": True,
            "message": "Quiz automation started",
            "session_id": session_id,
            "first_trigger_in_seconds": config["first_delay_seconds"],
            "interval_seconds": config["interval_seconds"]
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
                
                # Re-read interval from config each time (e.g. 300s = 5 min)
                interval = current_config.get("interval_seconds", 600)
                
                print(f"📤 Session {session_id}: Triggering question #{questions_sent + 1}...")
                result = await self._trigger_question(session_id, zoom_meeting_id)
                
                if result.get("success"):
                    current_config["questions_sent"] = questions_sent + 1
                    print(f"✅ Session {session_id}: Auto-triggered question #{questions_sent + 1} → {result.get('sentTo', 0)} students")
                else:
                    print(f"⚠️ Session {session_id}: Trigger failed - {result.get('message')} (will retry in {interval}s)")
                
                print(f"⏰ Session {session_id}: Next question in {interval}s...")
                await asyncio.sleep(interval)
                
        except asyncio.CancelledError:
            print(f"🛑 Session {session_id}: Schedule cancelled")
            raise
        except Exception as e:
            print(f"❌ Session {session_id}: Schedule error: {e}")
            import traceback
            traceback.print_exc()
    
    async def _trigger_question(self, session_id: str, zoom_meeting_id: Optional[str] = None) -> dict:
        """
        Trigger a random question to all students in the session.
        Ensures no duplicate questions are sent.
        Questions are filtered by sessionId first, then instructor's general questions.
        """
        # Import here to avoid circular imports
        from ..database.connection import db
        from .ws_manager import ws_manager
        from bson import ObjectId
        
        try:
            # Find the session to get instructor info
            session_doc = None
            try:
                if len(session_id) == 24:
                    session_doc = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
            except:
                pass
            
            if not session_doc and zoom_meeting_id:
                try:
                    session_doc = await db.database.sessions.find_one({"zoomMeetingId": int(zoom_meeting_id)})
                except:
                    session_doc = await db.database.sessions.find_one({"zoomMeetingId": zoom_meeting_id})
            
            # Get questions - first try session-specific, then instructor's general questions
            questions = []
            
            # Try to get questions specific to this session
            if session_id:
                questions = await db.database.questions.find({"sessionId": session_id}).to_list(length=None)
                print(f"📝 Auto-trigger: Found {len(questions)} questions for session {session_id}")
            
            # If no session-specific questions, get instructor's general questions
            if not questions and session_doc:
                instructor_id = session_doc.get("instructorId")
                if instructor_id:
                    questions = await db.database.questions.find({
                        "instructorId": instructor_id,
                        "$or": [{"sessionId": None}, {"sessionId": {"$exists": False}}]
                    }).to_list(length=None)
                    print(f"📝 Auto-trigger: Found {len(questions)} general questions from instructor")
            
            # Final fallback: get all questions
            if not questions:
                questions = await db.database.questions.find({}).to_list(length=None)
                print(f"📝 Auto-trigger: Fallback - Found {len(questions)} total questions")
            
            if not questions:
                return {"success": False, "message": "No questions found for this session"}
            
            # Filter out already-sent questions for this session
            sent_ids = self.sent_questions.get(session_id, set())
            available_questions = [
                q for q in questions 
                if str(q["_id"]) not in sent_ids
            ]
            
            if not available_questions:
                # If all questions sent, reset and start over (optional behavior)
                print(f"📚 Session {session_id}: All questions sent, resetting pool...")
                self.sent_questions[session_id] = set()
                available_questions = questions
            
            # Pick a random question
            question = random.choice(available_questions)
            question_id = str(question["_id"])
            
            # Mark as sent
            self.sent_questions[session_id].add(question_id)
            
            # Build quiz message with JSON-safe types only (no BSON/ObjectId)
            opts = question.get("options") or []
            if not isinstance(opts, list):
                opts = list(opts) if opts else []
            opts = [str(o) for o in opts]
            message = {
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
            
            # Always broadcast to BOTH session_id and zoom_meeting_id so we never miss students.
            ids_to_try = [str(session_id)]
            zoom_str = str(zoom_meeting_id).strip() if zoom_meeting_id else None
            if zoom_str and zoom_str not in ids_to_try:
                ids_to_try.append(zoom_str)
            
            sent_count = 0
            for room_id in ids_to_try:
                msg = {**message, "sessionId": room_id}
                n = await ws_manager.broadcast_to_session(room_id, msg)
                print(f"   📤 Auto-trigger broadcast room [{room_id}] → {n} students")
                sent_count += n
            
            return {
                "success": True,
                "message": f"Question sent to {sent_count} students",
                "sentTo": sent_count,
                "questionId": question_id,
                "question": str(question.get("question", ""))[:50] + "..."
            }
            
        except Exception as e:
            print(f"❌ Error triggering question: {e}")
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
        enabled: bool = None
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
        
        return {
            "success": True,
            "message": "Configuration updated",
            "config": config
        }


# Singleton instance
quiz_scheduler = QuizScheduler()
