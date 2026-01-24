import os
from typing import Optional
import secrets
from datetime import datetime, timedelta

# Try to import resend, fallback to None if not available
try:
    import resend
    RESEND_AVAILABLE = True
except ImportError:
    RESEND_AVAILABLE = False
    print("⚠️ Resend package not installed. Email sending disabled.")


class EmailService:
    """Service for sending emails using Resend API"""
    
    def __init__(self):
        self.resend_api_key = os.environ.get("RESEND_API_KEY", "")
        # FROM_EMAIL can be just email or "Name <email>" format
        self.from_email = os.environ.get("FROM_EMAIL", "noreply@zoomlearningapp.de")
        self.frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
        self.email_enabled = RESEND_AVAILABLE and bool(self.resend_api_key)
        
        # Initialize Resend
        if RESEND_AVAILABLE and self.resend_api_key:
            resend.api_key = self.resend_api_key
            print(f"✅ Resend email service initialized")
        elif not self.resend_api_key:
            print(f"⚠️ RESEND_API_KEY not set - emails will be logged only")
    
    def generate_verification_token(self) -> str:
        """Generate a secure verification token"""
        return secrets.token_urlsafe(32)
    
    def get_token_expiry(self, hours: int = 24) -> datetime:
        """Get token expiry datetime"""
        return datetime.utcnow() + timedelta(hours=hours)
    
    def send_email(self, to_email: str, subject: str, html_content: str) -> bool:
        """Send an email using Resend API"""
        try:
            if not RESEND_AVAILABLE:
                print(f"⚠️ Resend not available. Email would be sent to: {to_email}")
                return False
            
            if not self.resend_api_key:
                print(f"⚠️ RESEND_API_KEY not configured. Email would be sent to: {to_email}")
                print(f"   Subject: {subject}")
                return False
            
            print(f"📧 Sending email to: {to_email}")
            
            params = {
                "from": self.from_email,
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            }
            
            response = resend.Emails.send(params)
            
            print(f"✅ Email sent to: {to_email}")
            print(f"   Response ID: {response.get('id', 'N/A')}")
            return True
            
        except Exception as e:
            print(f"❌ Failed to send email to {to_email}: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def send_verification_email(self, to_email: str, first_name: str, token: str) -> bool:
        """Send account verification email"""
        verification_link = f"{self.frontend_url}/activate/{token}"
        year = datetime.now().year
        
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email - Class Pulse</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 520px;">
                    
                    <!-- Logo & Header -->
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <table role="presentation" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 12px 24px; border-radius: 50px;">
                                        <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">Class Pulse</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Card -->
                    <tr>
                        <td style="background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); overflow: hidden;">
                            
                            <!-- Green Accent Bar -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="height: 4px; background: linear-gradient(90deg, #059669 0%, #0d9488 50%, #06b6d4 100%);"></td>
                                </tr>
                            </table>
                            
                            <!-- Content -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="padding: 48px 40px;">
                                        
                                        <!-- Icon -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td align="center" style="padding-bottom: 24px;">
                                                    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 50%; display: inline-block; line-height: 64px; text-align: center;">
                                                        <span style="font-size: 28px;">✉️</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Greeting -->
                                        <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #111827; text-align: center; letter-spacing: -0.5px;">
                                            Verify your email address
                                        </h1>
                                        <p style="margin: 0 0 32px 0; font-size: 15px; color: #6b7280; text-align: center; line-height: 1.5;">
                                            Hi {first_name}, thanks for signing up! Please confirm your email to get started.
                                        </p>
                                        
                                        <!-- CTA Button -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td align="center" style="padding-bottom: 32px;">
                                                    <a href="{verification_link}" 
                                                       style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #0d9488 100%); 
                                                              color: #ffffff; padding: 16px 40px; text-decoration: none; 
                                                              border-radius: 8px; font-weight: 600; font-size: 15px;
                                                              box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);">
                                                        Verify Email Address
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Divider -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
                                                    <p style="margin: 0 0 12px 0; font-size: 13px; color: #9ca3af; text-align: center;">
                                                        Or copy and paste this link in your browser:
                                                    </p>
                                                    <p style="margin: 0; font-size: 13px; color: #059669; text-align: center; word-break: break-all; background: #f0fdf4; padding: 12px 16px; border-radius: 8px; border: 1px solid #d1fae5;">
                                                        {verification_link}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 20px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center">
                                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #9ca3af;">
                                            This link expires in 24 hours for security reasons.
                                        </p>
                                        <p style="margin: 0 0 16px 0; font-size: 13px; color: #9ca3af;">
                                            If you didn't create an account, you can safely ignore this email.
                                        </p>
                                        <p style="margin: 0; font-size: 12px; color: #d1d5db;">
                                            © {year} Class Pulse. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        """
        
        return self.send_email(to_email, "Verify your email - Class Pulse", html_content)
    
    def send_password_reset_email(self, to_email: str, first_name: str, token: str) -> bool:
        """Send password reset email"""
        reset_link = f"{self.frontend_url}/reset-password/{token}"
        year = datetime.now().year
        
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password - Class Pulse</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 520px;">
                    
                    <!-- Logo & Header -->
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <table role="presentation" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 12px 24px; border-radius: 50px;">
                                        <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">Class Pulse</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Card -->
                    <tr>
                        <td style="background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); overflow: hidden;">
                            
                            <!-- Green Accent Bar -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="height: 4px; background: linear-gradient(90deg, #059669 0%, #0d9488 50%, #06b6d4 100%);"></td>
                                </tr>
                            </table>
                            
                            <!-- Content -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="padding: 48px 40px;">
                                        
                                        <!-- Icon -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td align="center" style="padding-bottom: 24px;">
                                                    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 50%; display: inline-block; line-height: 64px; text-align: center;">
                                                        <span style="font-size: 28px;">🔐</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Greeting -->
                                        <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #111827; text-align: center; letter-spacing: -0.5px;">
                                            Reset your password
                                        </h1>
                                        <p style="margin: 0 0 32px 0; font-size: 15px; color: #6b7280; text-align: center; line-height: 1.5;">
                                            Hi {first_name}, we received a request to reset your password. Click below to create a new one.
                                        </p>
                                        
                                        <!-- CTA Button -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td align="center" style="padding-bottom: 32px;">
                                                    <a href="{reset_link}" 
                                                       style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #0d9488 100%); 
                                                              color: #ffffff; padding: 16px 40px; text-decoration: none; 
                                                              border-radius: 8px; font-weight: 600; font-size: 15px;
                                                              box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);">
                                                        Reset Password
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Divider -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td style="border-top: 1px solid #e5e7eb; padding-top: 24px;">
                                                    <p style="margin: 0 0 12px 0; font-size: 13px; color: #9ca3af; text-align: center;">
                                                        Or copy and paste this link in your browser:
                                                    </p>
                                                    <p style="margin: 0; font-size: 13px; color: #059669; text-align: center; word-break: break-all; background: #f0fdf4; padding: 12px 16px; border-radius: 8px; border: 1px solid #d1fae5;">
                                                        {reset_link}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 20px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center">
                                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #9ca3af;">
                                            This link expires in 1 hour for security reasons.
                                        </p>
                                        <p style="margin: 0 0 16px 0; font-size: 13px; color: #9ca3af;">
                                            If you didn't request this, you can safely ignore this email.
                                        </p>
                                        <p style="margin: 0; font-size: 12px; color: #d1d5db;">
                                            © {year} Class Pulse. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        """
        
        return self.send_email(to_email, "Reset your password - Class Pulse", html_content)
    
    def send_session_report_email(
        self, 
        to_email: str, 
        student_name: str, 
        session_title: str, 
        course_name: str, 
        session_id: str,
        is_instructor: bool = False
    ) -> bool:
        """Send session report notification email"""
        report_link = f"{self.frontend_url}/dashboard/sessions/{session_id}/report"
        year = datetime.now().year
        
        role_text = "instructor" if is_instructor else "student"
        intro_text = (
            f"The session <strong>{session_title}</strong> has ended. "
            f"Your session report is now available with detailed analytics and performance data."
        ) if is_instructor else (
            f"Thank you for attending <strong>{session_title}</strong>! "
            f"Your personal session report is now available with your quiz results and performance summary."
        )
        
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Session Report Available - Class Pulse</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 520px;">
                    
                    <!-- Logo & Header -->
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <table role="presentation" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 12px 24px; border-radius: 50px;">
                                        <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">Class Pulse</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Card -->
                    <tr>
                        <td style="background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); overflow: hidden;">
                            
                            <!-- Green Accent Bar -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="height: 4px; background: linear-gradient(90deg, #059669 0%, #0d9488 50%, #06b6d4 100%);"></td>
                                </tr>
                            </table>
                            
                            <!-- Content -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="padding: 48px 40px;">
                                        
                                        <!-- Icon -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td align="center" style="padding-bottom: 24px;">
                                                    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 50%; display: inline-block; line-height: 64px; text-align: center;">
                                                        <span style="font-size: 28px;">📊</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Greeting -->
                                        <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #111827; text-align: center; letter-spacing: -0.5px;">
                                            Session Report Available
                                        </h1>
                                        <p style="margin: 0 0 24px 0; font-size: 15px; color: #6b7280; text-align: center; line-height: 1.5;">
                                            Hi {student_name}, {intro_text}
                                        </p>
                                        
                                        <!-- Session Details -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; background: #f9fafb; border-radius: 8px;">
                                            <tr>
                                                <td style="padding: 16px;">
                                                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Session</p>
                                                    <p style="margin: 0 0 12px 0; font-size: 16px; color: #111827; font-weight: 600;">{session_title}</p>
                                                    <p style="margin: 0; font-size: 14px; color: #6b7280;">{course_name}</p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- CTA Button -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td align="center" style="padding-bottom: 24px;">
                                                    <a href="{report_link}" 
                                                       style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #0d9488 100%); 
                                                              color: #ffffff; padding: 16px 40px; text-decoration: none; 
                                                              border-radius: 8px; font-weight: 600; font-size: 15px;
                                                              box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);">
                                                        View Report
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Download note -->
                                        <p style="margin: 0; font-size: 13px; color: #9ca3af; text-align: center;">
                                            You can also download the report as a PDF from the report page.
                                        </p>
                                        
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 32px 20px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center">
                                        <p style="margin: 0 0 16px 0; font-size: 13px; color: #9ca3af;">
                                            This report contains your personalized learning analytics.
                                        </p>
                                        <p style="margin: 0; font-size: 12px; color: #d1d5db;">
                                            © {year} Class Pulse. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        """
        
        return self.send_email(to_email, f"Session Report: {session_title} - Class Pulse", html_content)


# Singleton instance
email_service = EmailService()
