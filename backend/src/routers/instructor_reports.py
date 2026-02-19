# src/routers/instructor_reports.py
"""
Instructor Reports API
======================
Endpoints for instructors to view reports for their sessions.
Includes: Session Summary, Quiz Performance, Engagement Activity reports.

USES STORED REPORTS FROM MongoDB when available (after session ends).
Falls back to live data if no stored report exists.

Access Control:
- Only instructors can access these endpoints
- Instructors can only view reports for sessions they created
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

from src.database.connection import db
from src.middleware.auth import get_current_user, require_instructor
from src.models.session_report_model import SessionReportModel

router = APIRouter(prefix="/api/instructor/reports", tags=["Instructor Reports"])


# ============================================================
# 1. SESSION SUMMARY REPORT
# ============================================================
@router.get("/sessions")
async def get_session_summary_report(user: dict = Depends(require_instructor)):
    """
    Get summary of all sessions created by the instructor.
    Returns: List of sessions with participant counts and status.
    """
    try:
        instructor_id = user.get("id")
        
        # Get all sessions by this instructor
        sessions = []
        async for session in db.database.sessions.find({"instructorId": instructor_id}).sort("date", -1):
            session_id = str(session["_id"])
            
            # Count participants for this session
            participant_count = await db.database.session_participants.count_documents({
                "sessionId": session_id
            })
            
            sessions.append({
                "sessionId": session_id,
                "sessionName": session.get("title", "Untitled Session"),
                "courseName": session.get("course", ""),
                "courseCode": session.get("courseCode", ""),
                "date": session.get("date", ""),
                "time": session.get("time", ""),
                "duration": session.get("duration", ""),
                "status": session.get("status", "upcoming"),
                "totalStudentsJoined": participant_count,
                "zoomMeetingId": str(session.get("zoomMeetingId")) if session.get("zoomMeetingId") else None,
                "actualStartTime": session.get("actualStartTime"),
                "actualEndTime": session.get("actualEndTime")
            })
        
        return {
            "success": True,
            "totalSessions": len(sessions),
            "sessions": sessions
        }
        
    except Exception as e:
        print(f"Error fetching session summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch session summary")


@router.get("/sessions/{session_id}/attendance")
async def get_session_attendance_report(
    session_id: str,
    user: dict = Depends(require_instructor)
):
    """
    Get detailed attendance report for a specific session.
    Shows: Each student's join time, leave time, and total duration.
    Looks up participants by BOTH MongoDB session_id AND zoomMeetingId.
    """
    try:
        instructor_id = user.get("id")
        
        # Verify session belongs to instructor
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("instructorId") != instructor_id:
            raise HTTPException(status_code=403, detail="You can only view reports for your own sessions")
        
        # Get zoomMeetingId for lookup
        zoom_meeting_id = session.get("zoomMeetingId")
        
        # Get all participants - check BOTH MongoDB session_id AND zoomMeetingId
        attendance_data = []
        seen_students = set()
        
        # First by MongoDB session_id
        async for participant in db.database.session_participants.find({"sessionId": session_id}):
            student_id = participant.get("studentId")
            if student_id in seen_students:
                continue
            seen_students.add(student_id)
            
            joined_at = participant.get("joinedAt")
            left_at = participant.get("leftAt")
            
            # Calculate duration in minutes
            duration_minutes = None
            if joined_at and left_at:
                duration_minutes = int((left_at - joined_at).total_seconds() / 60)
            elif joined_at:
                # Still in session or didn't leave properly
                duration_minutes = int((datetime.utcnow() - joined_at).total_seconds() / 60)
            
            attendance_data.append({
                "studentId": student_id,
                "studentName": participant.get("studentName", "Unknown Student"),
                "studentEmail": participant.get("studentEmail", ""),
                "joinTime": joined_at.isoformat() if joined_at else None,
                "leaveTime": left_at.isoformat() if left_at else None,
                "durationMinutes": duration_minutes,
                "status": participant.get("status", "unknown")
            })
        
        # Also check by zoomMeetingId (participants might be stored with zoom ID)
        if zoom_meeting_id:
            async for participant in db.database.session_participants.find({"sessionId": str(zoom_meeting_id)}):
                student_id = participant.get("studentId")
                if student_id in seen_students:
                    continue
                seen_students.add(student_id)
                
                joined_at = participant.get("joinedAt")
                left_at = participant.get("leftAt")
                
                duration_minutes = None
                if joined_at and left_at:
                    duration_minutes = int((left_at - joined_at).total_seconds() / 60)
                elif joined_at:
                    duration_minutes = int((datetime.utcnow() - joined_at).total_seconds() / 60)
                
                attendance_data.append({
                    "studentId": student_id,
                    "studentName": participant.get("studentName", "Unknown Student"),
                    "studentEmail": participant.get("studentEmail", ""),
                    "joinTime": joined_at.isoformat() if joined_at else None,
                    "leaveTime": left_at.isoformat() if left_at else None,
                    "durationMinutes": duration_minutes,
                    "status": participant.get("status", "unknown")
                })
        
        # Sort by join time
        attendance_data.sort(key=lambda x: x["joinTime"] or "", reverse=True)
        
        return {
            "success": True,
            "sessionId": session_id,
            "sessionName": session.get("title", ""),
            "sessionDate": session.get("date", ""),
            "totalStudents": len(attendance_data),
            "attendance": attendance_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching attendance report: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch attendance report")


# ============================================================
# 2. QUIZ PERFORMANCE REPORT
# ============================================================
@router.get("/sessions/{session_id}/quiz-performance")
async def get_quiz_performance_report(
    session_id: str,
    user: dict = Depends(require_instructor)
):
    """
    Get quiz performance report for a specific session.
    Shows: Each student's quiz scores, correct/incorrect answers.
    """
    try:
        instructor_id = user.get("id")
        
        # Verify session belongs to instructor
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("instructorId") != instructor_id:
            raise HTTPException(status_code=403, detail="You can only view reports for your own sessions")
        
        # Resolve all session IDs (MongoDB + Zoom)
        zoom_meeting_id = session.get("zoomMeetingId")
        session_ids = [session_id]
        if zoom_meeting_id:
            session_ids.append(str(zoom_meeting_id))

        # Get question assignments for this session (check all IDs)
        assignments = []
        seen_assign = set()
        for sid in session_ids:
            async for assignment in db.database.question_assignments.find({"sessionId": sid}):
                aid = str(assignment["_id"])
                if aid not in seen_assign:
                    seen_assign.add(aid)
                    assignments.append(assignment)
        
        # Get quiz answers for this session (check all IDs)
        quiz_answers = []
        seen_answers = set()
        for sid in session_ids:
            async for answer in db.database.quiz_answers.find({"sessionId": sid}):
                aid = str(answer["_id"])
                if aid not in seen_answers:
                    seen_answers.add(aid)
                    quiz_answers.append(answer)
        
        # Get participants for this session (check all IDs)
        participants = {}
        for sid in session_ids:
            async for p in db.database.session_participants.find({"sessionId": sid}):
                student_id = p.get("studentId")
                if student_id and student_id not in participants:
                    participants[student_id] = {
                        "studentName": p.get("studentName", "Unknown"),
                        "studentEmail": p.get("studentEmail", "")
                    }
        
        # Aggregate performance by student - prefer assignments, fallback to quiz_answers
        student_performance = {}
        
        for assignment in assignments:
            student_id = assignment.get("studentId")
            if student_id not in student_performance:
                student_info = participants.get(student_id, {})
                student_performance[student_id] = {
                    "studentId": student_id,
                    "studentName": student_info.get("studentName", "Unknown"),
                    "studentEmail": student_info.get("studentEmail", ""),
                    "totalQuestions": 0,
                    "correctAnswers": 0,
                    "incorrectAnswers": 0,
                    "unanswered": 0,
                    "totalResponseTime": 0,
                    "answeredCount": 0
                }
            
            student_performance[student_id]["totalQuestions"] += 1
            
            if assignment.get("answerIndex") is not None:
                if assignment.get("isCorrect"):
                    student_performance[student_id]["correctAnswers"] += 1
                else:
                    student_performance[student_id]["incorrectAnswers"] += 1
                
                if assignment.get("timeTaken"):
                    student_performance[student_id]["totalResponseTime"] += assignment.get("timeTaken")
                    student_performance[student_id]["answeredCount"] += 1
            else:
                student_performance[student_id]["unanswered"] += 1

        # Fallback: for students with quiz_answers but no assignments
        for answer in quiz_answers:
            student_id = answer.get("studentId")
            if student_id not in student_performance:
                student_info = participants.get(student_id, {})
                student_performance[student_id] = {
                    "studentId": student_id,
                    "studentName": student_info.get("studentName", "Unknown"),
                    "studentEmail": student_info.get("studentEmail", ""),
                    "totalQuestions": 0,
                    "correctAnswers": 0,
                    "incorrectAnswers": 0,
                    "unanswered": 0,
                    "totalResponseTime": 0,
                    "answeredCount": 0,
                    "_from_answers": True
                }
            if student_performance[student_id].get("_from_answers"):
                student_performance[student_id]["totalQuestions"] += 1
                if answer.get("isCorrect"):
                    student_performance[student_id]["correctAnswers"] += 1
                else:
                    student_performance[student_id]["incorrectAnswers"] += 1
                if answer.get("timeTaken"):
                    student_performance[student_id]["totalResponseTime"] += answer.get("timeTaken")
                    student_performance[student_id]["answeredCount"] += 1
        
        # Calculate scores and averages
        performance_list = []
        for student_id, perf in student_performance.items():
            total = perf["totalQuestions"]
            correct = perf["correctAnswers"]
            score = (correct / total * 100) if total > 0 else 0
            avg_time = (perf["totalResponseTime"] / perf["answeredCount"]) if perf["answeredCount"] > 0 else None
            
            performance_list.append({
                "studentId": student_id,
                "studentName": perf["studentName"],
                "studentEmail": perf["studentEmail"],
                "totalQuestions": total,
                "correctAnswers": correct,
                "incorrectAnswers": perf["incorrectAnswers"],
                "unanswered": perf.get("unanswered", 0),
                "score": round(score, 1),
                "averageResponseTime": round(avg_time, 2) if avg_time else None
            })
        
        # Sort by score descending
        performance_list.sort(key=lambda x: x["score"], reverse=True)
        
        # Calculate class averages
        total_students = len(performance_list)
        avg_score = sum(p["score"] for p in performance_list) / total_students if total_students > 0 else 0
        
        all_q_ids = set(a.get("questionId") for a in assignments)
        all_q_ids.update(a.get("questionId") for a in quiz_answers)
        all_q_ids.discard(None)

        return {
            "success": True,
            "sessionId": session_id,
            "sessionName": session.get("title", ""),
            "totalQuestions": len(all_q_ids),
            "totalParticipants": total_students,
            "classAverageScore": round(avg_score, 1),
            "studentPerformance": performance_list
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching quiz performance: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch quiz performance report")


# ============================================================
# 3. ENGAGEMENT ACTIVITY REPORT
# ============================================================
@router.get("/sessions/{session_id}/engagement")
async def get_engagement_report(
    session_id: str,
    user: dict = Depends(require_instructor)
):
    """
    Get engagement activity report for a specific session.
    Shows: Number of interactions per student, participation metrics.
    """
    try:
        instructor_id = user.get("id")
        
        # Verify session belongs to instructor
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("instructorId") != instructor_id:
            raise HTTPException(status_code=403, detail="You can only view reports for your own sessions")
        
        # Get participants
        participants = {}
        async for p in db.database.session_participants.find({"sessionId": session_id}):
            student_id = p.get("studentId")
            participants[student_id] = {
                "studentId": student_id,
                "studentName": p.get("studentName", "Unknown"),
                "studentEmail": p.get("studentEmail", ""),
                "joinedAt": p.get("joinedAt"),
                "leftAt": p.get("leftAt")
            }
        
        # Count quiz interactions per student
        quiz_interactions = {}
        async for answer in db.database.quiz_answers.find({"sessionId": session_id}):
            student_id = answer.get("studentId")
            if student_id not in quiz_interactions:
                quiz_interactions[student_id] = 0
            quiz_interactions[student_id] += 1
        
        # Count question assignments answered
        assignments_answered = {}
        async for assignment in db.database.question_assignments.find({
            "sessionId": session_id,
            "answerIndex": {"$ne": None}
        }):
            student_id = assignment.get("studentId")
            if student_id not in assignments_answered:
                assignments_answered[student_id] = 0
            assignments_answered[student_id] += 1
        
        # Get latency/connection data
        connection_data = {}
        async for metric in db.database.latency_metrics.find({"session_id": session_id}):
            student_id = metric.get("student_id")
            connection_data[student_id] = metric.get("overall_quality", "unknown")
        
        # Get real cluster assignments
        cluster_labels = {}
        zoom_meeting_id = session.get("zoomMeetingId")
        for sid in [session_id] + ([str(zoom_meeting_id)] if zoom_meeting_id else []):
            async for c in db.database.clusters.find({"sessionId": sid}):
                level = c.get("engagementLevel", "")
                if level in ("active", "moderate", "passive"):
                    for s_id in c.get("students", []):
                        if s_id not in cluster_labels:
                            cluster_labels[s_id] = level
        
        # Build engagement report
        engagement_list = []
        for student_id, info in participants.items():
            quiz_count = quiz_interactions.get(student_id, 0)
            answered_count = assignments_answered.get(student_id, 0)
            connection = connection_data.get(student_id, "unknown")
            
            # Calculate attendance duration
            duration_minutes = None
            if info.get("joinedAt") and info.get("leftAt"):
                duration_minutes = int((info["leftAt"] - info["joinedAt"]).total_seconds() / 60)
            
            # Use real cluster data if available, fallback to quiz participation
            engagement_level = cluster_labels.get(student_id, "")
            if engagement_level == "active":
                engagement_level = "High"
            elif engagement_level == "moderate":
                engagement_level = "Medium"
            elif engagement_level == "passive":
                engagement_level = "Low"
            else:
                if answered_count >= 3:
                    engagement_level = "High"
                elif answered_count >= 1:
                    engagement_level = "Medium"
                else:
                    engagement_level = "Low"
            
            engagement_list.append({
                "studentId": student_id,
                "studentName": info["studentName"],
                "studentEmail": info["studentEmail"],
                "quizInteractions": quiz_count,
                "questionsAnswered": answered_count,
                "attendanceDuration": duration_minutes,
                "connectionQuality": connection,
                "engagementLevel": engagement_level
            })
        
        # Sort by engagement (questions answered)
        engagement_list.sort(key=lambda x: x["questionsAnswered"], reverse=True)
        
        # Calculate summary stats
        total_students = len(engagement_list)
        high_engagement = sum(1 for e in engagement_list if e["engagementLevel"] == "High")
        medium_engagement = sum(1 for e in engagement_list if e["engagementLevel"] == "Medium")
        low_engagement = sum(1 for e in engagement_list if e["engagementLevel"] == "Low")
        
        return {
            "success": True,
            "sessionId": session_id,
            "sessionName": session.get("title", ""),
            "totalParticipants": total_students,
            "engagementSummary": {
                "highEngagement": high_engagement,
                "mediumEngagement": medium_engagement,
                "lowEngagement": low_engagement
            },
            "studentEngagement": engagement_list
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching engagement report: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch engagement report")


# ============================================================
# 4. OVERALL INSTRUCTOR DASHBOARD STATS
# ============================================================
@router.get("/dashboard-stats")
async def get_instructor_dashboard_stats(user: dict = Depends(require_instructor)):
    """
    Get overall statistics for instructor dashboard.
    """
    try:
        instructor_id = user.get("id")
        
        # Count sessions
        total_sessions = await db.database.sessions.count_documents({"instructorId": instructor_id})
        completed_sessions = await db.database.sessions.count_documents({
            "instructorId": instructor_id,
            "status": "completed"
        })
        live_sessions = await db.database.sessions.count_documents({
            "instructorId": instructor_id,
            "status": "live"
        })
        
        # Get session IDs for this instructor
        session_ids = []
        async for session in db.database.sessions.find({"instructorId": instructor_id}, {"_id": 1}):
            session_ids.append(str(session["_id"]))
        
        # Count total participants across all sessions
        total_participants = await db.database.session_participants.count_documents({
            "sessionId": {"$in": session_ids}
        })
        
        # Count total quiz questions asked
        total_questions = await db.database.question_assignments.count_documents({
            "sessionId": {"$in": session_ids}
        })
        
        # Calculate average quiz score
        pipeline = [
            {"$match": {"sessionId": {"$in": session_ids}}},
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "correct": {"$sum": {"$cond": ["$isCorrect", 1, 0]}}
            }}
        ]
        
        result = await db.database.question_assignments.aggregate(pipeline).to_list(length=1)
        avg_score = 0
        if result and result[0]["total"] > 0:
            avg_score = round((result[0]["correct"] / result[0]["total"]) * 100, 1)
        
        return {
            "success": True,
            "stats": {
                "totalSessions": total_sessions,
                "completedSessions": completed_sessions,
                "liveSessions": live_sessions,
                "upcomingSessions": total_sessions - completed_sessions - live_sessions,
                "totalParticipants": total_participants,
                "totalQuestionsAsked": total_questions,
                "averageQuizScore": avg_score
            }
        }
        
    except Exception as e:
        print(f"Error fetching dashboard stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard stats")


# ============================================================
# DEBUG: CHECK SESSION DATA AND ALL RELATED COLLECTIONS
# ============================================================
@router.get("/debug/session/{session_id}/all-data")
async def debug_session_all_data(
    session_id: str,
    user: dict = Depends(require_instructor)
):
    """
    Debug endpoint to check ALL data for a session.
    Shows session details, participants, quiz answers, assignments.
    """
    try:
        # Get session details
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            return {"error": "Session not found", "sessionId": session_id}
        
        session["_id"] = str(session["_id"])
        zoom_meeting_id = session.get("zoomMeetingId")
        
        # Get participants
        participants_mongo = []
        async for p in db.database.session_participants.find({"sessionId": session_id}):
            p["_id"] = str(p["_id"])
            participants_mongo.append(p)
        
        participants_zoom = []
        if zoom_meeting_id:
            async for p in db.database.session_participants.find({"sessionId": str(zoom_meeting_id)}):
                p["_id"] = str(p["_id"])
                participants_zoom.append(p)
        
        # Get quiz answers
        answers_mongo = []
        async for a in db.database.quiz_answers.find({"sessionId": session_id}):
            a["_id"] = str(a["_id"])
            answers_mongo.append(a)
        
        answers_zoom = []
        if zoom_meeting_id:
            async for a in db.database.quiz_answers.find({"sessionId": str(zoom_meeting_id)}):
                a["_id"] = str(a["_id"])
                answers_zoom.append(a)
        
        # Get question assignments
        assignments_mongo = []
        async for a in db.database.question_assignments.find({"sessionId": session_id}):
            a["_id"] = str(a["_id"])
            assignments_mongo.append(a)
        
        assignments_zoom = []
        if zoom_meeting_id:
            async for a in db.database.question_assignments.find({"sessionId": str(zoom_meeting_id)}):
                a["_id"] = str(a["_id"])
                assignments_zoom.append(a)
        
        # Get all quiz_answers to see what sessionIds exist
        all_answer_session_ids = set()
        async for a in db.database.quiz_answers.find({}).limit(50):
            all_answer_session_ids.add(a.get("sessionId"))
        
        return {
            "session": session,
            "zoomMeetingId": zoom_meeting_id,
            "participants": {
                "byMongoId": {"count": len(participants_mongo), "data": participants_mongo},
                "byZoomId": {"count": len(participants_zoom), "data": participants_zoom}
            },
            "quizAnswers": {
                "byMongoId": {"count": len(answers_mongo), "data": answers_mongo},
                "byZoomId": {"count": len(answers_zoom), "data": answers_zoom}
            },
            "questionAssignments": {
                "byMongoId": {"count": len(assignments_mongo), "data": assignments_mongo},
                "byZoomId": {"count": len(assignments_zoom), "data": assignments_zoom}
            },
            "allSessionIdsInQuizAnswers": list(all_answer_session_ids)
        }
        
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


# ============================================================
# DEBUG: CHECK SESSION PARTICIPANTS
# ============================================================
@router.get("/debug/session/{session_id}/participants")
async def debug_session_participants(
    session_id: str,
    user: dict = Depends(require_instructor)
):
    """
    Debug endpoint to check what participants are stored for a session.
    Checks both MongoDB session_id and zoomMeetingId.
    """
    try:
        # Get session details
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            return {"error": "Session not found", "sessionId": session_id}
        
        zoom_meeting_id = session.get("zoomMeetingId")
        
        # Get participants by MongoDB session_id
        participants_by_mongo_id = []
        async for p in db.database.session_participants.find({"sessionId": session_id}):
            p["_id"] = str(p["_id"])
            participants_by_mongo_id.append(p)
        
        # Get participants by zoomMeetingId
        participants_by_zoom_id = []
        if zoom_meeting_id:
            async for p in db.database.session_participants.find({"sessionId": str(zoom_meeting_id)}):
                p["_id"] = str(p["_id"])
                participants_by_zoom_id.append(p)
        
        # Get ALL participants (to see what's in the collection)
        all_participants = []
        async for p in db.database.session_participants.find({}).limit(20):
            p["_id"] = str(p["_id"])
            all_participants.append(p)
        
        return {
            "sessionId": session_id,
            "zoomMeetingId": zoom_meeting_id,
            "sessionTitle": session.get("title"),
            "sessionStatus": session.get("status"),
            "participantsByMongoId": {
                "count": len(participants_by_mongo_id),
                "data": participants_by_mongo_id
            },
            "participantsByZoomId": {
                "count": len(participants_by_zoom_id),
                "data": participants_by_zoom_id
            },
            "recentParticipantsInCollection": {
                "count": len(all_participants),
                "data": all_participants
            }
        }
        
    except Exception as e:
        return {"error": str(e)}


# ============================================================
# 5. GET STORED REPORT FROM MONGODB
# ============================================================
@router.get("/sessions/{session_id}/stored-report")
async def get_stored_session_report(
    session_id: str,
    user: dict = Depends(require_instructor)
):
    """
    Get the STORED report from MongoDB for a session.
    This report is automatically generated when the instructor ends the session.
    Contains ALL student data: attendance, quiz performance, engagement.
    """
    try:
        instructor_id = user.get("id")
        
        # Verify session belongs to instructor
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("instructorId") != instructor_id:
            raise HTTPException(status_code=403, detail="You can only view reports for your own sessions")
        
        # Get stored report from MongoDB
        stored_report = await SessionReportModel.get_stored_master_report(session_id)
        
        if not stored_report:
            # No stored report - session may not have ended yet
            return {
                "success": False,
                "stored": False,
                "message": "No stored report found. Report is generated when you end the session.",
                "sessionStatus": session.get("status", "unknown"),
                "sessionId": session_id,
                "sessionName": session.get("title", ""),
                "report": None
            }
        
        return {
            "success": True,
            "stored": True,
            "message": "Report retrieved from MongoDB",
            "sessionId": session_id,
            "sessionName": session.get("title", ""),
            "sessionStatus": session.get("status", "completed"),
            "generatedAt": stored_report.get("generatedAt"),
            "report": stored_report
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching stored report: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stored report")


# ============================================================
# 6. GET ALL STORED REPORTS FOR INSTRUCTOR
# ============================================================
@router.get("/stored-reports")
async def get_all_stored_reports(user: dict = Depends(require_instructor)):
    """
    Get all stored reports from MongoDB for the instructor's sessions.
    Only returns reports for completed sessions.
    """
    try:
        instructor_id = user.get("id")
        
        # Get all stored reports for this instructor
        reports = []
        async for report in db.database.session_reports.find({
            "instructorId": instructor_id,
            "reportType": "master"
        }).sort("generatedAt", -1):
            report["id"] = str(report["_id"])
            del report["_id"]
            reports.append({
                "reportId": report["id"],
                "sessionId": report.get("sessionId"),
                "sessionTitle": report.get("sessionTitle"),
                "courseName": report.get("courseName"),
                "courseCode": report.get("courseCode"),
                "sessionDate": report.get("sessionDate"),
                "totalParticipants": report.get("totalParticipants", 0),
                "totalQuestionsAsked": report.get("totalQuestionsAsked", 0),
                "averageQuizScore": report.get("averageQuizScore"),
                "generatedAt": report.get("generatedAt"),
                "engagementSummary": report.get("engagementSummary", {})
            })
        
        return {
            "success": True,
            "totalReports": len(reports),
            "reports": reports
        }
        
    except Exception as e:
        print(f"Error fetching stored reports: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stored reports")


# ============================================================
# 7. GET FULL STORED REPORT WITH ALL STUDENT DATA
# ============================================================
@router.get("/sessions/{session_id}/full-report")
async def get_full_stored_report(
    session_id: str,
    user: dict = Depends(require_instructor)
):
    """
    Get the COMPLETE stored report from MongoDB with ALL student data.
    This is the full report that was generated when the session ended.
    
    Returns:
    - Session info (title, course, date, time, duration)
    - All students with their attendance, quiz scores, and engagement
    - Summary statistics
    """
    try:
        instructor_id = user.get("id")
        
        # Verify session belongs to instructor
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("instructorId") != instructor_id:
            raise HTTPException(status_code=403, detail="You can only view reports for your own sessions")
        
        # Get stored report from MongoDB
        stored_report = await db.database.session_reports.find_one({
            "sessionId": session_id,
            "reportType": "master"
        })
        
        if not stored_report:
            # No stored report - try to generate one from existing MongoDB data
            return {
                "success": False,
                "stored": False,
                "message": "No stored report found. End the session to generate a report.",
                "sessionStatus": session.get("status", "unknown"),
                "sessionId": session_id,
                "sessionTitle": session.get("title", ""),
                "courseName": session.get("course", ""),
                "report": None
            }
        
        # Format the report for frontend
        stored_report["id"] = str(stored_report["_id"])
        del stored_report["_id"]
        
        return {
            "success": True,
            "stored": True,
            "message": "Full report retrieved from MongoDB",
            "sessionId": session_id,
            "sessionTitle": stored_report.get("sessionTitle", ""),
            "courseName": stored_report.get("courseName", ""),
            "courseCode": stored_report.get("courseCode", ""),
            "instructorName": stored_report.get("instructorName", ""),
            "sessionDate": stored_report.get("sessionDate", ""),
            "sessionTime": stored_report.get("sessionTime", ""),
            "sessionDuration": stored_report.get("sessionDuration", ""),
            "sessionStatus": stored_report.get("sessionStatus", "completed"),
            "generatedAt": stored_report.get("generatedAt"),
            
            # Summary stats
            "totalParticipants": stored_report.get("totalParticipants", 0),
            "totalQuestionsAsked": stored_report.get("totalQuestionsAsked", 0),
            "averageQuizScore": stored_report.get("averageQuizScore"),
            "engagementSummary": stored_report.get("engagementSummary", {}),
            "connectionQualitySummary": stored_report.get("connectionQualitySummary", {}),
            
            # All student data
            "students": stored_report.get("students", []),
            
            # Raw data (optional, for detailed analysis)
            "allQuestions": stored_report.get("allQuestions", [])
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching full stored report: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to fetch full stored report")

