"""
Session Report Model
====================
Model for generating and storing session reports for students and instructors.
Reports include participation data, quiz performance, engagement metrics, etc.

HYBRID DATABASE ARCHITECTURE:
-----------------------------
- MongoDB: Primary database (SOURCE OF TRUTH) for all session reports
- MySQL: Backup database (READ-ONLY) for auditing and structured SQL queries

Data Flow:
1. Report generated → Saved to MongoDB (primary)
2. MongoDB save successful → Async backup to MySQL (non-blocking)
3. MySQL failure → Logged but doesn't affect API response

This hybrid approach provides:
- Flexible document storage (MongoDB) for nested session data
- SQL query capability (MySQL) for reporting and analytics
- Redundancy and backup for critical session data
"""

import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from bson import ObjectId
from ..database.connection import get_database


def _serialize(obj):
    """Recursively convert ObjectId instances to strings for JSON serialization."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    return obj


class QuizSummary(BaseModel):
    """Summary of a quiz question in the report"""
    questionId: str
    question: str
    correctAnswer: int
    studentAnswer: Optional[int] = None
    isCorrect: Optional[bool] = None
    timeTaken: Optional[float] = None


class StudentReportData(BaseModel):
    """Report data specific to a student"""
    studentId: str
    studentName: str
    studentEmail: Optional[str] = None
    
    # Attendance
    joinedAt: Optional[datetime] = None
    leftAt: Optional[datetime] = None
    attendanceDuration: Optional[int] = None  # in minutes
    
    # Quiz Performance
    totalQuestions: int = 0
    correctAnswers: int = 0
    incorrectAnswers: int = 0
    averageResponseTime: Optional[float] = None
    quizScore: Optional[float] = None  # percentage
    quizDetails: List[QuizSummary] = []
    
    # Network Quality
    averageConnectionQuality: Optional[str] = None
    connectionIssuesDetected: bool = False


class SessionReport(BaseModel):
    """Complete session report model"""
    id: Optional[str] = None
    sessionId: str
    sessionTitle: str
    courseName: str
    courseCode: str
    instructorName: str
    instructorId: str
    
    # Session timing
    sessionDate: str
    sessionTime: str
    sessionDuration: str
    actualStartTime: Optional[datetime] = None
    actualEndTime: Optional[datetime] = None
    
    # Overall statistics
    totalParticipants: int = 0
    totalQuestionsAsked: int = 0
    averageQuizScore: Optional[float] = None
    averageAttendance: Optional[float] = None  # percentage of session attended
    
    # Engagement clusters
    engagementSummary: Dict[str, int] = {}  # {"highly_engaged": 5, "at_risk": 2}
    
    # Connection quality summary
    connectionQualitySummary: Dict[str, int] = {}  # {"excellent": 10, "poor": 2}
    
    # Student data (for instructor view)
    students: List[StudentReportData] = []
    
    # Report metadata
    generatedAt: datetime = Field(default_factory=datetime.utcnow)
    reportType: str = "session_summary"  # session_summary, student_detail
    
    class Config:
        json_schema_extra = {
            "example": {
                "sessionId": "abc123",
                "sessionTitle": "Machine Learning: Neural Networks",
                "courseName": "Machine Learning Fundamentals",
                "courseCode": "ML101",
                "instructorName": "Dr. Jane Smith",
                "totalParticipants": 25,
                "averageQuizScore": 78.5
            }
        }


class SessionReportModel:
    """Database operations for session reports"""
    
    COLLECTION_NAME = "session_reports"
    
    @staticmethod
    async def generate_report(session_id: str, user_id: str, user_role: str, user_email: str = None) -> Optional[Dict]:
        """
        Generate a session report.
        - Instructors get full report with all student data
        - Students get personalized report with their own data only
        
        For students, matches by studentId OR email (for Zoom webhook participants).
        """
        database = get_database()
        if database is None:
            raise Exception("Database not connected")
        
        # Get session details
        session = await database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            return None
        
        # Get participants
        participants = []
        async for p in database.session_participants.find({"sessionId": session_id}):
            p["id"] = str(p["_id"])
            del p["_id"]
            participants.append(p)
        
        # Get quiz answers for this session
        quiz_answers = []
        async for answer in database.quiz_answers.find({"sessionId": session_id}):
            answer["id"] = str(answer["_id"])
            del answer["_id"]
            quiz_answers.append(answer)
        
        # Get question assignments
        assignments = []
        async for assignment in database.question_assignments.find({"sessionId": session_id}):
            assignment["id"] = str(assignment["_id"])
            del assignment["_id"]
            assignments.append(assignment)
        
        # Get questions for details (from both assignments and quiz_answers)
        question_id_set = set()
        for a in assignments:
            qid = a.get("questionId")
            if qid:
                question_id_set.add(qid)
        for a in quiz_answers:
            qid = a.get("questionId")
            if qid:
                question_id_set.add(qid)
        questions = {}
        for qid in question_id_set:
            try:
                q = await database.questions.find_one({"_id": ObjectId(qid)})
                if q:
                    questions[qid] = q
            except:
                pass
        
        # Get latency metrics
        latency_data = {}
        async for metric in database.latency_metrics.find({"session_id": session_id}):
            student_id = metric.get("student_id")
            if student_id:
                latency_data[student_id] = metric
        
        # Build student reports
        student_reports = []
        for participant in participants:
            student_id = participant.get("studentId")
            
            # Get student's quiz answers and assignments
            student_answers = [a for a in quiz_answers if a.get("studentId") == student_id]
            student_assignments = [a for a in assignments if a.get("studentId") == student_id]
            
            # Use assignments if available, otherwise fallback to quiz_answers
            if student_assignments:
                correct_count = sum(1 for a in student_assignments if a.get("isCorrect"))
                total_questions = len(student_assignments)
            elif student_answers:
                correct_count = sum(1 for a in student_answers if a.get("isCorrect"))
                total_questions = len(student_answers)
            else:
                correct_count = 0
                total_questions = 0

            avg_time = None
            if student_answers:
                times = [a.get("timeTaken", 0) for a in student_answers if a.get("timeTaken")]
                avg_time = sum(times) / len(times) if times else None
            
            quiz_score = (correct_count / total_questions * 100) if total_questions > 0 else None
            
            # Build quiz details from assignments or quiz_answers
            quiz_details = []
            source = student_assignments if student_assignments else student_answers
            for item in source:
                qid = item.get("questionId")
                q = questions.get(qid, {})
                quiz_details.append(QuizSummary(
                    questionId=qid or "",
                    question=q.get("question", "Unknown question"),
                    correctAnswer=q.get("correctAnswer", -1),
                    studentAnswer=item.get("answerIndex"),
                    isCorrect=item.get("isCorrect"),
                    timeTaken=item.get("timeTaken")
                ))
            
            # Calculate attendance duration
            joined_at = participant.get("joinedAt")
            left_at = participant.get("leftAt")
            duration = None
            if joined_at and left_at:
                duration = int((left_at - joined_at).total_seconds() / 60)
            
            # Get latency info
            latency_info = latency_data.get(student_id, {})
            
            student_report = StudentReportData(
                studentId=student_id,
                studentName=participant.get("studentName", "Unknown Student"),
                studentEmail=participant.get("studentEmail"),
                joinedAt=joined_at,
                leftAt=left_at,
                attendanceDuration=duration,
                totalQuestions=total_questions,
                correctAnswers=correct_count,
                incorrectAnswers=total_questions - correct_count,
                averageResponseTime=avg_time,
                quizScore=quiz_score,
                quizDetails=quiz_details,
                averageConnectionQuality=latency_info.get("overall_quality"),
                connectionIssuesDetected=latency_info.get("overall_quality") in ["poor", "critical"]
            )
            student_reports.append(student_report)
        
        # Calculate overall stats
        total_participants = len(participants)
        all_q_ids = set([a.get("questionId") for a in assignments])
        all_q_ids.update([a.get("questionId") for a in quiz_answers])
        total_questions_asked = len(all_q_ids - {None})
        
        avg_quiz_score = None
        scores = [s.quizScore for s in student_reports if s.quizScore is not None]
        if scores:
            avg_quiz_score = sum(scores) / len(scores)
        
        # Engagement summary from REAL cluster data
        report_cluster_map = {}
        try:
            for sid in [session_id]:
                async for c in database.clusters.find({"sessionId": sid}):
                    level = c.get("engagementLevel", "")
                    if level in ("active", "moderate", "passive"):
                        for sid_s in c.get("students", []):
                            report_cluster_map[sid_s] = level
            # Also try zoom ID
            zoom_id = session.get("zoomMeetingId")
            if zoom_id:
                async for c in database.clusters.find({"sessionId": str(zoom_id)}):
                    level = c.get("engagementLevel", "")
                    if level in ("active", "moderate", "passive"):
                        for sid_s in c.get("students", []):
                            if sid_s not in report_cluster_map:
                                report_cluster_map[sid_s] = level
        except Exception:
            pass

        engagement_summary = {
            "highly_engaged": 0,
            "moderately_engaged": 0,
            "at_risk": 0
        }
        for s in student_reports:
            level = report_cluster_map.get(s.studentId, "")
            if level == "active":
                engagement_summary["highly_engaged"] += 1
            elif level == "moderate":
                engagement_summary["moderately_engaged"] += 1
            else:
                engagement_summary["at_risk"] += 1
        
        # Connection quality summary
        connection_summary = {"excellent": 0, "good": 0, "fair": 0, "poor": 0, "critical": 0, "unknown": 0}
        for s in student_reports:
            quality = s.averageConnectionQuality or "unknown"
            connection_summary[quality] = connection_summary.get(quality, 0) + 1
        
        # Build report based on user role
        if user_role == "student":
            # Filter to only include requesting student's data
            # Match by studentId OR email (for Zoom webhook participants who may have different IDs)
            def matches_student(s):
                if s.studentId == user_id:
                    return True
                if user_email and s.studentEmail and s.studentEmail.lower() == user_email.lower():
                    return True
                return False
            student_reports = [s for s in student_reports if matches_student(s)]
        
        report = SessionReport(
            sessionId=session_id,
            sessionTitle=session.get("title", "Unknown Session"),
            courseName=session.get("course", "Unknown Course"),
            courseCode=session.get("courseCode", ""),
            instructorName=session.get("instructor", "Unknown Instructor"),
            instructorId=session.get("instructorId", ""),
            sessionDate=session.get("date", ""),
            sessionTime=session.get("time", ""),
            sessionDuration=session.get("duration", ""),
            totalParticipants=total_participants,
            totalQuestionsAsked=total_questions_asked,
            averageQuizScore=round(avg_quiz_score, 1) if avg_quiz_score else None,
            engagementSummary=engagement_summary,
            connectionQualitySummary=connection_summary,
            students=student_reports,
            reportType="instructor_full" if user_role in ["instructor", "admin"] else "student_personal"
        )
        
        return report.model_dump()
    
    @staticmethod
    async def save_report(report_data: Dict) -> str:
        """Save a generated report to the database"""
        database = get_database()
        if database is None:
            raise Exception("Database not connected")
        
        report_data["savedAt"] = datetime.utcnow()
        result = await database.session_reports.insert_one(report_data)
        return str(result.inserted_id)
    
    @staticmethod
    async def get_saved_report(report_id: str) -> Optional[Dict]:
        """Get a previously saved report"""
        database = get_database()
        if database is None:
            return None
        
        try:
            report = await database.session_reports.find_one({"_id": ObjectId(report_id)})
            if report:
                report["id"] = str(report["_id"])
                del report["_id"]
            return _serialize(report) if report else None
        except:
            return None
    
    @staticmethod
    async def get_reports_for_session(session_id: str) -> List[Dict]:
        """Get all saved reports for a session"""
        database = get_database()
        if database is None:
            return []
        
        reports = []
        async for report in database.session_reports.find({"sessionId": session_id}):
            report["id"] = str(report["_id"])
            del report["_id"]
            reports.append(_serialize(report))
        return reports
    
    @staticmethod
    async def get_all_reports(user_id: str, user_role: str) -> List[Dict]:
        """Get all reports accessible by a user"""
        database = get_database()
        if database is None:
            return []
        
        reports = []
        
        if user_role in ["instructor", "admin"]:
            query = {"instructorId": user_id} if user_role == "instructor" else {}
            async for report in database.session_reports.find(query).sort("generatedAt", -1):
                report["id"] = str(report["_id"])
                del report["_id"]
                reports.append(_serialize(report))
        else:
            async for report in database.session_reports.find({
                "students.studentId": user_id
            }).sort("generatedAt", -1):
                report["id"] = str(report["_id"])
                del report["_id"]
                report["students"] = [s for s in report.get("students", []) if s.get("studentId") == user_id]
                reports.append(_serialize(report))
        
        return reports
    
    @staticmethod
    async def find_existing_report(session_id: str, user_id: str, report_type: str) -> Optional[Dict]:
        """Find an existing report for a session and user"""
        database = get_database()
        if database is None:
            return None
        
        query = {
            "sessionId": session_id,
            "reportType": report_type
        }
        
        # For student reports, also match the student
        if report_type == "student_personal":
            query["students.studentId"] = user_id
        
        report = await database.session_reports.find_one(query)
        if report:
            report["id"] = str(report["_id"])
            del report["_id"]
        return _serialize(report) if report else None
    
    @staticmethod
    async def update_report(report_id: str, report_data: Dict) -> bool:
        """Update an existing report"""
        database = get_database()
        if database is None:
            return False
        
        report_data["updatedAt"] = datetime.utcnow()
        result = await database.session_reports.update_one(
            {"_id": ObjectId(report_id)},
            {"$set": report_data}
        )
        return result.modified_count > 0
    
    @staticmethod
    async def delete_report(report_id: str) -> bool:
        """Delete a report"""
        database = get_database()
        if database is None:
            return False
        
        result = await database.session_reports.delete_one({"_id": ObjectId(report_id)})
        return result.deleted_count > 0
    
    @staticmethod
    async def generate_and_save_report(session_id: str, user_id: str, user_role: str) -> Optional[Dict]:
        """
        Generate a report and save it to MongoDB.
        If a report already exists, update it with fresh data.
        """
        # Generate the report
        report_data = await SessionReportModel.generate_report(session_id, user_id, user_role)
        if not report_data:
            return None
        
        database = get_database()
        if database is None:
            return report_data
        
        # Check if report already exists
        report_type = report_data.get("reportType", "session_summary")
        existing = await SessionReportModel.find_existing_report(session_id, user_id, report_type)
        
        if existing:
            # Update existing report
            report_data["id"] = existing["id"]
            await SessionReportModel.update_report(existing["id"], report_data)
        else:
            # Save new report
            report_id = await SessionReportModel.save_report(report_data)
            report_data["id"] = report_id
        
        return report_data
    
    @staticmethod
    async def generate_master_report(session_id: str, instructor_id: str) -> Optional[Dict]:
        """
        Generate and save a MASTER report with ALL data when session ends.
        This report contains complete data for all participants.
        Stored separately in MongoDB with reportType='master'.
        """
        database = get_database()
        if database is None:
            raise Exception("Database not connected")
        
        # Get session details
        session = await database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            return None
        
        # Get the Zoom meeting ID for this session (participants might be stored with this)
        zoom_meeting_id = session.get("zoomMeetingId")
        
        # Get ALL participants - check BOTH MongoDB session_id AND zoomMeetingId
        participants = []
        participant_ids_seen = set()
        
        # First, try by MongoDB session_id
        async for p in database.session_participants.find({"sessionId": session_id}):
            p["id"] = str(p["_id"])
            del p["_id"]
            if p.get("studentId") not in participant_ids_seen:
                participants.append(p)
                participant_ids_seen.add(p.get("studentId"))
        
        # Also try by zoomMeetingId (as string)
        if zoom_meeting_id:
            async for p in database.session_participants.find({"sessionId": str(zoom_meeting_id)}):
                p["id"] = str(p["_id"])
                del p["_id"]
                if p.get("studentId") not in participant_ids_seen:
                    participants.append(p)
                    participant_ids_seen.add(p.get("studentId"))
        
        print(f"📊 Report: Found {len(participants)} participants for session {session_id} (zoomId: {zoom_meeting_id})")
        
        # Get ALL quiz answers for this session - check BOTH MongoDB ID and Zoom ID
        quiz_answers = []
        answer_ids_seen = set()
        
        # Check by MongoDB session_id
        async for answer in database.quiz_answers.find({"sessionId": session_id}):
            answer_id = str(answer["_id"])
            if answer_id not in answer_ids_seen:
                answer["id"] = answer_id
                del answer["_id"]
                quiz_answers.append(answer)
                answer_ids_seen.add(answer_id)
        
        # Also check by zoomMeetingId
        if zoom_meeting_id:
            async for answer in database.quiz_answers.find({"sessionId": str(zoom_meeting_id)}):
                answer_id = str(answer["_id"])
                if answer_id not in answer_ids_seen:
                    answer["id"] = answer_id
                    del answer["_id"]
                    quiz_answers.append(answer)
                    answer_ids_seen.add(answer_id)
        
        print(f"📊 Report: Found {len(quiz_answers)} quiz answers")
        
        # Get ALL question assignments - check BOTH MongoDB ID and Zoom ID
        assignments = []
        assignment_ids_seen = set()
        
        # Check by MongoDB session_id
        async for assignment in database.question_assignments.find({"sessionId": session_id}):
            assignment_id = str(assignment["_id"])
            if assignment_id not in assignment_ids_seen:
                assignment["id"] = assignment_id
                del assignment["_id"]
                assignments.append(assignment)
                assignment_ids_seen.add(assignment_id)
        
        # Also check by zoomMeetingId
        if zoom_meeting_id:
            async for assignment in database.question_assignments.find({"sessionId": str(zoom_meeting_id)}):
                assignment_id = str(assignment["_id"])
                if assignment_id not in assignment_ids_seen:
                    assignment["id"] = assignment_id
                    del assignment["_id"]
                    assignments.append(assignment)
                    assignment_ids_seen.add(assignment_id)
        
        print(f"📊 Report: Found {len(assignments)} question assignments")
        
        # Get questions for details (from both assignments and quiz_answers)
        question_id_set = set()
        for a in assignments:
            qid = a.get("questionId")
            if qid:
                question_id_set.add(qid)
        for a in quiz_answers:
            qid = a.get("questionId")
            if qid:
                question_id_set.add(qid)
        questions = {}
        for qid in question_id_set:
            try:
                q = await database.questions.find_one({"_id": ObjectId(qid)})
                if q:
                    q["id"] = str(q["_id"])
                    questions[qid] = q
            except:
                pass
        
        # Get ALL latency metrics - check BOTH MongoDB ID and Zoom ID
        latency_data = {}
        async for metric in database.latency_metrics.find({"session_id": session_id}):
            student_id = metric.get("student_id")
            if student_id:
                metric["id"] = str(metric.get("_id", ""))
                latency_data[student_id] = metric
        
        # Also check by zoomMeetingId
        if zoom_meeting_id:
            async for metric in database.latency_metrics.find({"session_id": str(zoom_meeting_id)}):
                student_id = metric.get("student_id")
                if student_id and student_id not in latency_data:
                    metric["id"] = str(metric.get("_id", ""))
                    latency_data[student_id] = metric
        
        # Get REAL cluster assignments from MongoDB
        cluster_map = {}  # student_id → "active" / "moderate" / "passive"
        for sid in [session_id] + ([str(zoom_meeting_id)] if zoom_meeting_id else []):
            async for c in database.clusters.find({"sessionId": sid}):
                level = c.get("engagementLevel", "")
                if level in ("active", "moderate", "passive"):
                    for s in c.get("students", []):
                        cluster_map[s] = level
        
        print(f"📊 Report: Loaded {len(cluster_map)} cluster assignments")
        
        # Build complete student reports for ALL students
        student_reports = []
        for participant in participants:
            student_id = participant.get("studentId")
            
            # Get student's quiz answers and assignments
            student_answers = [a for a in quiz_answers if a.get("studentId") == student_id]
            student_assignments = [a for a in assignments if a.get("studentId") == student_id]
            
            # Use assignments if available, otherwise fallback to quiz_answers
            if student_assignments:
                correct_count = sum(1 for a in student_assignments if a.get("isCorrect"))
                total_questions = len(student_assignments)
            elif student_answers:
                correct_count = sum(1 for a in student_answers if a.get("isCorrect"))
                total_questions = len(student_answers)
            else:
                correct_count = 0
                total_questions = 0

            avg_time = None
            if student_answers:
                times = [a.get("timeTaken", 0) for a in student_answers if a.get("timeTaken")]
                avg_time = sum(times) / len(times) if times else None
            
            quiz_score = (correct_count / total_questions * 100) if total_questions > 0 else None
            
            # Build quiz details with enriched data:
            # option texts, running accuracy, cluster progression
            quiz_details = []
            source = student_assignments if student_assignments else student_answers

            # Build a lookup from questionId → clusterAtAnswer from quiz_answers
            answer_cluster_map = {}
            for ans in student_answers:
                qid_ans = ans.get("questionId")
                if qid_ans and ans.get("clusterAtAnswer"):
                    answer_cluster_map[qid_ans] = ans["clusterAtAnswer"]

            running_correct = 0
            running_total = 0
            last_known_cluster = "moderate"
            for item in source:
                qid = item.get("questionId")
                q = questions.get(qid, {})
                options = q.get("options", [])
                correct_idx = q.get("correctAnswer", -1)
                student_idx = item.get("answerIndex")
                is_correct = item.get("isCorrect", False)

                running_total += 1
                if is_correct:
                    running_correct += 1
                running_accuracy = round((running_correct / running_total) * 100, 1)

                # Per-answer cluster: prefer stamp from quiz_answer, then item,
                # then carry forward last known, then current cluster_map
                cluster_at_answer = (
                    answer_cluster_map.get(qid)
                    or item.get("clusterAtAnswer")
                    or None
                )
                if cluster_at_answer:
                    last_known_cluster = cluster_at_answer
                else:
                    cluster_at_answer = last_known_cluster

                quiz_details.append({
                    "questionId": qid or "",
                    "question": q.get("question", "Unknown question"),
                    "options": options,
                    "correctAnswer": correct_idx,
                    "correctAnswerText": options[correct_idx] if 0 <= correct_idx < len(options) else "N/A",
                    "studentAnswer": student_idx,
                    "studentAnswerText": options[student_idx] if student_idx is not None and 0 <= student_idx < len(options) else "No answer",
                    "isCorrect": is_correct,
                    "timeTaken": item.get("timeTaken"),
                    "answeredAt": item.get("answeredAt", item.get("timestamp")),
                    "runningAccuracy": running_accuracy,
                    "runningCorrect": running_correct,
                    "runningTotal": running_total,
                    "clusterAtAnswer": cluster_at_answer,
                })

            # For the last entry, use current cluster if no stamp exists
            if quiz_details and not answer_cluster_map.get(quiz_details[-1].get("questionId")):
                quiz_details[-1]["clusterAtAnswer"] = cluster_map.get(student_id, last_known_cluster)
            
            # Calculate attendance duration
            joined_at = participant.get("joinedAt")
            left_at = participant.get("leftAt")
            duration = None
            if joined_at and left_at:
                duration = int((left_at - joined_at).total_seconds() / 60)
            
            # Get latency info
            latency_info = latency_data.get(student_id, {})
            
            student_report = {
                "studentId": student_id,
                "studentName": participant.get("studentName", "Unknown Student"),
                "studentEmail": participant.get("studentEmail"),
                "joinedAt": joined_at,
                "leftAt": left_at,
                "attendanceDuration": duration,
                "totalQuestions": total_questions,
                "correctAnswers": correct_count,
                "incorrectAnswers": total_questions - correct_count,
                "averageResponseTime": round(avg_time, 2) if avg_time else None,
                "quizScore": round(quiz_score, 1) if quiz_score else None,
                "quizDetails": quiz_details,
                "averageConnectionQuality": latency_info.get("overall_quality"),
                "connectionIssuesDetected": latency_info.get("overall_quality") in ["poor", "critical"],
                "engagementLevel": cluster_map.get(student_id, "moderate"),
                "latencyMetrics": {
                    "avgLatency": latency_info.get("avg_latency"),
                    "minLatency": latency_info.get("min_latency"),
                    "maxLatency": latency_info.get("max_latency"),
                    "packetLoss": latency_info.get("packet_loss")
                }
            }
            student_reports.append(student_report)
        
        # Calculate overall stats
        total_participants = len(participants)
        all_q_ids = set([a.get("questionId") for a in assignments])
        all_q_ids.update([a.get("questionId") for a in quiz_answers])
        total_questions_asked = len(all_q_ids - {None})
        
        avg_quiz_score = None
        scores = [s["quizScore"] for s in student_reports if s.get("quizScore") is not None]
        if scores:
            avg_quiz_score = sum(scores) / len(scores)
        
        # Engagement summary from REAL cluster data (not quiz score thresholds)
        engagement_summary = {
            "highly_engaged": 0,
            "moderately_engaged": 0,
            "at_risk": 0
        }
        for s in student_reports:
            level = s.get("engagementLevel", "")
            if level == "active":
                engagement_summary["highly_engaged"] += 1
            elif level == "moderate":
                engagement_summary["moderately_engaged"] += 1
            else:
                engagement_summary["at_risk"] += 1
        
        # Connection quality summary
        connection_summary = {"excellent": 0, "good": 0, "fair": 0, "poor": 0, "critical": 0, "unknown": 0}
        for s in student_reports:
            quality = s.get("averageConnectionQuality") or "unknown"
            connection_summary[quality] = connection_summary.get(quality, 0) + 1
        
        # Create MASTER report
        master_report = {
            "sessionId": session_id,
            "sessionTitle": session.get("title", "Unknown Session"),
            "courseName": session.get("course", "Unknown Course"),
            "courseCode": session.get("courseCode", ""),
            "instructorName": session.get("instructor", "Unknown Instructor"),
            "instructorId": session.get("instructorId", instructor_id),
            "sessionDate": session.get("date", ""),
            "sessionTime": session.get("time", ""),
            "sessionDuration": session.get("duration", ""),
            "scheduledStartTime": session.get("scheduledStartTime"),
            "scheduledEndTime": session.get("scheduledEndTime"),
            "actualStartTime": session.get("actualStartTime") or session.get("startedAt"),
            "actualEndTime": session.get("actualEndTime") or session.get("endedAt"),
            "sessionStatus": session.get("status", "completed"),
            "totalParticipants": total_participants,
            "totalQuestionsAsked": total_questions_asked,
            "averageQuizScore": round(avg_quiz_score, 1) if avg_quiz_score else None,
            "engagementSummary": engagement_summary,
            "connectionQualitySummary": connection_summary,
            "students": student_reports,
            "reportType": "master",
            "generatedAt": datetime.utcnow(),
            "allQuestions": list(questions.values()),
            "rawAssignments": assignments,
            "rawQuizAnswers": quiz_answers
        }
        
        # Save to MongoDB - check for existing master report
        existing = await database.session_reports.find_one({
            "sessionId": session_id,
            "reportType": "master"
        })
        
        if existing:
            # Update existing master report
            master_report["updatedAt"] = datetime.utcnow()
            await database.session_reports.update_one(
                {"_id": existing["_id"]},
                {"$set": master_report}
            )
            master_report["id"] = str(existing["_id"])
        else:
            # Insert new master report
            result = await database.session_reports.insert_one(master_report)
            master_report["id"] = str(result.inserted_id)
        
        # ============================================================
        # MYSQL BACKUP: Async backup to MySQL (non-blocking)
        # ============================================================
        # MongoDB save was successful - now trigger MySQL backup
        # This runs in the background and doesn't block the response
        # If MySQL fails, it's logged but doesn't affect the API
        try:
            from ..services.mysql_backup_service import mysql_backup_service
            # Create background task for MySQL backup (non-blocking)
            asyncio.create_task(mysql_backup_service.backup_report_async(master_report))
            print(f"📦 MySQL backup triggered for report {master_report['id']}")
        except Exception as e:
            # MySQL backup failure is non-fatal - just log it
            print(f"⚠️ MySQL backup trigger failed (non-fatal): {e}")
        
        return master_report
    
    @staticmethod
    async def get_stored_master_report(session_id: str) -> Optional[Dict]:
        """Get the stored master report for a session"""
        database = get_database()
        if database is None:
            return None
        
        report = await database.session_reports.find_one({
            "sessionId": session_id,
            "reportType": "master"
        })
        
        if report:
            report["id"] = str(report["_id"])
            del report["_id"]
        
        return report
    
    @staticmethod
    async def get_report_for_user(session_id: str, user_id: str, user_role: str, user_email: str = None) -> Optional[Dict]:
        """
        Get report from MongoDB, filtering data based on user role.
        - Instructors/admins: Get full master report with all students
        - Students: Get filtered report with only their own data
        
        For students, matches by studentId OR email (for Zoom webhook participants).
        If a student's stored data shows 0 quiz questions but quiz_answers exist,
        the data is enriched on-the-fly.
        """
        # First, try to get the stored master report
        master_report = await SessionReportModel.get_stored_master_report(session_id)
        
        if not master_report:
            return await SessionReportModel.generate_report(session_id, user_id, user_role, user_email)
        
        import copy
        report = copy.deepcopy(master_report)
        
        if user_role == "student":
            def matches_student(s):
                if s.get("studentId") == user_id:
                    return True
                if user_email and s.get("studentEmail") and s.get("studentEmail").lower() == user_email.lower():
                    return True
                return False
            
            report["students"] = [s for s in report.get("students", []) if matches_student(s)]
            report["reportType"] = "student_personal"
            report.pop("rawAssignments", None)
            report.pop("rawQuizAnswers", None)
            report.pop("allQuestions", None)
            
            # Enrich stale student data: if stored report shows 0 questions,
            # check quiz_answers / question_assignments directly
            if report["students"]:
                student_data = report["students"][0]
                if student_data.get("totalQuestions", 0) == 0:
                    await SessionReportModel._enrich_student_quiz_data(
                        session_id, student_data, user_id
                    )
        else:
            report["reportType"] = "instructor_full"
        
        return report

    @staticmethod
    async def _enrich_student_quiz_data(session_id: str, student_data: Dict, student_id: str):
        """
        Fill in quiz performance for a student when the stored report has 0 questions.
        Checks question_assignments first, then falls back to quiz_answers.
        """
        database = get_database()
        if database is None:
            return

        session = await database.sessions.find_one({"_id": ObjectId(session_id)})
        zoom_id = session.get("zoomMeetingId") if session else None
        session_ids = [session_id] + ([str(zoom_id)] if zoom_id else [])

        items = []
        source_label = None

        for sid in session_ids:
            async for a in database.question_assignments.find({"sessionId": sid, "studentId": student_id}):
                items.append(a)
            if items:
                source_label = "assignments"
                break

        if not items:
            for sid in session_ids:
                async for a in database.quiz_answers.find({"sessionId": sid, "studentId": student_id}):
                    items.append(a)
                if items:
                    source_label = "quiz_answers"
                    break

        if not items:
            return

        correct = sum(1 for a in items if a.get("isCorrect"))
        total = len(items)
        times = [a.get("timeTaken") for a in items if a.get("timeTaken")]
        avg_time = (sum(times) / len(times)) if times else None

        student_data["totalQuestions"] = total
        student_data["correctAnswers"] = correct
        student_data["incorrectAnswers"] = total - correct
        student_data["quizScore"] = round((correct / total * 100), 1) if total > 0 else None
        if avg_time is not None:
            student_data["averageResponseTime"] = round(avg_time, 2)

        # Build clusterAtAnswer lookup from quiz_answers
        answer_cluster_map = {}
        for sid in session_ids:
            async for ans in database.quiz_answers.find(
                {"sessionId": sid, "studentId": student_id, "clusterAtAnswer": {"$exists": True}},
                {"questionId": 1, "clusterAtAnswer": 1},
            ):
                qid_ans = ans.get("questionId")
                if qid_ans:
                    answer_cluster_map[qid_ans] = ans["clusterAtAnswer"]

        quiz_details = []
        running_correct = 0
        running_total = 0
        last_known_cluster = "moderate"
        for item in items:
            qid = item.get("questionId")
            q = {}
            try:
                q_doc = await database.questions.find_one({"_id": ObjectId(qid)})
                if q_doc:
                    q = q_doc
            except Exception:
                pass
            ts_field = "answeredAt" if source_label == "assignments" else "timestamp"
            options = q.get("options", [])
            correct_idx = q.get("correctAnswer", -1)
            student_idx = item.get("answerIndex")
            is_correct = item.get("isCorrect", False)

            running_total += 1
            if is_correct:
                running_correct += 1
            running_accuracy = round((running_correct / running_total) * 100, 1)

            cluster_at_answer = (
                answer_cluster_map.get(qid)
                or item.get("clusterAtAnswer")
                or None
            )
            if cluster_at_answer:
                last_known_cluster = cluster_at_answer
            else:
                cluster_at_answer = last_known_cluster

            quiz_details.append({
                "questionId": qid or "",
                "question": q.get("question", "Unknown question"),
                "options": options,
                "correctAnswer": correct_idx,
                "correctAnswerText": options[correct_idx] if 0 <= correct_idx < len(options) else "N/A",
                "studentAnswer": student_idx,
                "studentAnswerText": options[student_idx] if student_idx is not None and 0 <= student_idx < len(options) else "No answer",
                "isCorrect": is_correct,
                "timeTaken": item.get("timeTaken"),
                "answeredAt": item.get(ts_field),
                "runningAccuracy": running_accuracy,
                "runningCorrect": running_correct,
                "runningTotal": running_total,
                "clusterAtAnswer": cluster_at_answer,
            })
        student_data["quizDetails"] = quiz_details

