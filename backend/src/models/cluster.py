from typing import List, Literal
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

