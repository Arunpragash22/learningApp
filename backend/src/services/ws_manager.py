"""
WebSocket Connection Manager Service
Manages real-time WebSocket connections with SESSION-BASED ROOMS
Only students who join a session will receive quiz questions for that session
"""
from fastapi import WebSocket
from typing import Dict, Set, Optional, List
from datetime import datetime
from ..models.session_participant_model import SessionParticipantModel
from ..database.connection import get_database


class WebSocketManager:
    """
    Centralized WebSocket connection manager with SESSION ROOMS
    Supports:
      ✅ Session-based rooms (only joined students receive quizzes)
      ✅ Global WebSocket (all students - for announcements)
      ✅ Meeting-based connections (Zoom session)
    """

    def __init__(self):
        # Store meeting-based connections {meetingId: {studentId: websocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        self.connection_times: Dict[str, Dict[str, datetime]] = {}

        # ⭐ GLOBAL CONNECTIONS — all students
        self.global_connections: Set[WebSocket] = set()

        # 🎯 SESSION ROOMS - Only joined students receive quizzes
        # Structure: {sessionId: {studentId: {"websocket": ws, "status": "joined", "name": str, "email": str}}}
        self.session_rooms: Dict[str, Dict[str, dict]] = {}

        # 📬 Last quiz per session (for "same question to all" - main.py trigger). Sent on reconnect.
        # session_id -> {"message": {...}, "sent_at": datetime}
        self.last_session_quiz: Dict[str, dict] = {}
        # 📬 Last quiz per student per session (for "different question per student" - live.py trigger). Sent on reconnect.
        # session_id -> { student_id -> {"message": {...}, "sent_at": datetime} }
        self.last_student_quiz: Dict[str, Dict[str, dict]] = {}

    # =========================================================
    # 🎯 SESSION ROOM HANDLERS (NEW - For Quiz Delivery)
    # =========================================================

    async def join_session_room(
        self, 
        websocket: WebSocket, 
        session_id: str, 
        student_id: str,
        student_name: str = None,
        student_email: str = None
    ) -> dict:
        """
        Student joins a session room - REQUIRED to receive quiz questions
        Returns participant info
        Also saves to MongoDB for persistence
        
        NOTE: session_id here might be Zoom meeting ID or MongoDB ObjectId
        We look up the MongoDB session ID for proper persistence
        """
        if session_id not in self.session_rooms:
            self.session_rooms[session_id] = {}

        final_student_name = student_name or f"Student {student_id[:8]}"

        participant = {
            "websocket": websocket,
            "studentId": student_id,
            "studentName": final_student_name,
            "studentEmail": student_email,
            "status": "joined",
            "joinedAt": datetime.now().isoformat()
        }

        self.session_rooms[session_id][student_id] = participant

        # 🎯 SAVE TO MONGODB for persistence and report generation
        # Look up the actual MongoDB session ID from Zoom meeting ID
        try:
            database = get_database()
            mongo_session_id = session_id  # Default to provided ID
            zoom_meeting_id = None
            
            if database is not None:
                session_doc = None
                
                # Try multiple lookup methods to find the session
                # Method 1: zoomMeetingId as integer
                if session_id.isdigit():
                    session_doc = await database.sessions.find_one({"zoomMeetingId": int(session_id)})
                    if session_doc:
                        zoom_meeting_id = int(session_id)
                        print(f"📍 Found session by zoomMeetingId (int): {session_id}")
                
                # Method 2: zoomMeetingId as string
                if not session_doc:
                    session_doc = await database.sessions.find_one({"zoomMeetingId": session_id})
                    if session_doc:
                        zoom_meeting_id = session_id
                        print(f"📍 Found session by zoomMeetingId (str): {session_id}")
                
                # Method 3: Direct MongoDB ObjectId
                if not session_doc:
                    from bson import ObjectId
                    try:
                        session_doc = await database.sessions.find_one({"_id": ObjectId(session_id)})
                        if session_doc:
                            print(f"📍 Found session by MongoDB ObjectId: {session_id}")
                    except:
                        pass
                
                if session_doc:
                    mongo_session_id = str(session_doc["_id"])
                    zoom_meeting_id = session_doc.get("zoomMeetingId")
                    print(f"📍 Mapped session: input={session_id} → MongoDB={mongo_session_id}, zoom={zoom_meeting_id}")
                else:
                    print(f"⚠️ Could not find session for ID: {session_id}")
            
            # Save participant with the MongoDB session ID
            await SessionParticipantModel.join_session(
                session_id=mongo_session_id,
                student_id=student_id,
                student_name=final_student_name,
                student_email=student_email
            )
            print(f"✅ Participant saved to MongoDB: session={mongo_session_id}, student={student_id}, name={final_student_name}")
            
            # Also save with zoom meeting ID as backup (for lookups)
            if zoom_meeting_id and str(zoom_meeting_id) != mongo_session_id:
                await SessionParticipantModel.join_session(
                    session_id=str(zoom_meeting_id),
                    student_id=student_id,
                    student_name=final_student_name,
                    student_email=student_email
                )
                print(f"✅ Also saved with zoomMeetingId: {zoom_meeting_id}")
                
        except Exception as e:
            print(f"⚠️ Failed to save participant to MongoDB: {e}")
            import traceback
            traceback.print_exc()

        print(f"✅ Student joined session room: session={session_id}, student={student_id}")
        print(f"   Session room now has {len(self.session_rooms[session_id])} participants")

        # 🎯 Broadcast participant joined event to all connected clients (instructor + students)
        join_event = {
            "type": "participant_joined",
            "sessionId": session_id,
            "studentId": student_id,
            "studentName": participant["studentName"],
            "studentEmail": participant.get("studentEmail"),
            "participantCount": len(self.session_rooms[session_id]),
            "timestamp": datetime.now().isoformat()
        }
        
        # Broadcast to all participants in this session (including instructor if connected)
        await self.broadcast_to_session(session_id, join_event)

        return {
            "sessionId": session_id,
            "studentId": student_id,
            "studentName": participant["studentName"],
            "status": "joined",
            "participantCount": len(self.session_rooms[session_id])
        }

    async def leave_session_room(self, session_id: str, student_id: str) -> bool:
        """Student leaves session room - will no longer receive quizzes"""
        if session_id in self.session_rooms and student_id in self.session_rooms[session_id]:
            # Get participant info before marking as left
            participant_info = self.session_rooms[session_id][student_id].copy()
            
            # Mark as left instead of removing (for tracking)
            self.session_rooms[session_id][student_id]["status"] = "left"
            self.session_rooms[session_id][student_id]["leftAt"] = datetime.now().isoformat()
            
            # 🎯 UPDATE MongoDB - find the correct session ID
            try:
                database = get_database()
                mongo_session_id = session_id
                
                if database is not None:
                    session_doc = await database.sessions.find_one({"zoomMeetingId": int(session_id) if session_id.isdigit() else session_id})
                    if not session_doc:
                        from bson import ObjectId
                        try:
                            session_doc = await database.sessions.find_one({"_id": ObjectId(session_id)})
                        except:
                            pass
                    if session_doc:
                        mongo_session_id = str(session_doc["_id"])
                
                await SessionParticipantModel.leave_session(mongo_session_id, student_id)
                print(f"✅ Participant left session in MongoDB: session={mongo_session_id}, student={student_id}")
            except Exception as e:
                print(f"⚠️ Failed to update participant leave in MongoDB: {e}")
            
            # 🎯 Broadcast participant left event to all connected clients
            leave_event = {
                "type": "participant_left",
                "sessionId": session_id,
                "studentId": student_id,
                "studentName": participant_info.get("studentName"),
                "studentEmail": participant_info.get("studentEmail"),
                "participantCount": len([p for p in self.session_rooms[session_id].values() if p.get("status") == "joined"]),
                "timestamp": datetime.now().isoformat()
            }
            
            # Broadcast to all participants in this session
            await self.broadcast_to_session(session_id, leave_event)
            
            # Fully remove from room so they are offline and never receive questions
            self.remove_from_session_room(session_id, student_id)
            print(f"👋 Student left session room: session={session_id}, student={student_id} (removed)")
            return True
        return False

    def remove_from_session_room(self, session_id: str, student_id: str) -> bool:
        """Completely remove student from session room"""
        if session_id in self.session_rooms and student_id in self.session_rooms[session_id]:
            del self.session_rooms[session_id][student_id]
            
            # Clean up empty rooms
            if len(self.session_rooms[session_id]) == 0:
                del self.session_rooms[session_id]
                print(f"🧹 Cleaned empty session room: {session_id}")
            
            return True
        return False

    def is_in_session_room(self, session_id: str, student_id: str) -> bool:
        """Check if student is an active participant in session room"""
        if session_id not in self.session_rooms:
            return False
        if student_id not in self.session_rooms[session_id]:
            return False
        return self.session_rooms[session_id][student_id].get("status") == "joined"

    def get_session_participants(self, session_id: str) -> List[dict]:
        """Get all ACTIVE participants in a session room"""
        if session_id not in self.session_rooms:
            return []
        
        participants = []
        for student_id, data in self.session_rooms[session_id].items():
            if data.get("status") == "joined":
                participants.append({
                    "studentId": student_id,
                    "studentName": data.get("studentName"),
                    "studentEmail": data.get("studentEmail"),
                    "joinedAt": data.get("joinedAt"),
                    "status": data.get("status")
                })
        return participants
    
    def get_session_participants_by_multiple_ids(self, session_ids: List[str]) -> List[dict]:
        """
        Get all ACTIVE participants across multiple session IDs.
        Used when students might be connected with different IDs (zoomMeetingId vs MongoDB sessionId).
        """
        all_participants = []
        seen_student_ids = set()
        
        for session_id in session_ids:
            if session_id in self.session_rooms:
                for student_id, data in self.session_rooms[session_id].items():
                    if data.get("status") == "joined" and student_id not in seen_student_ids:
                        seen_student_ids.add(student_id)
                        all_participants.append({
                            "studentId": student_id,
                            "studentName": data.get("studentName"),
                            "studentEmail": data.get("studentEmail"),
                            "joinedAt": data.get("joinedAt"),
                            "status": data.get("status"),
                            "sessionId": session_id  # Track which session ID they're connected with
                        })
        
        return all_participants

    def get_session_participant_count(self, session_id: str) -> int:
        """Get count of active participants in session"""
        return len(self.get_session_participants(session_id))

    def get_meeting_stats(self, meeting_id: str) -> dict:
        """Get stats for a session/meeting (participant count). Used by live stats API."""
        count = self.get_session_participant_count(meeting_id)
        return {"participantCount": count, "sessionId": meeting_id}

    async def send_to_student_in_session(self, session_id: str, student_id: str, message: dict) -> bool:
        """
        Send a message to a SPECIFIC student in a session room.
        Used for sending individual random questions to each student.
        Returns True if sent successfully, False otherwise.
        """
        if session_id not in self.session_rooms:
            print(f"⚠️ No participants in session {session_id}")
            return False
        
        if student_id not in self.session_rooms[session_id]:
            print(f"⚠️ Student {student_id} not found in session {session_id}")
            return False
        
        participant = self.session_rooms[session_id][student_id]
        
        # Only send to JOINED students (not "left")
        if participant.get("status") != "joined":
            print(f"⚠️ Student {student_id} is not in joined status")
            return False
        
        websocket = participant.get("websocket")
        if not websocket:
            print(f"⚠️ No WebSocket connection for student {student_id}")
            return False
        
        # Check if WebSocket is still open before sending
        try:
            # Check WebSocket state - FastAPI WebSocket may have client_state or application_state
            try:
                if hasattr(websocket, 'client_state'):
                    if websocket.client_state.name != 'CONNECTED':
                        print(f"   ⚠️ WebSocket for {student_id} is not connected (state: {websocket.client_state.name})")
                        return False
                elif hasattr(websocket, 'application_state'):
                    if websocket.application_state.name != 'CONNECTED':
                        print(f"   ⚠️ WebSocket for {student_id} is not connected (state: {websocket.application_state.name})")
                        return False
            except (AttributeError, Exception):
                # If state checking fails, proceed with send attempt (will be caught by outer try-except)
                pass
            
            await websocket.send_json(message)
            print(f"   ✅ Sent to {participant.get('studentName', student_id)}")
            # 📬 Store last quiz for this student/session so they get it on reconnect
            if message.get("type") == "quiz":
                if session_id not in self.last_student_quiz:
                    self.last_student_quiz[session_id] = {}
                self.last_student_quiz[session_id][student_id] = {"message": message, "sent_at": datetime.now()}
                print(f"   📌 Stored last quiz for session {session_id} / student {student_id[:8]}... (reconnect catch-up)")
            return True
        except Exception as e:
            error_msg = str(e)
            # Check for common closed connection errors
            if 'websocket.close' in error_msg or 'closed' in error_msg.lower() or '1005' in error_msg:
                print(f"   ⚠️ WebSocket for {student_id} is closed, removing from session")
                # Mark as left and remove from session
                await self.leave_session_room(session_id, student_id)
            else:
                print(f"   ❌ Failed to send to {student_id}: {e}")
            return False

    def get_recent_quiz_for_student(self, session_id: str, student_id: str, max_age_seconds: int = 120) -> Optional[dict]:
        """
        Get the most recent quiz for this student in this session (for reconnect catch-up).
        Checks per-student quiz first (live.py), then session-wide quiz (main.py).
        Returns None if no recent quiz.
        """
        now = datetime.now()
        # 1) Per-student quiz (live.py - different question per student)
        if session_id in self.last_student_quiz and student_id in self.last_student_quiz[session_id]:
            entry = self.last_student_quiz[session_id][student_id]
            sent_at = entry.get("sent_at")
            if sent_at and (now - sent_at).total_seconds() <= max_age_seconds:
                return entry.get("message")
        # 2) Session-wide quiz (main.py - same question to all)
        if session_id in self.last_session_quiz:
            entry = self.last_session_quiz[session_id]
            sent_at = entry.get("sent_at")
            if sent_at and (now - sent_at).total_seconds() <= max_age_seconds:
                return entry.get("message")
        return None

    async def send_missed_quiz_if_any(
        self,
        session_id: str,
        student_id: str,
        websocket: WebSocket,
        answered_question_ids: Optional[set] = None,
    ) -> bool:
        """
        If a quiz was sent to this session in the last 2 minutes, send it to this websocket
        (so students who reconnect get the quiz they missed). Returns True if sent.
        If answered_question_ids is provided and the quiz's questionId is in it, do not send
        (student already answered — avoids duplicate delivery on reconnect).
        """
        quiz = self.get_recent_quiz_for_student(session_id, student_id, max_age_seconds=120)
        if not quiz:
            return False
        question_id = quiz.get("questionId") or quiz.get("question_id")
        if answered_question_ids is not None and question_id and question_id in answered_question_ids:
            return False
        try:
            await websocket.send_json(quiz)
            print(f"   📬 Sent missed quiz to reconnected student {student_id[:8]}... (catch-up)")
            return True
        except Exception as e:
            print(f"   ⚠️ Failed to send missed quiz to {student_id}: {e}")
            return False

    async def broadcast_to_session(self, session_id: str, message: dict) -> int:
        """
        🎯 BROADCAST QUIZ TO SESSION ROOM ONLY - INSTANT DELIVERY
        Only students who have joined this session will receive the message
        Optimized for zero-delay delivery with parallel sending
        """
        if session_id not in self.session_rooms:
            print(f"⚠️ No participants in session {session_id}")
            return 0

        sent = 0
        dead_connections = []
        
        # Build ordered list of (student_id, task) for JOINED only so results align with student_id
        import asyncio
        joined_student_ids: List[str] = []
        send_tasks = []

        for student_id, data in self.session_rooms[session_id].items():
            if data.get("status") != "joined":
                continue
            websocket = data.get("websocket")
            if not websocket:
                continue

            async def send_to_student(ws, sid, name):
                try:
                    try:
                        if hasattr(ws, 'client_state') and ws.client_state.name != 'CONNECTED':
                            return False, "not_connected"
                        if hasattr(ws, 'application_state') and ws.application_state.name != 'CONNECTED':
                            return False, "not_connected"
                    except (AttributeError, Exception):
                        pass
                    await ws.send_json(message)
                    print(f"   ✅ Sent to {name or sid}")
                    return True, None
                except Exception as e:
                    error_msg = str(e).lower()
                    # Only treat as dead if connection is clearly closed (don't remove on serialization/timeout)
                    is_closed = (
                        "websocket" in error_msg and ("close" in error_msg or "closed" in error_msg)
                        or "1005" in error_msg or "1006" in error_msg or "connection closed" in error_msg
                    )
                    if is_closed:
                        print(f"   ⚠️ WebSocket for {sid} is closed")
                    else:
                        print(f"   ❌ Failed to send to {sid}: {e}")
                    return False, "closed" if is_closed else "error"

            joined_student_ids.append(student_id)
            send_tasks.append(send_to_student(websocket, student_id, data.get('studentName')))

        if send_tasks:
            results = await asyncio.gather(*send_tasks, return_exceptions=True)
            sent = 0
            for i, sid in enumerate(joined_student_ids):
                if i >= len(results):
                    continue
                r = results[i]
                if isinstance(r, Exception):
                    print(f"   ⚠️ Send exception for {sid}: {r}")
                    continue
                ok, reason = r if isinstance(r, tuple) else (r, None)
                if ok:
                    sent += 1
                elif reason == "closed":
                    dead_connections.append(sid)
                # else: transient error, don't remove connection

        for student_id in dead_connections:
            try:
                await self.leave_session_room(session_id, student_id)
                self.remove_from_session_room(session_id, student_id)
            except Exception as cleanup_error:
                print(f"   ⚠️ Error cleaning up dead connection for {student_id}: {cleanup_error}")
                self.remove_from_session_room(session_id, student_id)

        # 📬 Store last quiz for this session so reconnecting students can receive it
        if message.get("type") == "quiz":
            self.last_session_quiz[session_id] = {"message": message, "sent_at": datetime.now()}
            print(f"   📌 Stored last quiz for session {session_id} (reconnect catch-up)")

        print(f"📢 SESSION BROADCAST [{session_id}] → Sent to {sent} students INSTANTLY")
        return sent

    # =========================================================
    # ⭐ GLOBAL CONNECTION HANDLERS
    # =========================================================

    async def connect_global(self, websocket: WebSocket):
        """Accept and store a global WebSocket connection"""
        await websocket.accept()
        self.global_connections.add(websocket)
        print(f"🌍 Global WS Connected (total={len(self.global_connections)})")

    def disconnect_global(self, websocket: WebSocket):
        """Remove global WebSocket connection"""
        if websocket in self.global_connections:
            self.global_connections.remove(websocket)
            print(f"❌ Global WS Disconnected (remaining={len(self.global_connections)})")

    async def broadcast_global(self, message: dict) -> int:
        """Broadcast message to ALL connected students globally"""
        dead = []
        sent = 0

        for ws in list(self.global_connections):
            try:
                await ws.send_json(message)
                sent += 1
            except:
                dead.append(ws)

        # Remove dead sockets
        for ws in dead:
            self.global_connections.remove(ws)

        print(f"📢 GLOBAL BROADCAST → Sent to {sent} students")
        return sent

    # =========================================================
    # 🎯 MEETING BASED HANDLERS (kept for compatibility)
    # =========================================================

    async def connect(self, websocket: WebSocket, meeting_id: str, student_id: str):
        """Accept meeting-based WebSocket connection"""
        await websocket.accept()

        if meeting_id not in self.active_connections:
            self.active_connections[meeting_id] = {}
            self.connection_times[meeting_id] = {}

        self.active_connections[meeting_id][student_id] = websocket
        self.connection_times[meeting_id][student_id] = datetime.now()

        print(f"✅ WS Connected: Meeting={meeting_id}, Student={student_id}")

        # Auto-send welcome message
        await websocket.send_json({
            "type": "connected",
            "meeting_id": meeting_id,
            "student_id": student_id,
            "timestamp": datetime.now().isoformat()
        })

    def disconnect(self, meeting_id: str, student_id: str):
        """Disconnect meeting-based WebSocket connection"""
        if meeting_id in self.active_connections and student_id in self.active_connections[meeting_id]:
            del self.active_connections[meeting_id][student_id]

            if student_id in self.connection_times.get(meeting_id, {}):
                del self.connection_times[meeting_id][student_id]

            print(f"❌ WS Disconnected: Meeting={meeting_id}, Student={student_id}")

            # Remove empty meeting room
            if len(self.active_connections[meeting_id]) == 0:
                del self.active_connections[meeting_id]
                if meeting_id in self.connection_times:
                    del self.connection_times[meeting_id]
                print(f"🧹 Cleaned empty meeting {meeting_id}")

    async def broadcast_to_meeting(self, meeting_id: str, message: dict) -> int:
        """Send message to all students in ONE meeting"""
        if meeting_id not in self.active_connections:
            return 0

        sent = 0
        dead = []

        for student_id, ws in self.active_connections[meeting_id].items():
            try:
                await ws.send_json(message)
                sent += 1
            except:
                dead.append(student_id)

        for sid in dead:
            self.disconnect(meeting_id, sid)

        return sent

    async def broadcast_to_all_meetings(self, message: dict) -> int:
        """Send to all students across all meetings"""
        total = 0
        for m in list(self.active_connections.keys()):
            total += await self.broadcast_to_meeting(m, message)
        return total

    # =========================================================
    # 🔍 STATS
    # =========================================================

    def get_all_stats(self):
        session_stats = {}
        for session_id in self.session_rooms:
            session_stats[session_id] = self.get_session_participant_count(session_id)

        return {
            "global_connections": len(self.global_connections),
            "meeting_rooms": list(self.active_connections.keys()),
            "session_rooms": session_stats,
            "total_session_participants": sum(session_stats.values()),
            "timestamp": datetime.now().isoformat()
        }


# Export instance
ws_manager = WebSocketManager()
__all__ = ["ws_manager", "WebSocketManager"]
