"""
Push Notification Service
Handles sending Web Push notifications using pywebpush
"""
import os
import json
from urllib.parse import urlparse
from pywebpush import webpush, WebPushException
from ..database.connection import db


class PushNotificationService:
    """Service for sending Web Push notifications"""
    
    def __init__(self):
        self.vapid_private_key = os.environ.get("VAPID_PRIVATE_KEY")
        self.vapid_public_key = os.environ.get("VAPID_PUBLIC_KEY")
        self.vapid_claims = {
            "sub": os.environ.get("VAPID_SUBJECT", "mailto:admin@learningapp.com")
        }
        
        if not self.vapid_private_key or not self.vapid_public_key:
            print("⚠️ VAPID keys not configured. Push notifications will not work.")
    
    async def send_to_student(self, student_id: str, payload: dict) -> bool:
        """
        Send push notification to a specific student
        
        Args:
            student_id: The student's ID
            payload: Dictionary with title, body, url, etc.
        
        Returns:
            bool: True if sent successfully, False otherwise
        """
        if not self.vapid_private_key:
            print("❌ Cannot send push: VAPID keys not configured")
            return False
        
        try:
            # Find all subscriptions for this student
            cursor = db.database.push_subscriptions.find({"studentId": student_id})
            subscriptions = await cursor.to_list(length=None)
            
            if not subscriptions:
                print(f"No push subscriptions found for student {student_id}")
                return False
            
            success_count = 0
            
            for sub in subscriptions:
                try:
                    subscription_info = {
                        "endpoint": sub["endpoint"],
                        "keys": sub["keys"]
                    }
                    
                    # Extract origin from endpoint URL for aud claim
                    endpoint_url = sub["endpoint"]
                    parsed_url = urlparse(endpoint_url)
                    origin = f"{parsed_url.scheme}://{parsed_url.netloc}"
                    
                    # Create vapid_claims with aud claim
                    vapid_claims_with_aud = {
                        **self.vapid_claims,
                        "aud": origin
                    }
                    
                    # Send the push notification
                    webpush(
                        subscription_info=subscription_info,
                        data=json.dumps(payload),
                        vapid_private_key=self.vapid_private_key,
                        vapid_claims=vapid_claims_with_aud
                    )
                    
                    success_count += 1
                    print(f"✅ Push sent to student {student_id}")
                    
                except WebPushException as e:
                    print(f"❌ WebPush failed for student {student_id}: {e}")
                    
                    # If subscription is expired (410 status), remove it
                    if e.response and e.response.status_code == 410:
                        await db.database.push_subscriptions.delete_one({"_id": sub["_id"]})
                        print(f"🗑️ Removed expired subscription for student {student_id}")
                except Exception as e:
                    print(f"❌ Error sending push to student {student_id}: {e}")
            
            return success_count > 0
            
        except Exception as e:
            print(f"❌ Error in send_to_student: {e}")
            return False
    
    async def send_to_all_students(self, payload: dict) -> int:
        """
        Send push notification to all subscribed students
        
        Args:
            payload: Dictionary with title, body, url, etc.
        
        Returns:
            int: Number of successful sends
        """
        if not self.vapid_private_key:
            print("❌ Cannot send push: VAPID keys not configured")
            return 0
        
        try:
            # Get all unique student IDs
            cursor = db.database.push_subscriptions.find({})
            subscriptions = await cursor.to_list(length=None)
            
            if not subscriptions:
                print("No push subscriptions found")
                return 0
            
            # Get unique student IDs (one notification per student, even if they have multiple devices)
            student_ids = list(set([sub["studentId"] for sub in subscriptions]))
            
            # Log subscription statistics
            total_subscriptions = len(subscriptions)
            unique_students = len(student_ids)
            print(f"📊 Push notification stats:")
            print(f"   - Total subscriptions: {total_subscriptions}")
            print(f"   - Unique students: {unique_students}")
            print(f"   - Average devices per student: {total_subscriptions / unique_students if unique_students > 0 else 0:.2f}")
            
            success_count = 0
            
            for student_id in student_ids:
                sent = await self.send_to_student(student_id, payload)
                if sent:
                    success_count += 1
            
            print(f"📤 Sent push notifications to {success_count}/{unique_students} students")
            return success_count
            
        except Exception as e:
            print(f"❌ Error in send_to_all_students: {e}")
            return 0
    
    async def send_quiz_notification(self, quiz_data: dict) -> int:
        """
        Send quiz notification to all students
        
        Args:
            quiz_data: Dictionary containing question, options, etc.
        
        Returns:
            int: Number of successful sends
        """
        payload = {
            "title": "📝 New Quiz Question!",
            "body": quiz_data.get("question", "A new quiz question is available"),
            "url": "/dashboard/student",  # URL to open when notification is clicked
            "icon": "/favicon.ico",
            "badge": "/favicon.ico",
            "data": {
                "questionId": quiz_data.get("questionId"),
                "sessionId": quiz_data.get("sessionId"),
                "timeLimit": quiz_data.get("timeLimit", 20)
            }
        }
        
        return await self.send_to_all_students(payload)


# Create singleton instance
push_service = PushNotificationService()

