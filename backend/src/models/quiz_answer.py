from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class NetworkStrength(BaseModel):
    """Network strength at the moment of answering"""
    quality: str  # excellent, good, fair, poor, critical, unknown
    rttMs: Optional[float] = None  # Round-trip time in milliseconds
    jitterMs: Optional[float] = None  # Jitter in milliseconds


class QuizAnswer(BaseModel):
    questionId: str
    answerIndex: int
    timeTaken: float  # in seconds
    studentId: str
    sessionId: str
    timestamp: Optional[datetime] = None
    networkStrength: Optional[NetworkStrength] = None  # Network quality at answer time
    isCorrect: Optional[bool] = None  # Set when storing so session stats can be computed without re-checking question

    class Config:
        json_schema_extra = {
            "example": {
                "questionId": "1",
                "answerIndex": 1,
                "timeTaken": 5.5,
                "studentId": "student123",
                "sessionId": "session456",
                "networkStrength": {
                    "quality": "good",
                    "rttMs": 45,
                    "jitterMs": 5
                }
            }
        }

