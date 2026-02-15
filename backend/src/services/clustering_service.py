from typing import Dict, List, Optional
from ..models.cluster import StudentCluster
from ..models.cluster_model import ClusterModel
from ..models.latency_metrics import LatencyMetricsModel
from ..models.preprocessing import PreprocessingService
from ..ml_models.kmeans_predictor import KMeansPredictor

# ── Cluster metadata (label → display info) ─────────────────────
CLUSTER_META = {
    "high": {
        "name": "Active Participants",
        "description": "Highly engaged students",
        "color": "#10b981",
        "prediction": "stable",
    },
    "medium": {
        "name": "Moderate Participants",
        "description": "Moderately engaged students",
        "color": "#f59e0b",
        "prediction": "improving",
    },
    "low": {
        "name": "At-Risk Students",
        "description": "Low engagement, need support",
        "color": "#ef4444",
        "prediction": "declining",
    },
}


class ClusteringService:
    """
    Clustering service for student engagement analysis.

    Uses a pre-trained KMeans (k=3) model to assign students to
    engagement clusters based on preprocessed engagement scores.

    Also incorporates WebRTC-aware connection latency monitoring
    to contextualize engagement analysis. Students with poor network
    conditions are not misclassified as disengaged.
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ClusteringService, cls).__new__(cls)
            cls._instance._predictor = KMeansPredictor()
            cls._instance._preprocessing = PreprocessingService()
        return cls._instance

    # ── GET clusters (from DB or run prediction) ────────────────────
    async def get_clusters(self, session_id: str) -> List[StudentCluster]:
        """Get clusters from MongoDB or create default ones"""
        # Try to get clusters from database
        cluster_docs = await ClusterModel.find_by_session(session_id)

        if len(cluster_docs) > 0:
            return [StudentCluster(**doc) for doc in cluster_docs]

        # No clusters saved yet → return defaults (will be replaced
        # once update_clusters / predict_clusters is called)
        default_clusters = self._build_default_clusters()
        await ClusterModel.update_clusters_for_session(session_id, default_clusters)
        return default_clusters

    # ── UPDATE clusters using KMeans model ──────────────────────────
    async def update_clusters(
        self,
        session_id: str,
        quiz_performance: Optional[Dict] = None
    ) -> List[StudentCluster]:
        """
        Re-cluster students for a session using the KMeans model.

        1. Fetch preprocessed engagement data from MongoDB
        2. Run KMeans prediction
        3. Build StudentCluster objects with real student lists
        4. Save to MongoDB and return
        """
        # Try ML-based clustering first
        clusters = await self._predict_clusters(session_id)

        if clusters:
            await ClusterModel.update_clusters_for_session(session_id, clusters)
            return clusters

        # Fallback: if no preprocessed data or model not available,
        # keep existing clusters
        return await self.get_clusters(session_id)

    # ── Core ML prediction ──────────────────────────────────────────
    async def _predict_clusters(
        self, session_id: str
    ) -> Optional[List[StudentCluster]]:
        """
        Run KMeans prediction on preprocessed data for a session.
        Returns None if there is no data to predict on.
        """
        # 1. Fetch preprocessed engagement docs from MongoDB
        print(f"🔄 _predict_clusters: fetching preprocessed data for session {session_id}")
        preprocessed = await self._preprocessing.get_preprocessed(session_id)

        if not preprocessed:
            print(f"⚠️  No preprocessed data for session {session_id}. "
                  f"Run preprocessing first.")
            return None

        print(f"📊 _predict_clusters: got {len(preprocessed)} preprocessed docs")

        # 2. Predict using KMeans model
        try:
            student_labels, cluster_students = (
                self._predictor.predict_students(preprocessed)
            )
        except Exception as e:
            import traceback
            print(f"❌ KMeans prediction failed: {e}")
            traceback.print_exc()
            return None

        if not student_labels:
            print(f"⚠️  KMeans returned empty results for session {session_id}")
            return None

        # 3. Build StudentCluster objects
        clusters: List[StudentCluster] = []
        for idx, level in enumerate(["high", "medium", "low"], start=1):
            meta = CLUSTER_META[level]
            students = cluster_students.get(level, [])
            clusters.append(
                StudentCluster(
                    id=str(idx),
                    name=meta["name"],
                    description=meta["description"],
                    studentCount=len(students),
                    engagementLevel=level,
                    color=meta["color"],
                    prediction=meta["prediction"],
                    students=students,
                )
            )

        print(f"✅ _predict_clusters: built {len(clusters)} clusters for session {session_id}")
        for c in clusters:
            print(f"   {c.engagementLevel}: {c.studentCount} students {c.students}")

        return clusters

    # ── Default clusters (before any data exists) ───────────────────
    @staticmethod
    def _build_default_clusters() -> List[StudentCluster]:
        return [
            StudentCluster(
                id="1",
                name="Active Participants",
                description="Highly engaged students",
                studentCount=0,
                engagementLevel="high",
                color="#10b981",
                prediction="stable",
                students=[],
            ),
            StudentCluster(
                id="2",
                name="Moderate Participants",
                description="Moderately engaged students",
                studentCount=0,
                engagementLevel="medium",
                color="#f59e0b",
                prediction="improving",
                students=[],
            ),
            StudentCluster(
                id="3",
                name="At-Risk Students",
                description="Low engagement, need support",
                studentCount=0,
                engagementLevel="low",
                color="#ef4444",
                prediction="declining",
                students=[],
            ),
        ]

    async def get_student_cluster(
        self, student_id: str, session_id: str
    ) -> Optional[str]:
        """Get student's cluster from MongoDB"""
        cluster_id = await ClusterModel.find_student_cluster(student_id, session_id)
        return cluster_id

    async def get_latency_adjusted_engagement(
        self,
        student_id: str,
        session_id: str,
        raw_engagement_score: float
    ) -> Dict:
        """
        Adjust engagement score based on connection latency.
        
        Students with poor network conditions should not be penalized
        in engagement analysis. This method applies a latency-based
        adjustment factor to the raw engagement score.
        
        Args:
            student_id: The student's identifier
            session_id: The current session ID
            raw_engagement_score: The original engagement score (0-100)
            
        Returns:
            Dictionary containing:
            - adjusted_score: The latency-adjusted engagement score
            - adjustment_factor: The factor applied (1.0 = no change)
            - connection_quality: The student's connection quality
            - should_contextualize: Whether engagement should be contextualized
        """
        # Get the latency adjustment factor
        adjustment_factor = await LatencyMetricsModel.get_engagement_adjustment(
            session_id, student_id
        )
        
        # Get connection quality profile
        profile = await LatencyMetricsModel.get_profile(session_id, student_id)
        
        if not profile:
            return {
                "adjusted_score": raw_engagement_score,
                "raw_score": raw_engagement_score,
                "adjustment_factor": 1.0,
                "connection_quality": "unknown",
                "stability_score": 100,
                "should_contextualize": False,
                "message": "No latency data available"
            }
        
        connection_quality = profile.get("overall_quality", "good")
        stability_score = profile.get("stability_score", 100)
        
        # Apply adjustment: poor connections get more lenient scoring
        # If engagement is low but connection is poor, we reduce the penalty
        if raw_engagement_score < 50 and adjustment_factor < 1.0:
            # Student appears disengaged but has connectivity issues
            # Apply the adjustment to reduce the gap from average
            adjustment = (50 - raw_engagement_score) * (1 - adjustment_factor)
            adjusted_score = raw_engagement_score + adjustment
        else:
            adjusted_score = raw_engagement_score
        
        # Ensure score is within bounds
        adjusted_score = max(0, min(100, adjusted_score))
        
        should_contextualize = connection_quality in ["poor", "critical"]
        
        return {
            "adjusted_score": round(adjusted_score, 2),
            "raw_score": raw_engagement_score,
            "adjustment_factor": adjustment_factor,
            "connection_quality": connection_quality,
            "stability_score": stability_score,
            "avg_rtt_ms": profile.get("avg_rtt_ms", 0),
            "should_contextualize": should_contextualize,
            "message": self._get_engagement_message(connection_quality, raw_engagement_score, adjusted_score)
        }
    
    def _get_engagement_message(
        self,
        connection_quality: str,
        raw_score: float,
        adjusted_score: float
    ) -> str:
        """Generate a human-readable message about engagement adjustment"""
        if connection_quality in ["excellent", "good"]:
            return "Connection is stable. Engagement metrics are accurate."
        
        if connection_quality == "fair":
            if adjusted_score > raw_score:
                return "Slight connectivity issues detected. Engagement may be underreported."
            return "Mild connectivity fluctuations. Engagement metrics are generally reliable."
        
        if connection_quality == "poor":
            return "Poor connection quality detected. Low engagement may be due to technical difficulties rather than disinterest."
        
        if connection_quality == "critical":
            return "Severe connectivity issues. Engagement metrics should be interpreted with caution. Student may be experiencing significant technical difficulties."
        
        return "Unable to assess connection quality."

    async def recalculate_clusters_with_latency(
        self,
        session_id: str,
        quiz_performance: Optional[Dict] = None
    ) -> List[StudentCluster]:
        """
        Recalculate clusters considering latency data.

        This method updates cluster assignments while considering
        connection quality. Students with poor connections who appear
        disengaged may be given the benefit of the doubt.
        """
        # Get latency summary for the session
        latency_summary = await LatencyMetricsModel.get_session_summary(session_id)
        students_with_issues = latency_summary.get("students_needing_attention", [])

        # Log connectivity-affected students for instructor awareness
        if students_with_issues:
            for student_info in students_with_issues:
                student_id = student_info.get("student_id")
                adjustment_factor = student_info.get("adjustment_factor", 1.0)
                if adjustment_factor < 0.8:
                    print(f"📶 Student {student_id} has connectivity issues "
                          f"(adjustment_factor={adjustment_factor}). "
                          f"Cluster assignment will be contextualized.")

        # Use ML-based clustering (same as update_clusters)
        return await self.update_clusters(session_id, quiz_performance)

