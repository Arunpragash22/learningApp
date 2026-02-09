"""
WebRTC-Aware Connection Latency Monitoring Router
=================================================

This router provides endpoints for measuring round-trip time (RTT) between
the client browser and backend server during live Zoom sessions.

Since direct access to Zoom's internal WebRTC statistics is restricted,
this system implements a WebRTC-aware latency monitoring mechanism to assess
network quality during live sessions.

The measured latency serves as a proxy indicator of connection quality and is
used as a contextual parameter in engagement analysis. By incorporating this
metric, the system avoids misclassifying students with poor network conditions
as disengaged, improving fairness, reliability, and real-world applicability.
"""

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import asyncio
import time

# MongoDB imports
from ..database.connection import get_database

router = APIRouter(prefix="/api/latency", tags=["Latency Monitoring"])


# ============================================================
# DATABASE HELPER FUNCTIONS
# ============================================================

def get_latency_collection():
    """Get the latency_reports collection from MongoDB"""
    db = get_database()
    if db is None:
        return None
    return db.latency_reports


def get_latency_summary_collection():
    """Get the latency_summary collection for aggregated stats"""
    db = get_database()
    if db is None:
        return None
    return db.latency_summary


# ============================================================
# MODELS
# ============================================================

class PingRequest(BaseModel):
    """Request model for ping measurement"""
    client_timestamp: float = Field(..., description="Client-side timestamp in milliseconds")
    session_id: str = Field(..., description="Active session ID")
    student_id: str = Field(..., description="Student identifier")


class PingResponse(BaseModel):
    """Response model for ping measurement"""
    client_timestamp: float
    server_timestamp: float
    server_receive_time: float
    latency_estimate_ms: float
    connection_quality: str  # 'excellent', 'good', 'fair', 'poor', 'critical'


class LatencyReport(BaseModel):
    """Model for submitting latency reports"""
    session_id: str
    student_id: str
    student_name: Optional[str] = Field(None, description="Student display name")
    user_role: Optional[str] = Field(None, description="User role: student, instructor, admin")
    rtt_ms: float = Field(..., description="Round-trip time in milliseconds")
    jitter_ms: Optional[float] = Field(None, description="Jitter in milliseconds")
    packet_loss_percent: Optional[float] = Field(None, description="Estimated packet loss percentage")
    samples_count: int = Field(default=1, description="Number of samples averaged")
    timestamp: Optional[datetime] = None


class ConnectionQuality(BaseModel):
    """Connection quality assessment"""
    quality: str  # 'excellent', 'good', 'fair', 'poor', 'critical'
    rtt_ms: float
    jitter_ms: float
    stability_score: float  # 0-100
    is_stable: bool
    recommendation: str
    should_adjust_engagement: bool


class StudentLatencyStats(BaseModel):
    """Aggregated latency statistics for a student"""
    student_id: str
    student_name: Optional[str] = None  # Display name for the student
    session_id: str
    avg_rtt_ms: float
    min_rtt_ms: float
    max_rtt_ms: float
    jitter_ms: float
    samples_count: int
    quality: str
    stability_score: float
    needs_attention: bool = False
    last_updated: datetime


# ============================================================
# IN-MEMORY CACHE (for real-time updates, synced with MongoDB)
# ============================================================

# Structure: {session_id: {student_id: [latency_samples]}}
# This is a cache for fast real-time access, MongoDB is the source of truth
latency_cache: Dict[str, Dict[str, List[Dict]]] = {}

# Connection quality thresholds (in milliseconds)
# Adjusted for HTTP-based ping which includes HTTP overhead (~100-200ms baseline)
QUALITY_THRESHOLDS = {
    "excellent": 150,   # RTT < 150ms (very fast HTTP response)
    "good": 300,        # RTT < 300ms (normal remote server)
    "fair": 500,        # RTT < 500ms (acceptable latency)
    "poor": 1000,       # RTT < 1000ms (noticeable delay)
    "critical": float('inf')  # RTT >= 1000ms (severe issues)
}

# Jitter thresholds (in milliseconds)
# Adjusted for HTTP-based measurements
JITTER_THRESHOLDS = {
    "excellent": 30,
    "good": 60,
    "fair": 100,
    "poor": 200,
    "critical": float('inf')
}

# Maximum samples to keep per student per session
MAX_SAMPLES_PER_STUDENT = 100


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def assess_connection_quality(rtt_ms: float, jitter_ms: float = 0) -> ConnectionQuality:
    """
    Assess connection quality based on RTT and jitter.
    Used to contextualize engagement analysis.
    """
    # Determine quality level based on RTT
    quality = "critical"
    for level, threshold in QUALITY_THRESHOLDS.items():
        if rtt_ms < threshold:
            quality = level
            break
    
    # Adjust quality based on jitter
    jitter_quality = "critical"
    for level, threshold in JITTER_THRESHOLDS.items():
        if jitter_ms < threshold:
            jitter_quality = level
            break
    
    # Take the worse of the two
    quality_order = ["excellent", "good", "fair", "poor", "critical"]
    final_quality = quality_order[max(quality_order.index(quality), quality_order.index(jitter_quality))]
    
    # Calculate stability score (0-100)
    # Adjusted for HTTP-based measurements (higher baseline latency expected)
    rtt_score = max(0, 100 - (rtt_ms / 10))  # More lenient for HTTP overhead
    jitter_score = max(0, 100 - jitter_ms)    # More lenient for jitter
    stability_score = (rtt_score * 0.6 + jitter_score * 0.4)
    
    # Determine if engagement analysis should be adjusted
    should_adjust = final_quality in ["poor", "critical"]
    
    # Generate recommendation
    recommendations = {
        "excellent": "Connection is optimal for real-time engagement.",
        "good": "Connection is stable and suitable for live sessions.",
        "fair": "Connection may experience occasional delays. Consider engagement context.",
        "poor": "Connection issues detected. Engagement metrics may be affected.",
        "critical": "Severe connection issues. Engagement analysis should account for technical difficulties."
    }
    
    return ConnectionQuality(
        quality=final_quality,
        rtt_ms=rtt_ms,
        jitter_ms=jitter_ms,
        stability_score=round(stability_score, 2),
        is_stable=stability_score >= 70,
        recommendation=recommendations[final_quality],
        should_adjust_engagement=should_adjust
    )


def calculate_jitter(samples: List[float]) -> float:
    """Calculate jitter from RTT samples (variation in delay)"""
    if len(samples) < 2:
        return 0.0
    
    differences = [abs(samples[i] - samples[i-1]) for i in range(1, len(samples))]
    return sum(differences) / len(differences)


def get_student_stats_from_cache(session_id: str, student_id: str) -> Optional[StudentLatencyStats]:
    """Get aggregated latency statistics for a student from in-memory cache"""
    if session_id not in latency_cache:
        return None
    if student_id not in latency_cache[session_id]:
        return None
    
    samples = latency_cache[session_id][student_id]
    if not samples:
        return None
    
    rtt_values = [s["rtt_ms"] for s in samples]
    avg_rtt = sum(rtt_values) / len(rtt_values)
    jitter = calculate_jitter(rtt_values)
    quality_assessment = assess_connection_quality(avg_rtt, jitter)
    
    # Get student name from the most recent sample
    student_name = samples[-1].get("student_name") or student_id
    
    # Determine if student needs attention (poor or critical connection)
    needs_attention = quality_assessment.quality in ["poor", "critical"]
    
    return StudentLatencyStats(
        student_id=student_id,
        student_name=student_name,
        session_id=session_id,
        avg_rtt_ms=round(avg_rtt, 2),
        min_rtt_ms=round(min(rtt_values), 2),
        max_rtt_ms=round(max(rtt_values), 2),
        jitter_ms=round(jitter, 2),
        samples_count=len(samples),
        quality=quality_assessment.quality,
        stability_score=quality_assessment.stability_score,
        needs_attention=needs_attention,
        last_updated=samples[-1].get("timestamp", datetime.now())
    )


async def get_student_stats_from_db(session_id: str, student_id: str) -> Optional[StudentLatencyStats]:
    """Get aggregated latency statistics for a student from MongoDB"""
    collection = get_latency_collection()
    if collection is None:
        return get_student_stats_from_cache(session_id, student_id)
    
    # Get recent samples from MongoDB (last 30 minutes)
    time_threshold = datetime.now() - timedelta(minutes=30)
    
    cursor = collection.find({
        "session_id": session_id,
        "student_id": student_id,
        "timestamp": {"$gte": time_threshold}
    }).sort("timestamp", -1).limit(MAX_SAMPLES_PER_STUDENT)
    
    samples = await cursor.to_list(length=MAX_SAMPLES_PER_STUDENT)
    
    if not samples:
        return get_student_stats_from_cache(session_id, student_id)
    
    rtt_values = [s["rtt_ms"] for s in samples]
    avg_rtt = sum(rtt_values) / len(rtt_values)
    jitter = calculate_jitter(rtt_values)
    quality_assessment = assess_connection_quality(avg_rtt, jitter)
    
    # Get student name from the most recent sample
    student_name = samples[0].get("student_name") or student_id
    
    # Determine if student needs attention
    needs_attention = quality_assessment.quality in ["poor", "critical"]
    
    return StudentLatencyStats(
        student_id=student_id,
        student_name=student_name,
        session_id=session_id,
        avg_rtt_ms=round(avg_rtt, 2),
        min_rtt_ms=round(min(rtt_values), 2),
        max_rtt_ms=round(max(rtt_values), 2),
        jitter_ms=round(jitter, 2),
        samples_count=len(samples),
        quality=quality_assessment.quality,
        stability_score=quality_assessment.stability_score,
        needs_attention=needs_attention,
        last_updated=samples[0].get("timestamp", datetime.now())
    )


# ============================================================
# API ENDPOINTS
# ============================================================

@router.post("/ping", response_model=PingResponse)
async def ping_pong(request: PingRequest):
    """
    Ping-pong endpoint for measuring round-trip time.
    
    The client sends a timestamp, the server responds immediately,
    allowing the client to calculate the RTT.
    """
    server_receive_time = time.time() * 1000  # Current time in ms
    
    # Estimate one-way latency (half of expected RTT)
    latency_estimate = (server_receive_time - request.client_timestamp) / 2
    
    # Assess quality based on estimated latency
    quality = "excellent"
    for level, threshold in QUALITY_THRESHOLDS.items():
        if latency_estimate * 2 < threshold:  # Use full RTT for assessment
            quality = level
            break
    
    return PingResponse(
        client_timestamp=request.client_timestamp,
        server_timestamp=time.time() * 1000,
        server_receive_time=server_receive_time,
        latency_estimate_ms=round(max(0, latency_estimate), 2),
        connection_quality=quality
    )


@router.post("/report")
async def report_latency(report: LatencyReport):
    """
    Submit a latency report for a student in a session.
    
    This endpoint stores latency metrics that are used to contextualize
    engagement analysis. Students with poor network conditions will not
    be misclassified as disengaged.
    
    NOTE: Only STUDENT data is stored. Instructor/Admin data is ignored.
    
    Data is stored in both:
    - In-memory cache (for real-time access)
    - MongoDB (for persistence and historical analysis)
    """
    session_id = report.session_id
    student_id = report.student_id
    user_role = (report.user_role or "").lower()
    current_timestamp = report.timestamp or datetime.now()
    
    # ⚠️ ONLY store data for STUDENTS - ignore instructors and admins
    # (Instructors can still SEE their network quality, just not stored)
    if user_role in ["instructor", "admin"]:
        return {
            "success": True,
            "message": "Instructor/Admin latency not stored (students only)",
            "stored": False,
            "current_stats": None,
            "quality_assessment": assess_connection_quality(report.rtt_ms, report.jitter_ms or 0).model_dump(),
            "engagement_adjustment_needed": False
        }
    
    # ⚠️ VALIDATION: Reject fake/test session IDs for students
    # Only real sessions (like Zoom meeting IDs) should be stored
    fake_session_ids = ["instructor-dashboard", "instructor-view", "admin-dashboard", "student-dashboard", "test", "demo", "null", "undefined", ""]
    if not session_id or session_id.lower() in fake_session_ids:
        return {
            "success": True,
            "message": "Not a real session - student must join an active session",
            "stored": False,
            "current_stats": None,
            "quality_assessment": assess_connection_quality(report.rtt_ms, report.jitter_ms or 0).model_dump(),
            "engagement_adjustment_needed": False
        }
    
    # Create sample document for STUDENT
    sample = {
        "session_id": session_id,
        "student_id": student_id,
        "student_name": report.student_name,
        "user_role": "student",
        "rtt_ms": report.rtt_ms,
        "jitter_ms": report.jitter_ms or 0,
        "packet_loss_percent": report.packet_loss_percent or 0,
        "samples_count": report.samples_count,
        "timestamp": current_timestamp
    }
    
    # 1. Update in-memory cache for real-time access
    if session_id not in latency_cache:
        latency_cache[session_id] = {}
    if student_id not in latency_cache[session_id]:
        latency_cache[session_id][student_id] = []
    
    latency_cache[session_id][student_id].append(sample)
    
    # Trim cache if exceeding limit
    if len(latency_cache[session_id][student_id]) > MAX_SAMPLES_PER_STUDENT:
        latency_cache[session_id][student_id] = \
            latency_cache[session_id][student_id][-MAX_SAMPLES_PER_STUDENT:]
    
    # 2. Save to MongoDB for persistence (STUDENTS ONLY)
    collection = get_latency_collection()
    if collection is not None:
        try:
            await collection.insert_one(sample.copy())
        except Exception as e:
            print(f"⚠️ Failed to save latency to MongoDB: {e}")
    
    # Get updated stats and quality assessment
    stats = get_student_stats_from_cache(session_id, student_id)
    quality = assess_connection_quality(report.rtt_ms, report.jitter_ms or 0)
    
    return {
        "success": True,
        "message": "Latency report recorded",
        "current_stats": stats.model_dump() if stats else None,
        "quality_assessment": quality.model_dump(),
        "engagement_adjustment_needed": quality.should_adjust_engagement
    }


@router.get("/quality/{session_id}/{student_id}", response_model=ConnectionQuality)
async def get_connection_quality(session_id: str, student_id: str):
    """
    Get the current connection quality assessment for a student.
    
    This is used by the engagement analysis system to contextualize
    student behavior and avoid misclassification.
    """
    stats = await get_student_stats_from_db(session_id, student_id)
    
    if not stats:
        # Return default "unknown" quality if no data
        return ConnectionQuality(
            quality="good",  # Assume good if no data
            rtt_ms=0,
            jitter_ms=0,
            stability_score=100,
            is_stable=True,
            recommendation="No latency data available. Using default assessment.",
            should_adjust_engagement=False
        )
    
    return assess_connection_quality(stats.avg_rtt_ms, stats.jitter_ms)


@router.get("/stats/{session_id}/{student_id}", response_model=StudentLatencyStats)
async def get_student_latency_stats(session_id: str, student_id: str):
    """
    Get detailed latency statistics for a student in a session.
    """
    stats = await get_student_stats_from_db(session_id, student_id)
    
    if not stats:
        raise HTTPException(
            status_code=404,
            detail=f"No latency data found for student {student_id} in session {session_id}"
        )
    
    return stats


@router.get("/session/{session_id}/summary")
async def get_session_latency_summary(session_id: str):
    """
    Get a summary of connection quality across all students in a session.
    
    Useful for instructors to understand overall class connectivity
    and identify students who may need technical assistance.
    """
    if session_id not in latency_cache:
        return {
            "session_id": session_id,
            "total_students": 0,
            "students_with_data": 0,
            "quality_distribution": {},
            "students_needing_attention": [],
            "average_rtt_ms": 0,
            "average_stability_score": 0
        }
    
    students_data = []
    quality_counts = {"excellent": 0, "good": 0, "fair": 0, "poor": 0, "critical": 0}
    students_needing_attention = []
    
    for student_id in latency_cache[session_id]:
        stats = get_student_stats_from_cache(session_id, student_id)
        if stats:
            students_data.append(stats)
            quality_counts[stats.quality] += 1
            
            if stats.quality in ["poor", "critical"]:
                students_needing_attention.append({
                    "student_id": student_id,
                    "student_name": stats.student_name,
                    "quality": stats.quality,
                    "avg_rtt_ms": stats.avg_rtt_ms,
                    "recommendation": "Consider engagement context due to connectivity issues"
                })
    
    avg_rtt = sum(s.avg_rtt_ms for s in students_data) / len(students_data) if students_data else 0
    avg_stability = sum(s.stability_score for s in students_data) / len(students_data) if students_data else 100
    
    return {
        "session_id": session_id,
        "total_students": len(latency_cache[session_id]),
        "students_with_data": len(students_data),
        "quality_distribution": quality_counts,
        "students_needing_attention": students_needing_attention,
        "average_rtt_ms": round(avg_rtt, 2),
        "average_stability_score": round(avg_stability, 2),
        "timestamp": datetime.now().isoformat()
    }


@router.get("/session/{session_id}/students")
async def get_all_students_latency(session_id: str):
    """
    Get detailed latency stats for ALL students in a session.
    
    This endpoint is designed for instructors to monitor the network
    quality of all joined students in real-time. It helps identify
    students who may be experiencing connectivity issues.
    """
    if session_id not in latency_cache:
        return {
            "session_id": session_id,
            "students": [],
            "summary": {
                "total": 0,
                "excellent": 0,
                "good": 0,
                "fair": 0,
                "poor": 0,
                "critical": 0
            },
            "timestamp": datetime.now().isoformat()
        }
    
    students_list = []
    quality_counts = {"excellent": 0, "good": 0, "fair": 0, "poor": 0, "critical": 0}
    
    for student_id in latency_cache[session_id]:
        stats = get_student_stats_from_cache(session_id, student_id)
        if stats:
            quality_counts[stats.quality] += 1
            
            # Build stability history from recent samples (last 30 samples)
            # Each entry is the quality level of that individual sample
            stability_history = []
            samples = latency_cache[session_id].get(student_id, [])
            recent_samples = samples[-30:]  # Last 30 samples for the stability bar
            for sample in recent_samples:
                sample_rtt = sample.get("rtt_ms", 0)
                sample_jitter = sample.get("jitter_ms", 0)
                sample_quality = assess_connection_quality(sample_rtt, sample_jitter)
                stability_history.append({
                    "quality": sample_quality.quality,
                    "rtt_ms": round(sample_rtt, 1),
                    "stability_score": sample_quality.stability_score,
                    "timestamp": sample.get("timestamp", datetime.now()).isoformat() if isinstance(sample.get("timestamp"), datetime) else str(sample.get("timestamp", ""))
                })
            
            # Calculate trend data from recent vs older samples
            rtt_trend = "stable"
            quality_trend = "stable"
            if len(recent_samples) >= 8:
                mid = len(recent_samples) // 2
                older_half = recent_samples[:mid]
                newer_half = recent_samples[mid:]
                older_avg_rtt = sum(s.get("rtt_ms", 0) for s in older_half) / len(older_half)
                newer_avg_rtt = sum(s.get("rtt_ms", 0) for s in newer_half) / len(newer_half)
                rtt_diff = newer_avg_rtt - older_avg_rtt
                if rtt_diff < -20:
                    rtt_trend = "improving"
                elif rtt_diff > 20:
                    rtt_trend = "degrading"
                
                quality_order_map = {"excellent": 4, "good": 3, "fair": 2, "poor": 1, "critical": 0}
                older_qualities = [assess_connection_quality(s.get("rtt_ms", 0), s.get("jitter_ms", 0)).quality for s in older_half]
                newer_qualities = [assess_connection_quality(s.get("rtt_ms", 0), s.get("jitter_ms", 0)).quality for s in newer_half]
                older_avg_q = sum(quality_order_map.get(q, 0) for q in older_qualities) / len(older_qualities)
                newer_avg_q = sum(quality_order_map.get(q, 0) for q in newer_qualities) / len(newer_qualities)
                q_diff = newer_avg_q - older_avg_q
                if q_diff > 0.3:
                    quality_trend = "improving"
                elif q_diff < -0.3:
                    quality_trend = "degrading"
            
            students_list.append({
                "student_id": stats.student_id,
                "student_name": stats.student_name,  # ✅ Include student name!
                "session_id": stats.session_id,
                "avg_rtt_ms": stats.avg_rtt_ms,
                "min_rtt_ms": stats.min_rtt_ms,
                "max_rtt_ms": stats.max_rtt_ms,
                "jitter_ms": stats.jitter_ms,
                "quality": stats.quality,
                "stability_score": stats.stability_score,
                "samples_count": stats.samples_count,
                "last_updated": stats.last_updated.isoformat() if stats.last_updated else None,
                "needs_attention": stats.needs_attention,
                "stability_history": stability_history,  # ✅ Include stability timeline for bar
                "rtt_trend": rtt_trend,  # ✅ Trend: improving/degrading/stable
                "quality_trend": quality_trend  # ✅ Quality trend for live progress bars
            })
    
    # Sort by quality (worst first) for instructor attention
    quality_order = {"critical": 0, "poor": 1, "fair": 2, "good": 3, "excellent": 4}
    students_list.sort(key=lambda x: quality_order.get(x["quality"], 5))
    
    return {
        "session_id": session_id,
        "students": students_list,
        "summary": {
            "total": len(students_list),
            **quality_counts
        },
        "timestamp": datetime.now().isoformat()
    }


@router.delete("/session/{session_id}")
async def clear_session_latency_data(session_id: str):
    """
    Clear latency cache for a session (called when session ends).
    Note: MongoDB data is preserved for historical analysis.
    """
    cleared_cache = False
    if session_id in latency_cache:
        del latency_cache[session_id]
        cleared_cache = True
    
    return {
        "success": True, 
        "message": f"Latency cache cleared for session {session_id}",
        "cache_cleared": cleared_cache,
        "note": "Historical data preserved in database"
    }


@router.get("/history/{session_id}")
async def get_session_latency_history(session_id: str, hours: int = 24):
    """
    Get historical latency data for a session from MongoDB.
    
    This endpoint retrieves all stored latency records for analysis
    and reporting purposes.
    """
    collection = get_latency_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database not available")
    
    time_threshold = datetime.now() - timedelta(hours=hours)
    
    # Aggregate data by student
    pipeline = [
        {
            "$match": {
                "session_id": session_id,
                "timestamp": {"$gte": time_threshold}
            }
        },
        {
            "$group": {
                "_id": "$student_id",
                "student_name": {"$last": "$student_name"},
                "avg_rtt_ms": {"$avg": "$rtt_ms"},
                "min_rtt_ms": {"$min": "$rtt_ms"},
                "max_rtt_ms": {"$max": "$rtt_ms"},
                "avg_jitter_ms": {"$avg": "$jitter_ms"},
                "total_samples": {"$sum": 1},
                "first_seen": {"$min": "$timestamp"},
                "last_seen": {"$max": "$timestamp"}
            }
        },
        {
            "$project": {
                "student_id": "$_id",
                "student_name": 1,
                "avg_rtt_ms": {"$round": ["$avg_rtt_ms", 2]},
                "min_rtt_ms": {"$round": ["$min_rtt_ms", 2]},
                "max_rtt_ms": {"$round": ["$max_rtt_ms", 2]},
                "avg_jitter_ms": {"$round": ["$avg_jitter_ms", 2]},
                "total_samples": 1,
                "first_seen": 1,
                "last_seen": 1,
                "_id": 0
            }
        }
    ]
    
    results = await collection.aggregate(pipeline).to_list(length=100)
    
    # Add quality assessment to each result
    for result in results:
        quality = assess_connection_quality(result["avg_rtt_ms"], result["avg_jitter_ms"])
        result["quality"] = quality.quality
        result["stability_score"] = quality.stability_score
        result["needs_attention"] = quality.should_adjust_engagement
    
    return {
        "session_id": session_id,
        "time_range_hours": hours,
        "students": results,
        "total_students": len(results),
        "retrieved_at": datetime.now().isoformat()
    }


# ============================================================
# WEBSOCKET FOR REAL-TIME LATENCY MONITORING
# ============================================================

@router.websocket("/ws/{session_id}/{student_id}")
async def websocket_latency_monitor(
    websocket: WebSocket,
    session_id: str,
    student_id: str
):
    """
    WebSocket endpoint for real-time latency monitoring.
    
    The client can send 'ping' messages and receive 'pong' responses
    with server timestamp for accurate RTT calculation.
    """
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            
            if data == "ping":
                # Respond with pong and server timestamp
                await websocket.send_json({
                    "type": "pong",
                    "server_timestamp": time.time() * 1000,
                    "session_id": session_id,
                    "student_id": student_id
                })
            elif data.startswith("{"):
                # Handle JSON messages (latency reports)
                import json
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "latency_report":
                        # Store the latency data
                        report = LatencyReport(
                            session_id=session_id,
                            student_id=student_id,
                            rtt_ms=msg.get("rtt_ms", 0),
                            jitter_ms=msg.get("jitter_ms"),
                            samples_count=msg.get("samples_count", 1)
                        )
                        
                        # Process the report
                        if session_id not in latency_cache:
                            latency_cache[session_id] = {}
                        if student_id not in latency_cache[session_id]:
                            latency_cache[session_id][student_id] = []
                        
                        latency_cache[session_id][student_id].append({
                            "rtt_ms": report.rtt_ms,
                            "jitter_ms": report.jitter_ms or 0,
                            "timestamp": datetime.now()
                        })
                        
                        # Send back quality assessment
                        quality = assess_connection_quality(report.rtt_ms, report.jitter_ms or 0)
                        await websocket.send_json({
                            "type": "quality_update",
                            "quality": quality.model_dump()
                        })
                except json.JSONDecodeError:
                    pass
                    
    except WebSocketDisconnect:
        print(f"📶 Latency monitor disconnected: session={session_id}, student={student_id}")

