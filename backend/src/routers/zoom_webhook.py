from fastapi import APIRouter, Request, Header, HTTPException
import hmac, hashlib, base64, os, json
from datetime import datetime
from bson import ObjectId
from src.database.connection import get_database
from src.models.session_report_model import SessionReportModel
from src.services.ws_manager import ws_manager

router = APIRouter(prefix="/api/zoom", tags=["Zoom Webhook"])


def compute_signature(secret: str, timestamp: str, body: bytes):
    message = f"v0:{timestamp}:{body.decode()}"
    hash_ = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
    return f"v0={hash_}"


@router.post("/events")
async def zoom_events(
    request: Request,
    zoom_signature: str = Header(None, alias="x-zoom-signature"),
    zoom_timestamp: str = Header(None, alias="x-zoom-request-timestamp")
):

    raw = await request.body()
    data = json.loads(raw.decode())

    event = data.get("event")
    payload = data.get("payload", {})
    obj = payload.get("object", {})
    participant = obj.get("participant", {})

    db = get_database()

    # URL VALIDATION
    if event == "endpoint.url_validation":
        plain = payload["plainToken"]
        secret = os.getenv("ZOOM_WEBHOOK_SECRET", "")
        hashed = hmac.new(secret.encode(), plain.encode(), hashlib.sha256).digest()
        encrypted = base64.b64encode(hashed).decode()
        return {"plainToken": plain, "encryptedToken": encrypted}

    # SIGNATURE VALIDATION
    if zoom_signature:
        secret = os.getenv("ZOOM_WEBHOOK_SECRET", "")
        expected = compute_signature(secret, zoom_timestamp, raw)
        if not hmac.compare_digest(expected, zoom_signature):
            raise HTTPException(status_code=401, detail="Invalid signature")

    # COMMON MAPPED FIELDS (base document)
    base_doc = {
        "zoom_meeting_id": obj.get("id"),
        "meeting_topic": obj.get("topic"),
        "meeting_uuid": obj.get("uuid"),

        "user_id": participant.get("user_id") or participant.get("id"),
        "user_name": participant.get("user_name") or participant.get("name"),
        "email": participant.get("email"),

        "participant_user_id": participant.get("participant_user_id"),
        "participant_uuid": participant.get("participant_uuid"),

        "public_ip": participant.get("ip_address"),
        "private_ip": participant.get("private_ip_address"),

        "raw_participant_data": participant,  # Store everything

        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    # -----------------------------
    #  EVENT: PARTICIPANT JOINED
    # -----------------------------
    if event == "meeting.participant_joined":
        zoom_meeting_id = obj.get("id")

        doc = {
            **base_doc,
            "status": "joined",
            "join_time": participant.get("join_time"),
            "event": "joined"
        }

        await db.participation.insert_one(doc)
        print("✔ JOIN DATA STORED:", doc)
        
        # 🎯 ALSO SAVE TO session_participants for REPORT GENERATION
        try:
            # Find the session by zoomMeetingId
            session = None
            if zoom_meeting_id:
                try:
                    session = await db.sessions.find_one({"zoomMeetingId": int(zoom_meeting_id)})
                except:
                    pass
                if not session:
                    session = await db.sessions.find_one({"zoomMeetingId": str(zoom_meeting_id)})
            
            if session:
                mongo_session_id = str(session["_id"])
                student_id = participant.get("user_id") or participant.get("id") or participant.get("participant_user_id") or f"zoom_{participant.get('participant_uuid', 'unknown')}"
                student_name = participant.get("user_name") or participant.get("name") or "Zoom Participant"
                student_email = participant.get("email") or ""
                
                # Save to session_participants (upsert to avoid duplicates)
                await db.session_participants.update_one(
                    {"sessionId": mongo_session_id, "studentId": student_id},
                    {
                        "$set": {
                            "sessionId": mongo_session_id,
                            "studentId": student_id,
                            "studentName": student_name,
                            "studentEmail": student_email,
                            "joinedAt": datetime.utcnow(),
                            "status": "active",
                            "joinedVia": "zoom_webhook"
                        }
                    },
                    upsert=True
                )
                print(f"✅ Also saved to session_participants: session={mongo_session_id}, student={student_name}")
            else:
                print(f"⚠️ Could not find session for Zoom meeting ID: {zoom_meeting_id}")
        except Exception as e:
            print(f"⚠️ Failed to save to session_participants: {e}")
        
        return {"status": "ok", "event": "joined"}


    # -----------------------------
    #  EVENT: PARTICIPANT LEFT
    # -----------------------------
    if event == "meeting.participant_left":
        zoom_meeting_id = obj.get("id")

        doc = {
            **base_doc,
            "status": "left",
            "leave_time": participant.get("leave_time"),
            "leave_reason": participant.get("leave_reason"),
            "event": "left"
        }

        await db.participation.insert_one(doc)
        print("✔ LEAVE DATA STORED:", doc)
        
        # 🎯 ALSO UPDATE session_participants for REPORT GENERATION
        try:
            # Find the session by zoomMeetingId
            session = None
            if zoom_meeting_id:
                try:
                    session = await db.sessions.find_one({"zoomMeetingId": int(zoom_meeting_id)})
                except:
                    pass
                if not session:
                    session = await db.sessions.find_one({"zoomMeetingId": str(zoom_meeting_id)})
            
            if session:
                mongo_session_id = str(session["_id"])
                student_id = participant.get("user_id") or participant.get("id") or participant.get("participant_user_id") or f"zoom_{participant.get('participant_uuid', 'unknown')}"
                
                # Update session_participants with leave time
                await db.session_participants.update_one(
                    {"sessionId": mongo_session_id, "studentId": student_id},
                    {
                        "$set": {
                            "leftAt": datetime.utcnow(),
                            "status": "left"
                        }
                    }
                )
                print(f"✅ Updated session_participants: session={mongo_session_id}, student={student_id} LEFT")
        except Exception as e:
            print(f"⚠️ Failed to update session_participants: {e}")
        
        return {"status": "ok", "event": "left"}


    # -----------------------------
    #  EVENT: MEETING ENDED
    # -----------------------------
    if event == "meeting.ended":
        zoom_meeting_id = obj.get("id")
        
        doc = {
            "zoom_meeting_id": zoom_meeting_id,
            "meeting_topic": obj.get("topic"),
            "meeting_uuid": obj.get("uuid"),
            "duration": obj.get("duration"),
            "timezone": obj.get("timezone"),
            "event": "meeting_ended",
            "created_at": datetime.utcnow(),
        }

        await db.participation.insert_one(doc)
        print("✔ MEETING ENDED STORED:", doc)
        
        # ======================================
        # 🎯 AUTO-END SESSION & GENERATE REPORT
        # ======================================
        try:
            # Find session by Zoom Meeting ID
            session = None
            
            # Try as integer first (Zoom IDs are usually integers)
            if zoom_meeting_id:
                try:
                    session = await db.sessions.find_one({"zoomMeetingId": int(zoom_meeting_id)})
                except:
                    pass
                
                if not session:
                    session = await db.sessions.find_one({"zoomMeetingId": str(zoom_meeting_id)})
            
            if session:
                session_id = str(session["_id"])
                instructor_id = session.get("instructorId")
                current_status = session.get("status")
                
                # Only end if session is currently 'live' or 'upcoming'
                if current_status != "completed":
                    print(f"🎯 Auto-ending session: {session_id} (Zoom: {zoom_meeting_id})")
                    
                    # Get participant count from BOTH session_id and zoomMeetingId
                    participant_count = await db.session_participants.count_documents({
                        "sessionId": session_id
                    })
                    
                    zoom_participant_count = await db.session_participants.count_documents({
                        "sessionId": str(zoom_meeting_id)
                    })
                    
                    total_participants = max(participant_count, zoom_participant_count)
                    
                    # Update session status to completed
                    await db.sessions.update_one(
                        {"_id": session["_id"]},
                        {
                            "$set": {
                                "status": "completed",
                                "actualEndTime": datetime.utcnow(),
                                "endedAt": datetime.utcnow(),
                                "endedBy": "zoom_webhook",
                                "participants": total_participants
                            }
                        }
                    )
                    
                    print(f"✅ Session marked as completed: {session_id}, {total_participants} participants")
                    
                    # 🎯 Broadcast meeting ended event to all connected clients (instructor + students)
                    # Use both session_id and zoom_meeting_id to reach all participants
                    meeting_ended_event = {
                        "type": "meeting_ended",
                        "sessionId": session_id,
                        "zoomMeetingId": str(zoom_meeting_id),
                        "status": "completed",
                        "message": "Meeting has ended",
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    
                    # Broadcast to session room using zoom_meeting_id
                    await ws_manager.broadcast_to_session(str(zoom_meeting_id), meeting_ended_event)
                    # Also broadcast using MongoDB session_id
                    if str(zoom_meeting_id) != session_id:
                        await ws_manager.broadcast_to_session(session_id, meeting_ended_event)
                    
                    print(f"📢 Meeting ended event broadcasted to all participants")
                    
                    # Generate and save MASTER report
                    report = await SessionReportModel.generate_master_report(
                        session_id=session_id,
                        instructor_id=instructor_id or "unknown"
                    )
                    
                    if report:
                        print(f"📊 Report generated automatically: {report.get('totalParticipants', 0)} participants")
                    else:
                        print(f"⚠️ Failed to generate report for session {session_id}")
                else:
                    print(f"ℹ️ Session {session_id} already completed, skipping auto-end")
            else:
                print(f"⚠️ No session found for Zoom meeting ID: {zoom_meeting_id}")
                
        except Exception as e:
            print(f"❌ Error auto-ending session: {e}")
            import traceback
            traceback.print_exc()
        
        return {"status": "ok", "event": "meeting_ended", "session_auto_ended": True}

    return {"status": "ignored", "event": event}
