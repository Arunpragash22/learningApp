from typing import Dict, List, Optional
from bson import ObjectId
from ..database.connection import get_database
from .cluster import StudentCluster

# Mapping from cluster engagementLevel to question targetCluster label
ENGAGEMENT_TO_TARGET: Dict[str, str] = {
    "low": "passive",
    "medium": "moderate",
    "high": "active",
}



class ClusterModel:
    @staticmethod
    async def find_by_session(session_id: str) -> List[dict]:
        """Find clusters for a session"""
        database = get_database()
        if database is None:
            return []
        
        clusters = []
        async for cluster in database.clusters.find({"sessionId": session_id}):
            cluster["id"] = str(cluster["_id"])
            del cluster["_id"]
            clusters.append(cluster)
        return clusters

    @staticmethod
    async def create(cluster_data: dict) -> dict:
        """Create a cluster"""
        database = get_database()
        if database is None:
            raise Exception("Database not connected")
        
        result = await database.clusters.insert_one(cluster_data)
        cluster_data["id"] = str(result.inserted_id)
        return cluster_data

    @staticmethod
    async def update_clusters_for_session(session_id: str, clusters: List[StudentCluster]) -> List[dict]:
        """Update clusters for a session (replace all)"""
        database = get_database()
        if database is None:
            return []
        
        # Delete existing clusters for this session
        await database.clusters.delete_many({"sessionId": session_id})
        
        # Insert new clusters
        cluster_docs = []
        for cluster in clusters:
            cluster_data = cluster.model_dump()
            cluster_data["sessionId"] = session_id
            result = await database.clusters.insert_one(cluster_data)
            cluster_data["id"] = str(result.inserted_id)
            cluster_docs.append(cluster_data)
        
        return cluster_docs

    @staticmethod
    async def find_student_cluster(student_id: str, session_id: str) -> Optional[str]:
        """Find which cluster a student belongs to"""
        database = get_database()
        if database is None:
            return None
        
        async for cluster in database.clusters.find({"sessionId": session_id}):
            if student_id in cluster.get("students", []):
                return str(cluster["_id"])
        return None

    @staticmethod
    async def get_student_cluster_map(session_id: str) -> Dict[str, str]:
        """
        Build a mapping of student_id → targetCluster label for a session.
        Returns e.g. {"student_abc": "passive", "student_xyz": "active", ...}
        Tries both the provided session_id and any resolved MongoDB/Zoom IDs.
        """
        database = get_database()
        if database is None:
            return {}

        student_map: Dict[str, str] = {}

        async for cluster in database.clusters.find({"sessionId": session_id}):
            engagement = cluster.get("engagementLevel", "")
            target = ENGAGEMENT_TO_TARGET.get(engagement)
            if not target:
                continue
            for sid in cluster.get("students", []):
                student_map[sid] = target

        return student_map

