from fastapi import APIRouter, Request
import hmac
import hashlib
import base64
import os
import json
from datetime import datetime
from src.database.connection import get_database

# Prefix gives /api/zoom/... URLs
router = APIRouter(prefix="/api/zoom", tags=["Zoom Webhook"])


# ------------------------------------------
# URL VALIDATION + EVENT DISPATCH
# ------------------------------------------
@router.post("/webhook")
async def zoom_webhook(request: Request):
    body_bytes = await request.body()
    body_text = body_bytes.decode("utf-8")

    print("\n===== ZOOM WEBHOOK RECEIVED =====")
    print(body_text[:400])

    data = json.loads(body_text)
    event = data.get("event", "")

    # -------------------------------------------------
    # 1) URL VALIDATION (first time when you click Validate)
    # -------------------------------------------------
    if event == "endpoint.url_validation":
        plain_token = data["payload"]["plainToken"]
        secret = os.getenv("ZOOM_WEBHOOK_SECRET", "")

        # Hash plainToken with your webhook secret (Zoom docs)
        hashed = hmac.new(
            secret.encode("utf-8"),
            plain_token.encode("utf-8"),
            hashlib.sha256
        ).digest()

        encrypted_token = base64.b64encode(hashed).decode("utf-8")

        print("✅ URL validation handled")
        return {
            "plainToken": plain_token,
            "encryptedToken": encrypted_token
        }

    # -------------------------------------------------
    # 2) PARTICIPANT JOINED
    # -------------------------------------------------
    if event in ["meeting.participant_joined", "participant.joined"]:
        return await handle_participant_joined(data)

    # -------------------------------------------------
    # 3) PARTICIPANT LEFT
    # -------------------------------------------------
    if event in ["meeting.participant_left", "participant.left"]:
        return await handle_participant_left(data)

    # -------------------------------------------------
    # 4) OTHER EVENTS – JUST LOG
    # -------------------------------------------------
    print(f"ℹ️ Unhandled event type: {event}")
    return {"status": "ignored", "event": event}


# ------------------------------------------
# PARTICIPANT JOINED
# ------------------------------------------
async def handle_participant_joined(data: dict):
    obj = data["payload"]["object"]
    participant = obj.get("participant", {})

    meeting_id = obj.get("id")
    user_id = participant.get("user_id") or participant.get("id")
    name = participant.get("user_name") or participant.get("name")
    email = participant.get("email")

    db = get_database()
    await db.participants.insert_one({
        "zoom_meeting_id": str(meeting_id),
        "user_id": str(user_id),
        "name": name,
        "email": email,
        "join_time": datetime.utcnow(),
        "status": "joined",
        "raw": participant,
    })

    print(f"✅ STORED joined participant: {name} ({user_id})")
    return {"status": "success", "event": "joined"}


# ------------------------------------------
# PARTICIPANT LEFT
# ------------------------------------------
async def handle_participant_left(data: dict):
    obj = data["payload"]["object"]
    participant = obj.get("participant", {})

    meeting_id = obj.get("id")
    user_id = participant.get("user_id") or participant.get("id")

    db = get_database()
    await db.participants.update_one(
        {
            "zoom_meeting_id": str(meeting_id),
            "user_id": str(user_id),
        },
        {
            "$set": {
                "left_time": datetime.utcnow(),
                "status": "left",
            }
        },
        upsert=True,  # in case we never saw the join event
    )

    print(f"👋 UPDATED left participant: {user_id}")
    return {"status": "success", "event": "left"}


# ------------------------------------------
# SIMPLE TEST ENDPOINT
# ------------------------------------------
@router.get("/webhook/test")
async def test_webhook():
    return {"status": "ok", "message": "Webhook active"}
