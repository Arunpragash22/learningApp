from typing import Dict, List, Literal, Optional
from pydantic import BaseModel



class StudentCluster(BaseModel):
    
    id: str
    name: str
    description: str
    studentCount: int
    engagementLevel: Literal["high", "medium", "low"]
    color: str
    prediction: Literal["stable", "improving", "declining"]
    students: List[str]  # Student IDs
    studentNames: Optional[Dict[str, str]] = None  # studentId -> "firstName lastName"

