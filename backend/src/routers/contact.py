from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from datetime import datetime

from src.services.email_service import email_service
from src.database.connection import get_database

router = APIRouter(prefix="/api/contact", tags=["Contact"])

CONTACT_RECIPIENT = "techsnatchers@gmail.com"


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    message: str


@router.post("")
async def send_contact_message(payload: ContactRequest):
    name = payload.name.strip()
    email = payload.email.strip()
    message = payload.message.strip()

    if not name or not message:
        raise HTTPException(status_code=400, detail="Name and message are required")

    year = datetime.now().year
    html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="background:linear-gradient(135deg,#3B82F6,#2563eb);padding:10px 24px;border-radius:50px;color:#fff;font-size:20px;font-weight:700;display:inline-block;">ClassPulse</span>
        </td></tr>
        <tr><td style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td style="height:4px;background:linear-gradient(90deg,#3B82F6,#2563eb,#1d4ed8);"></td></tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">New Contact Message</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">You received a new message from the ClassPulse contact form.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;background:#f9fafb;border-radius:8px;">
                <tr><td style="padding:16px;">
                  <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;text-transform:uppercase;">From</p>
                  <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111827;">{name}</p>
                  <p style="margin:0;font-size:14px;color:#3B82F6;">{email}</p>
                </td></tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;border-radius:8px;">
                <tr><td style="padding:16px;">
                  <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;text-transform:uppercase;">Message</p>
                  <p style="margin:0;font-size:15px;color:#111827;line-height:1.6;white-space:pre-wrap;">{message}</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 20px;" align="center">
          <p style="margin:0;font-size:12px;color:#d1d5db;">&copy; {year} ClassPulse by TechSnatchers. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    sent = email_service.send_email(
        to_email=CONTACT_RECIPIENT,
        subject=f"ClassPulse Contact: {name}",
        html_content=html_content,
    )

    db = get_database()
    if db is not None:
        try:
            await db.contact_messages.insert_one({
                "name": name,
                "email": email,
                "message": message,
                "emailSent": sent,
                "createdAt": datetime.utcnow(),
            })
        except Exception as e:
            print(f"⚠️ Failed to save contact message: {e}")

    if not sent:
        print(f"⚠️ Contact email not sent (Resend may not be configured), but message saved to DB")

    return {"success": True, "message": "Your message has been received. We will get back to you soon!"}
