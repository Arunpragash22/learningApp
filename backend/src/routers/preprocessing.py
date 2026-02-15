"""
Preprocessing Router
====================

Endpoints to trigger and retrieve preprocessed engagement data
for a session.  All data is fetched from MongoDB (quiz_answers,
session_participants, latency_metrics) and the results are stored
back into the preprocessed_engagement collection.

After preprocessing, the KMeans model automatically clusters
students into Active / Moderate / At-Risk groups.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from ..models.preprocessing import PreprocessingService
from ..services.clustering_service import ClusteringService
from ..middleware.auth import get_current_user

router = APIRouter(prefix="/api/preprocessing", tags=["preprocessing"])

preprocessing_service = PreprocessingService()
clustering_service = ClusteringService()


class PreprocessRequest(BaseModel):
    sessionId: str


@router.post("/run")
async def run_preprocessing(
    request_data: PreprocessRequest,
    user: dict = Depends(get_current_user),
):
    """
    Trigger preprocessing + KMeans clustering for a session.

    Flow:
      1. Fetch quiz answers + participant + latency data from MongoDB
      2. Compute engagement scores (preprocessing)
      3. Store preprocessed data in `preprocessed_engagement` collection
      4. Run KMeans model → cluster students into Active / Moderate / At-Risk
      5. Store cluster results in `clusters` collection
    """
    try:
        if not request_data.sessionId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing sessionId",
            )

        session_id = request_data.sessionId

        # ── Step 1-3: Preprocessing ─────────────────────────────────
        print(f"🔄 Running preprocessing for session: {session_id}")
        docs = await preprocessing_service.run(session_id)
        print(f"✅ Preprocessing complete: {len(docs)} rows stored")

        # ── Step 4-5: KMeans Clustering ─────────────────────────────
        clusters = []
        cluster_summary = {}
        if docs:
            print(f"🔄 Running KMeans clustering for session: {session_id}")
            clusters = await clustering_service.update_clusters(session_id)
            cluster_summary = {
                c.engagementLevel: {
                    "name": c.name,
                    "studentCount": c.studentCount,
                    "students": c.students,
                }
                for c in clusters
            }
            print(f"✅ Clustering complete: {len(clusters)} clusters created")

        return {
            "success": True,
            "sessionId": session_id,
            "rowsProcessed": len(docs),
            "clusters": cluster_summary,
        }
    except Exception as e:
        print(f"❌ Error in preprocessing/clustering: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Preprocessing failed: {str(e)}",
        )


@router.get("/session/{session_id}")
async def get_preprocessed_data(
    session_id: str,
    user: dict = Depends(get_current_user),
):
    """Return the stored preprocessed engagement data for a session."""
    try:
        docs = await preprocessing_service.get_preprocessed(session_id)
        return {"sessionId": session_id, "count": len(docs), "data": docs}
    except Exception as e:
        print(f"Error fetching preprocessed data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch preprocessed data: {str(e)}",
        )


@router.get("/session/{session_id}/student/{student_id}")
async def get_student_preprocessed_data(
    session_id: str,
    student_id: str,
    user: dict = Depends(get_current_user),
):
    """Return preprocessed engagement data for a single student."""
    try:
        docs = await preprocessing_service.get_student_engagement(
            session_id, student_id
        )
        return {
            "sessionId": session_id,
            "studentId": student_id,
            "count": len(docs),
            "data": docs,
        }
    except Exception as e:
        print(f"Error fetching student preprocessed data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch student data: {str(e)}",
        )
