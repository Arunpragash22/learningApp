"""
Push Notification Router
Handles Web Push subscription and sending notifications
"""
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from ..database.connection import db
from ..middleware.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["Push Notifications"])


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict  # Contains p256dh and auth


@router.post("/subscribe")
async def subscribe_to_push(
    subscription: PushSubscription,
    user: dict = Depends(get_current_user)
):
    """
    Save a student's push subscription to MongoDB
    """
    try:
        # Only students should subscribe to quiz notifications
        if user.get("role") not in ["student"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only students can subscribe to push notifications"
            )
        
        student_id = user.get("id")
        
        # Use upsert to prevent duplicate subscriptions from same device
        # This ensures one subscription per student per endpoint (device)
        doc = {
            "studentId": student_id,
            "endpoint": subscription.endpoint,
            "keys": subscription.keys,
            "updatedAt": datetime.utcnow()
        }
        
        # Check if subscription already exists for this student+endpoint
        existing = await db.database.push_subscriptions.find_one({
            "studentId": student_id,
            "endpoint": subscription.endpoint
        })
        
        if existing:
            # Update existing subscription
            result = await db.database.push_subscriptions.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "keys": subscription.keys,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )
            subscription_id = str(existing["_id"])
            message = "Subscription updated"
        else:
            # Create new subscription with createdAt
            doc["createdAt"] = datetime.utcnow()
            result = await db.database.push_subscriptions.insert_one(doc)
            subscription_id = str(result.inserted_id)
            message = "Subscription saved"
        
        # Log subscription count for this student
        student_subscriptions = await db.database.push_subscriptions.count_documents({
            "studentId": student_id
        })
        
        # Log total unique subscribed students
        unique_students = await db.database.push_subscriptions.distinct("studentId")
        print(f"📱 Push subscription saved: student={student_id}, endpoint={subscription.endpoint[:50]}...")
        print(f"📊 Total subscriptions for this student: {student_subscriptions}")
        print(f"👥 Total unique subscribed students: {len(unique_students)}")
        
        return {
            "success": True,
            "message": message,
            "subscriptionId": subscription_id,
            "totalSubscriptions": student_subscriptions,
            "totalUniqueStudents": len(unique_students)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error saving push subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save push subscription"
        )


@router.get("/stats")
async def get_subscription_stats(
    user: dict = Depends(get_current_user)
):
    """
    Get push notification subscription statistics
    Only instructors/admins can view stats
    """
    try:
        # Only instructors/admins can view stats
        if user.get("role") not in ["instructor", "admin"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only instructors and admins can view subscription stats"
            )
        
        # Get all subscriptions
        cursor = db.database.push_subscriptions.find({})
        subscriptions = await cursor.to_list(length=None)
        
        # Calculate statistics
        total_subscriptions = len(subscriptions)
        unique_students = len(set([sub["studentId"] for sub in subscriptions]))
        
        # Count subscriptions per student
        student_subscription_counts = {}
        for sub in subscriptions:
            student_id = sub["studentId"]
            student_subscription_counts[student_id] = student_subscription_counts.get(student_id, 0) + 1
        
        # Find students with multiple subscriptions (multiple devices)
        multi_device_students = sum(1 for count in student_subscription_counts.values() if count > 1)
        
        return {
            "success": True,
            "stats": {
                "totalSubscriptions": total_subscriptions,
                "uniqueStudents": unique_students,
                "studentsWithMultipleDevices": multi_device_students,
                "averageDevicesPerStudent": round(total_subscriptions / unique_students if unique_students > 0 else 0, 2)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting subscription stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get subscription stats"
        )


@router.delete("/unsubscribe")
async def unsubscribe_from_push(
    endpoint: str,
    user: dict = Depends(get_current_user)
):
    """
    Remove a student's push subscription
    """
    try:
        student_id = user.get("id")
        
        result = await db.database.push_subscriptions.delete_one({
            "studentId": student_id,
            "endpoint": endpoint
        })
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found"
            )
        
        return {
            "success": True,
            "message": "Subscription removed"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error removing push subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove push subscription"
        )

