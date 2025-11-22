from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
import hmac
import hashlib
import os
from datetime import datetime
import base64
from src.database.connection import get_database

router = APIRouter(prefix="/api/zoom", tags=["Zoom Webhook"])

# -------------------------------------------------------------------
# VERIFY SIGNATURE
# -------------------------------------------------------------------
def verify_signature(secret: str, payload: bytes, timestamp: str, signature: str):
    message = f"v0:{timestamp}:{payload.decode('utf-8')}"
    hash_signature = hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    expected_signature = f"v0={hash_signature}"
    return hmac.compare_digest(signature, expected_signature)


# -------------------------------------------------------------------
# MAIN WEBHOOK ENDPOINT
# -------------------------------------------------------------------
@router.post("/webhook")
async def zoom_webhook(request: Request):
    try:
        payload_raw = await request.body()
        data = await request.json()

        event = data.get("event", "")
        print("\n============================")
        print(f"🔔 ZOOM EVENT RECEIVED: {event}")
        print("============================")

        # URL VALIDATION EVENT
        if event == "endpoint.url_validation":
            return await handle_url_validation(data)

        # PARTICIPANT JOIN
        if event in ["meeting.participant_joined", "participant.joined"]:
            return await handle_participant_joined(data)

        # PARTICIPANT LEFT
        if event in ["meeting.participant_left", "participant.left"]:
            return await handle_participant_left(data)

        return {"status": "ignored", "event": event}

    except Exception as e:
        print("❌ Webhook error:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})


# -------------------------------------------------------------------
# URL VALIDATION
# -------------------------------------------------------------------
async def handle_url_validation(data: dict):
    print("🔐 Handling URL validation...")

    plain_token = data["payload"]["plainToken"]
    secret = os.getenv("ZOOM_WEBHOOK_SECRET", "")

    if not secret:
        raise HTTPException(status_code=500, detail="ZOOM_WEBHOOK_SECRET not set")

    hashed = hmac.new(
        secret.encode("utf-8"),
        plain_token.encode("utf-8"),
        hashlib.sha256
    ).digest()

    encrypted_token = base64.b64encode(hashed).decode("utf-8")

    return {
        "plainToken": plain_token,
        "encryptedToken": encrypted_token
    }


# -------------------------------------------------------------------
# PARTICIPANT JOINED
# -------------------------------------------------------------------
async def handle_participant_joined(data: dict):
    payload = data["payload"]["object"]
    participant = payload.get("participant", {})

    db = get_database()
    await db.participants.insert_one({
        "meeting_id": payload.get("id"),
        "user_id": participant.get("user_id") or participant.get("id"),
        "name": participant.get("user_name") or participant.get("name"),
        "email": participant.get("email"),
        "join_time": datetime.utcnow(),
        "status": "joined",
    })

    print("✅ Participant stored (joined)")
    return {"status": "success", "event": "joined"}


# -------------------------------------------------------------------
# PARTICIPANT LEFT
# -------------------------------------------------------------------
async def handle_participant_left(data: dict):
    payload = data["payload"]["object"]
    participant = payload.get("participant", {})

    meeting_id = payload.get("id")
    user_id = participant.get("user_id") or participant.get("id")

    db = get_database()
    await db.participants.update_one(
        {"meeting_id": meeting_id, "user_id": user_id},
        {"$set": {"left_time": datetime.utcnow(), "status": "left"}}
    )

    print("👋 Participant left updated")
    return {"status": "success", "event": "left"}


# -------------------------------------------------------------------
# TEST ENDPOINT
# -------------------------------------------------------------------
@router.get("/webhook/test")
async def test():
    return {"status": "ok", "message": "Webhook active"}
