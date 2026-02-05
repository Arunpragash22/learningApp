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
        
        # Get questions for details
        question_ids = list(set([a.get("questionId") for a in assignments if a.get("questionId")]))
        questions = {}
        for qid in question_ids:
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
            
            # Get student's quiz answers
            student_answers = [a for a in quiz_answers if a.get("studentId") == student_id]
            student_assignments = [a for a in assignments if a.get("studentId") == student_id]
            
            # Calculate quiz stats
            correct_count = sum(1 for a in student_assignments if a.get("isCorrect"))
            total_questions = len(student_assignments)
            avg_time = None
            if student_answers:
                times = [a.get("timeTaken", 0) for a in student_answers if a.get("timeTaken")]
                avg_time = sum(times) / len(times) if times else None
            
            quiz_score = (correct_count / total_questions * 100) if total_questions > 0 else None
            
            # Build quiz details
            quiz_details = []
            for assignment in student_assignments:
                qid = assignment.get("questionId")
                q = questions.get(qid, {})
                quiz_details.append(QuizSummary(
                    questionId=qid or "",
                    question=q.get("question", "Unknown question"),
                    correctAnswer=q.get("correctAnswer", -1),
                    studentAnswer=assignment.get("answerIndex"),
                    isCorrect=assignment.get("isCorrect"),
                    timeTaken=assignment.get("timeTaken")
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
        total_questions_asked = len(set([a.get("questionId") for a in assignments]))
        
        avg_quiz_score = None
        scores = [s.quizScore for s in student_reports if s.quizScore is not None]
        if scores:
            avg_quiz_score = sum(scores) / len(scores)
        
        # Engagement summary (mock for now - can be enhanced with cluster data)
        engagement_summary = {
            "highly_engaged": 0,
            "moderately_engaged": 0,
            "at_risk": 0
        }
        for s in student_reports:
            if s.quizScore and s.quizScore >= 80:
                engagement_summary["highly_engaged"] += 1
            elif s.quizScore and s.quizScore >= 50:
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
            return report
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
            reports.append(report)
        return reports
    
    @staticmethod
    async def get_all_reports(user_id: str, user_role: str) -> List[Dict]:
        """Get all reports accessible by a user"""
        database = get_database()
        if database is None:
            return []
        
        reports = []
        
        if user_role in ["instructor", "admin"]:
            # Instructors see reports for their sessions
            query = {"instructorId": user_id} if user_role == "instructor" else {}
            async for report in database.session_reports.find(query).sort("generatedAt", -1):
                report["id"] = str(report["_id"])
                del report["_id"]
                reports.append(report)
        else:
            # Students see reports where they participated
            async for report in database.session_reports.find({
                "students.studentId": user_id
            }).sort("generatedAt", -1):
                report["id"] = str(report["_id"])
                del report["_id"]
                # Filter student data to only show their own
                report["students"] = [s for s in report.get("students", []) if s.get("studentId") == user_id]
                reports.append(report)
        
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
        return report
    
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
        
        # Get questions for details
        question_ids = list(set([a.get("questionId") for a in assignments if a.get("questionId")]))
        questions = {}
        for qid in question_ids:
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
        
        # Build complete student reports for ALL students
        student_reports = []
        for participant in participants:
            student_id = participant.get("studentId")
            
            # Get student's quiz answers
            student_answers = [a for a in quiz_answers if a.get("studentId") == student_id]
            student_assignments = [a for a in assignments if a.get("studentId") == student_id]
            
            # Calculate quiz stats
            correct_count = sum(1 for a in student_assignments if a.get("isCorrect"))
            total_questions = len(student_assignments)
            avg_time = None
            if student_answers:
                times = [a.get("timeTaken", 0) for a in student_answers if a.get("timeTaken")]
                avg_time = sum(times) / len(times) if times else None
            
            quiz_score = (correct_count / total_questions * 100) if total_questions > 0 else None
            
            # Build quiz details with ALL question info
            quiz_details = []
            for assignment in student_assignments:
                qid = assignment.get("questionId")
                q = questions.get(qid, {})
                quiz_details.append({
                    "questionId": qid or "",
                    "question": q.get("question", "Unknown question"),
                    "options": q.get("options", []),
                    "correctAnswer": q.get("correctAnswer", -1),
                    "studentAnswer": assignment.get("answerIndex"),
                    "isCorrect": assignment.get("isCorrect"),
                    "timeTaken": assignment.get("timeTaken"),
                    "answeredAt": assignment.get("answeredAt")
                })
            
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
        total_questions_asked = len(set([a.get("questionId") for a in assignments]))
        
        avg_quiz_score = None
        scores = [s["quizScore"] for s in student_reports if s.get("quizScore") is not None]
        if scores:
            avg_quiz_score = sum(scores) / len(scores)
        
        # Engagement summary
        engagement_summary = {
            "highly_engaged": 0,
            "moderately_engaged": 0,
            "at_risk": 0
        }
        for s in student_reports:
            score = s.get("quizScore")
            if score and score >= 80:
                engagement_summary["highly_engaged"] += 1
            elif score and score >= 50:
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
        """
        # First, try to get the stored master report
        master_report = await SessionReportModel.get_stored_master_report(session_id)
        
        if not master_report:
            # No stored report - generate fresh one (fallback for older sessions)
            return await SessionReportModel.generate_report(session_id, user_id, user_role, user_email)
        
        # Clone the report for filtering
        import copy
        report = copy.deepcopy(master_report)
        
        if user_role == "student":
            # Filter to only show this student's data
            # Match by studentId OR email (for Zoom webhook participants who may have different IDs)
            def matches_student(s):
                if s.get("studentId") == user_id:
                    return True
                if user_email and s.get("studentEmail") and s.get("studentEmail").lower() == user_email.lower():
                    return True
                return False
            
            report["students"] = [s for s in report.get("students", []) if matches_student(s)]
            report["reportType"] = "student_personal"
            # Remove raw data from student view
            report.pop("rawAssignments", None)
            report.pop("rawQuizAnswers", None)
            report.pop("allQuestions", None)
        else:
            report["reportType"] = "instructor_full"
        
        return report

