from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import List
from ..models.user import UserModel
from ..middleware.auth import get_current_user, require_instructor
from ..database.connection import get_database
from ..utils.jwt_utils import create_access_token
import hashlib


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


def hash_password(password: str) -> str:
    """Simple password hashing (use bcrypt in production)"""
    return hashlib.sha256(password.encode()).hexdigest()


@router.post("/register")
async def register(request_data: RegisterRequest):
    """Register a new user"""
    try:
        # Check if user already exists
        existing_user = await UserModel.find_by_email(request_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists"
            )

        # Create new user
        user_data = {
            "firstName": request_data.firstName,
            "lastName": request_data.lastName,
            "email": request_data.email,
            "password": hash_password(request_data.password),  # Hash password
            "role": request_data.role,
            "status": 1,  # Active by default (can be changed to 0 for email activation)
        }

        user = await UserModel.create(user_data)
        
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
            "message": "Registration successful",
            "access_token": access_token,
            "token_type": "bearer",
            "user": user
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Registration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register"
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

