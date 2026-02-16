from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from pydantic import BaseModel
from bson import ObjectId
from ..services.clustering_service import ClusteringService
from ..models.cluster import StudentCluster
from ..middleware.auth import get_current_user
from ..database.connection import get_database

router = APIRouter(prefix="/api/clustering", tags=["clustering"])
clustering_service = ClusteringService()


async def _resolve_student_names(student_ids: List[str]) -> Dict[str, str]:
    """Look up student names from the users collection.
    Returns a dict mapping studentId -> 'firstName lastName'."""
    if not student_ids:
        return {}

    db = get_database()
    if db is None:
        return {}

    names: Dict[str, str] = {}
    object_ids = []
    for sid in student_ids:
        try:
            object_ids.append(ObjectId(sid))
        except Exception:
            pass

    if object_ids:
        async for user in db.users.find(
            {"_id": {"$in": object_ids}},
            {"firstName": 1, "lastName": 1}
        ):
            uid = str(user["_id"])
            first = user.get("firstName", "")
            last = user.get("lastName", "")
            names[uid] = f"{first} {last}".strip() or f"Student {uid[:8]}"

    return names


class UpdateClustersRequest(BaseModel):
    sessionId: str
    quizPerformance: Optional[Dict] = None


@router.get("/session/{session_id}")
async def get_clusters(
    session_id: str,
    request: Request,
    user: dict = Depends(get_current_user)
):
    """Get clusters for a session"""
    try:
        if not session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing sessionId"
            )

        print(f"Getting clusters for session: {session_id}")
        clusters = await clustering_service.get_clusters(session_id)
        print(f"Returning {len(clusters)} clusters for session {session_id}")

        # Resolve student names from the users collection
        all_student_ids = []
        for c in clusters:
            all_student_ids.extend(c.students)
        student_names = await _resolve_student_names(list(set(all_student_ids)))

        # Attach names to each cluster before returning
        enriched = []
        for c in clusters:
            cluster_dict = c.model_dump()
            cluster_dict["studentNames"] = {
                sid: student_names.get(sid, f"Student {sid[:8]}")
                for sid in c.students
            }
            enriched.append(cluster_dict)

        return enriched
    except Exception as e:
        print(f"Error getting clusters: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/update")
async def update_clusters(
    request_data: UpdateClustersRequest,
    request: Request,
    user: dict = Depends(get_current_user)
):
    """Update clusters based on quiz performance"""
    try:
        if not request_data.sessionId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing sessionId"
            )

        print(
            f"Updating clusters for session: {request_data.sessionId}",
            request_data.quizPerformance
        )
        clusters = await clustering_service.update_clusters(
            request_data.sessionId,
            request_data.quizPerformance
        )

        # Resolve student names
        all_student_ids = []
        for c in clusters:
            all_student_ids.extend(c.students)
        student_names = await _resolve_student_names(list(set(all_student_ids)))

        enriched = []
        for c in clusters:
            cluster_dict = c.model_dump()
            cluster_dict["studentNames"] = {
                sid: student_names.get(sid, f"Student {sid[:8]}")
                for sid in c.students
            }
            enriched.append(cluster_dict)

        return enriched
    except Exception as e:
        print(f"Error updating clusters: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/student/{student_id}")
async def get_student_cluster(
    student_id: str,
    session_id: str = Query(..., alias="sessionId"),
    user: dict = Depends(get_current_user)
):
    """Get student's cluster assignment"""
    try:
        if not student_id or not session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required parameters"
            )

        cluster_id = await clustering_service.get_student_cluster(
            student_id, session_id
        )

        return {"clusterId": cluster_id}
    except Exception as e:
        print(f"Error getting student cluster: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

