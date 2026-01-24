from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from ..models.user import UserModel
from ..middleware.auth import get_current_user, require_instructor
from ..database.connection import get_database
from ..utils.jwt_utils import create_access_token
from ..services.email_service import email_service
from ..services.mysql_backup_service import mysql_backup_service
from datetime import datetime
import hashlib
import asyncio


router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    firstName: str
    lastName: str
    email: EmailStr
    password: str
    role: str = "student"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


def hash_password(password: str) -> str:
    """Simple password hashing (use bcrypt in production)"""
    return hashlib.sha256(password.encode()).hexdigest()


@router.post("/register")
async def register(request_data: RegisterRequest):
    """Register a new user with email verification"""
    try:
        # Check if user already exists
        existing_user = await UserModel.find_by_email(request_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists"
            )

        # Generate verification token
        verification_token = email_service.generate_verification_token()
        token_expiry = email_service.get_token_expiry(hours=24)

        # Create new user with pending status
        user_data = {
            "firstName": request_data.firstName,
            "lastName": request_data.lastName,
            "email": request_data.email,
            "password": hash_password(request_data.password),
            "role": request_data.role,
            "status": 0,  # Pending - requires email verification
            "verificationToken": verification_token,
            "verificationTokenExpiry": token_expiry,
        }

        user = await UserModel.create(user_data)
        
        # ============================================================
        # MYSQL BACKUP: Backup new user to MySQL (non-blocking)
        # ============================================================
        try:
            asyncio.create_task(mysql_backup_service.backup_user(user))
            print(f"📦 MySQL backup triggered for new user: {user.get('email')}")
        except Exception as e:
            print(f"⚠️ MySQL user backup failed (non-fatal): {e}")
        
        # Send verification email
        email_sent = email_service.send_verification_email(
            to_email=request_data.email,
            first_name=request_data.firstName,
            token=verification_token
        )
        
        # Remove sensitive data from response
        user.pop("password", None)
        user.pop("_id", None)
        user.pop("verificationToken", None)
        user.pop("verificationTokenExpiry", None)
        
        # Ensure all datetime objects are converted to ISO format strings
        if "createdAt" in user and hasattr(user["createdAt"], "isoformat"):
            user["createdAt"] = user["createdAt"].isoformat()
        if "updatedAt" in user and hasattr(user["updatedAt"], "isoformat"):
            user["updatedAt"] = user["updatedAt"].isoformat()
        
        return {
            "success": True,
            "message": "Registration successful! Please check your email to verify your account.",
            "emailSent": email_sent,
            "user": {
                "email": user.get("email"),
                "firstName": user.get("firstName"),
                "lastName": user.get("lastName"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Registration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register"
        )


@router.post("/verify-email/{token}")
async def verify_email(token: str):
    """Verify user email with token"""
    try:
        database = get_database()
        if database is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database not connected"
            )
        
        # Find user with this verification token
        user = await database.users.find_one({"verificationToken": token})
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification link"
            )
        
        # Check if token is expired
        token_expiry = user.get("verificationTokenExpiry")
        if token_expiry and datetime.utcnow() > token_expiry:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification link has expired. Please request a new one."
            )
        
        # Activate user account
        await database.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "status": 1,
                    "emailVerified": True,
                    "emailVerifiedAt": datetime.utcnow(),
                    "updatedAt": datetime.utcnow()
                },
                "$unset": {
                    "verificationToken": "",
                    "verificationTokenExpiry": ""
                }
            }
        )
        
        return {
            "success": True,
            "message": "Email verified successfully! You can now log in."
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Email verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify email"
        )


@router.post("/resend-verification")
async def resend_verification(request_data: ResendVerificationRequest):
    """Resend verification email"""
    try:
        user = await UserModel.find_by_email(request_data.email)
        
        if not user:
            # Don't reveal if email exists
            return {
                "success": True,
                "message": "If an account exists with this email, a verification link has been sent."
            }
        
        if user.get("status") == 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Account is already verified"
            )
        
        # Generate new verification token
        verification_token = email_service.generate_verification_token()
        token_expiry = email_service.get_token_expiry(hours=24)
        
        # Update user with new token
        database = get_database()
        await database.users.update_one(
            {"email": request_data.email},
            {
                "$set": {
                    "verificationToken": verification_token,
                    "verificationTokenExpiry": token_expiry,
                    "updatedAt": datetime.utcnow()
                }
            }
        )
        
        # Send verification email
        email_service.send_verification_email(
            to_email=request_data.email,
            first_name=user.get("firstName", "User"),
            token=verification_token
        )
        
        return {
            "success": True,
            "message": "Verification email sent! Please check your inbox."
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Resend verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resend verification email"
        )


@router.post("/forgot-password")
async def forgot_password(request_data: ForgotPasswordRequest):
    """Send password reset email"""
    try:
        if not email_service.email_enabled:
            return {
                "success": True,
                "emailSent": False,
                "message": "Email service is not configured. Please contact the administrator."
            }

        user = await UserModel.find_by_email(request_data.email)
        
        # Always return success to prevent email enumeration
        if not user:
            return {
                "success": True,
                "emailSent": True,
                "message": "If an account exists with this email, a password reset link has been sent."
            }
        
        # Generate reset token
        reset_token = email_service.generate_verification_token()
        token_expiry = email_service.get_token_expiry(hours=1)
        
        # Update user with reset token
        database = get_database()
        await database.users.update_one(
            {"email": request_data.email},
            {
                "$set": {
                    "resetPasswordToken": reset_token,
                    "resetPasswordTokenExpiry": token_expiry,
                    "updatedAt": datetime.utcnow()
                }
            }
        )
        
        # Send password reset email
        email_sent = email_service.send_password_reset_email(
            to_email=request_data.email,
            first_name=user.get("firstName", "User"),
            token=reset_token
        )
        
        return {
            "success": True,
            "emailSent": email_sent,
            "message": "If an account exists with this email, a password reset link has been sent."
        }
    except Exception as e:
        print(f"Forgot password error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process request"
        )


@router.post("/reset-password")
async def reset_password(request_data: ResetPasswordRequest):
    """Reset password with token"""
    try:
        database = get_database()
        if database is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database not connected"
            )
        
        # Find user with this reset token
        user = await database.users.find_one({"resetPasswordToken": request_data.token})
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset link"
            )
        
        # Check if token is expired
        token_expiry = user.get("resetPasswordTokenExpiry")
        if token_expiry and datetime.utcnow() > token_expiry:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset link has expired. Please request a new one."
            )
        
        # Update password
        await database.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "password": hash_password(request_data.password),
                    "updatedAt": datetime.utcnow()
                },
                "$unset": {
                    "resetPasswordToken": "",
                    "resetPasswordTokenExpiry": ""
                }
            }
        )
        
        return {
            "success": True,
            "message": "Password reset successfully! You can now log in with your new password."
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Reset password error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset password"
        )


@router.post("/login")
async def login(request_data: LoginRequest):
    """Login user"""
    try:
        # Find user by email
        user = await UserModel.find_by_email(request_data.email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Check password
        hashed_password = hash_password(request_data.password)
        if user.get("password") != hashed_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Check if account is active
        if user.get("status") == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account not activated. Please check your email for activation link."
            )

        # Remove password and _id from response
        user.pop("password", None)
        user.pop("_id", None)
        
        # Ensure all datetime objects are converted to ISO format strings
        if "createdAt" in user and hasattr(user["createdAt"], "isoformat"):
            user["createdAt"] = user["createdAt"].isoformat()
        if "updatedAt" in user and hasattr(user["updatedAt"], "isoformat"):
            user["updatedAt"] = user["updatedAt"].isoformat()

        # Create JWT token
        token_data = {
            "sub": user.get("id"),  # Subject (user ID)
            "email": user.get("email"),
            "role": user.get("role"),
        }
        access_token = create_access_token(token_data)

        return {
            "success": True,
            "message": "Login successful",
            "access_token": access_token,
            "token_type": "bearer",
            "user": user
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to login"
        )


@router.get("/users")
async def get_all_users(user: dict = Depends(require_instructor)):
    """Get all registered users (instructor/admin only)"""
    try:
        database = get_database()
        if database is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database not connected"
            )
        
        users = []
        async for user_doc in database.users.find():
            user_doc["id"] = str(user_doc["_id"])
            del user_doc["_id"]
            # Remove password from response
            user_doc.pop("password", None)
            users.append(user_doc)
        
        return {
            "success": True,
            "count": len(users),
            "users": users
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching users: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch users"
        )

