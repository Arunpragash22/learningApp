# src/routers/session_report.py
"""
Session Report API
==================
Endpoints for generating and downloading session reports.
Both students and instructors can access reports after sessions end.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from typing import Optional
from datetime import datetime
from bson import ObjectId

from src.database.connection import db
from src.middleware.auth import get_current_user
from src.models.session_report_model import SessionReportModel
from src.services.email_service import email_service

router = APIRouter(prefix="/api/sessions", tags=["Session Reports"])


# New endpoint to get all reports for a user
reports_router = APIRouter(prefix="/api/reports", tags=["Reports"])


@reports_router.get("")
async def get_all_reports(user: dict = Depends(get_current_user)):
    """
    Get all reports.
    - Instructors: see reports for all their sessions with full student details.
    - Students: see only sessions they participated in (with their own data only).
    """
    try:
        user_role = user.get("role", "student")
        user_id = user.get("id")
        
        # get_all_reports handles both instructors and students
        reports = await SessionReportModel.get_all_reports(user_id, user_role)
        return {"reports": reports, "total": len(reports)}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching reports: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch reports")


@reports_router.get("/{report_id}")
async def get_report_by_id(
    report_id: str,
    user: dict = Depends(get_current_user)
):
    """Get a specific saved report by ID"""
    try:
        report = await SessionReportModel.get_saved_report(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        user_role = user.get("role", "student")
        user_id = user.get("id")
        user_email = user.get("email", "")
        
        # Check access permissions
        if user_role == "student":
            # Students can only view their own reports
            # Match by studentId OR email (for Zoom webhook participants)
            def matches_student(s):
                if s.get("studentId") == user_id:
                    return True
                if user_email and s.get("studentEmail") and s.get("studentEmail").lower() == user_email.lower():
                    return True
                return False
            
            has_access = any(matches_student(s) for s in report.get("students", []))
            if not has_access:
                raise HTTPException(status_code=403, detail="Access denied")
            # Filter to only show their data
            report["students"] = [s for s in report.get("students", []) if matches_student(s)]
            # Remove raw data from student view
            report.pop("rawAssignments", None)
            report.pop("rawQuizAnswers", None)
            report.pop("allQuestions", None)
        elif user_role == "instructor":
            if report.get("instructorId") != user_id:
                raise HTTPException(status_code=403, detail="Access denied")
        
        return report
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching report: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch report")


@reports_router.get("/session/{session_id}/stored")
async def get_stored_report_for_session(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Get the stored master report for a specific session.
    Returns the complete stored report from MongoDB.
    """
    try:
        user_role = user.get("role", "student")
        user_id = user.get("id")
        user_email = user.get("email", "")
        
        # Get stored report from MongoDB
        # Pass email for fallback matching (for Zoom webhook participants)
        report = await SessionReportModel.get_report_for_user(session_id, user_id, user_role, user_email)
        
        if not report:
            raise HTTPException(
                status_code=404, 
                detail="No stored report found for this session. Report is generated when the session ends."
            )
        
        return {
            "stored": True,
            "storedAt": report.get("generatedAt"),
            "report": report
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching stored report: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stored report")


@router.get("/{session_id}/report")
async def get_session_report(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Generate and return session report.
    - Instructors: full report with all student details.
    - Students: personal report with only their own data (if they participated).
    - For sessions not yet ended, generates live/preview report.
    """
    try:
        # Verify session exists
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        user_role = user.get("role", "student")
        user_id = user.get("id")
        user_email = user.get("email", "")
        
        # Instructors can only view reports for their own sessions
        if user_role == "instructor":
            if session.get("instructorId") != user_id:
                raise HTTPException(
                    status_code=403, 
                    detail="You can only view reports for your own sessions"
                )
        
        # Get report (instructor: full; student: filtered to their data)
        # Pass email for fallback matching (for Zoom webhook participants)
        report = await SessionReportModel.get_report_for_user(session_id, user_id, user_role, user_email)
        
        if not report:
            # No stored report - generate fresh report (live or preview)
            report = await SessionReportModel.generate_report(session_id, user_id, user_role, user_email)
        
        # Students may only view report if they participated (have data in report)
        if user_role == "student" and report and len(report.get("students", [])) == 0:
            raise HTTPException(
                status_code=403,
                detail="You did not participate in this session"
            )
        
        if not report:
            # Create a minimal report with session info if no data available
            report = {
                "sessionId": session_id,
                "sessionTitle": session.get("title", "Unknown Session"),
                "courseName": session.get("course", "Unknown Course"),
                "courseCode": session.get("courseCode", ""),
                "instructorName": session.get("instructor", "Unknown Instructor"),
                "instructorId": session.get("instructorId", ""),
                "sessionDate": session.get("date", ""),
                "sessionTime": session.get("time", ""),
                "sessionDuration": session.get("duration", ""),
                "sessionStatus": session.get("status", "upcoming"),
                "totalParticipants": 0,
                "totalQuestionsAsked": 0,
                "averageQuizScore": None,
                "engagementSummary": {"highly_engaged": 0, "moderately_engaged": 0, "at_risk": 0},
                "connectionQualitySummary": {},
                "students": [],
                "reportType": "preview",
                "generatedAt": datetime.utcnow().isoformat(),
                "message": "Session has not ended yet. Full report will be available after the session ends."
            }
        
        return report
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error generating report: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


@router.get("/{session_id}/report/download")
async def download_session_report(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Generate and return downloadable HTML report.
    - Instructors: full session report.
    - Students: personal report (only their data) for sessions they participated in.
    """
    try:
        user_role = user.get("role", "student")
        user_id = user.get("id")
        user_email = user.get("email", "")
        
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if user_role == "instructor":
            if session.get("instructorId") != user_id:
                raise HTTPException(
                    status_code=403, 
                    detail="You can only download reports for your own sessions"
                )
        
        # Get report (instructor: full; student: filtered to their data)
        # Pass email for fallback matching (for Zoom webhook participants)
        report = await SessionReportModel.get_report_for_user(session_id, user_id, user_role, user_email)
        if not report:
            report = await SessionReportModel.generate_report(session_id, user_id, user_role, user_email)
        if not report:
            raise HTTPException(status_code=404, detail="Could not generate report")
        
        # Students may only download if they participated
        if user_role == "student" and len(report.get("students", [])) == 0:
            raise HTTPException(
                status_code=403,
                detail="You did not participate in this session"
            )
        
        # Generate HTML (instructor: full table; student: personal quiz details)
        html_content = _generate_report_html(report, user_role)
        
        return HTMLResponse(
            content=html_content,
            headers={
                "Content-Disposition": f"attachment; filename=session_report_{session_id}.html"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error downloading report: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to download report: {str(e)}")


@router.post("/{session_id}/report/send-email")
async def send_report_email(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Send session report emails to all participants.
    Only instructors can trigger this.
    """
    user_role = user.get("role", "student")
    user_id = user.get("id")
    
    if user_role not in ["instructor", "admin"]:
        raise HTTPException(status_code=403, detail="Only instructors can send report emails")
    
    try:
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if user_role == "instructor" and session.get("instructorId") != user_id:
            raise HTTPException(
                status_code=403, 
                detail="You can only send reports for your own sessions"
            )
        
        # Get participants with emails
        participants = []
        async for p in db.database.session_participants.find({"sessionId": session_id}):
            if p.get("studentEmail"):
                participants.append(p)
        
        # Send emails
        sent_count = 0
        for participant in participants:
            success = email_service.send_session_report_email(
                to_email=participant.get("studentEmail"),
                student_name=participant.get("studentName", "Student"),
                session_title=session.get("title", "Session"),
                course_name=session.get("course", "Course"),
                session_id=session_id
            )
            if success:
                sent_count += 1
        
        # Also send to instructor
        instructor_email = user.get("email")
        if instructor_email:
            email_service.send_session_report_email(
                to_email=instructor_email,
                student_name=f"{user.get('firstName', '')} {user.get('lastName', '')}".strip(),
                session_title=session.get("title", "Session"),
                course_name=session.get("course", "Course"),
                session_id=session_id,
                is_instructor=True
            )
            sent_count += 1
        
        return {
            "success": True,
            "message": f"Report emails sent to {sent_count} recipients"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error sending report emails: {e}")
        raise HTTPException(status_code=500, detail="Failed to send report emails")


def _generate_report_html(report: dict, user_role: str) -> str:
    """Generate downloadable HTML report"""
    year = datetime.now().year
    is_instructor = user_role in ["instructor", "admin"]
    
    # Calculate additional stats for display
    students = report.get("students", [])
    
    # Build student rows for instructor view
    student_rows = ""
    if is_instructor and students:
        for student in students:
            quiz_score = student.get("quizScore")
            score_display = f"{quiz_score:.1f}%" if quiz_score is not None else "N/A"
            score_color = "color: #059669" if quiz_score and quiz_score >= 70 else "color: #dc2626" if quiz_score and quiz_score < 50 else "color: #d97706"
            
            connection = student.get("averageConnectionQuality") or "unknown"
            connection_badge = f'<span style="padding: 2px 8px; border-radius: 9999px; font-size: 12px; {"background: #dcfce7; color: #166534;" if connection in ["excellent", "good"] else "background: #fef3c7; color: #92400e;" if connection == "fair" else "background: #fee2e2; color: #991b1b;"}">{connection.title()}</span>'
            
            student_rows += f"""
            <tr>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; width: 22%; font-size: 13px;">{student.get("studentName", "Unknown")}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; width: 28%; font-size: 12px; word-break: break-all;">{student.get("studentEmail") or "N/A"}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; width: 12%; text-align: center; font-size: 13px;">{student.get("totalQuestions", 0)}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; width: 12%; text-align: center; font-size: 13px;">{student.get("correctAnswers", 0)}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; width: 12%; text-align: center; {score_color}; font-weight: 600; font-size: 13px;">{score_display}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; width: 14%; text-align: center;">{connection_badge}</td>
            </tr>
            """
    
    # For student view, show personal quiz details
    personal_quiz_details = ""
    if not is_instructor and students:
        student = students[0] if students else None
        if student:
            quiz_details = student.get("quizDetails", [])
            for idx, q in enumerate(quiz_details, 1):
                is_correct = q.get("isCorrect", False)
                result_icon = "✅" if is_correct else "❌"
                time_taken = q.get("timeTaken")
                time_display = f"{time_taken:.1f}s" if time_taken else "N/A"
                
                personal_quiz_details += f"""
                <div style="padding: 16px; background: {"#f0fdf4" if is_correct else "#fef2f2"}; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid {"#22c55e" if is_correct else "#ef4444"};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 600; color: #374151;">Question {idx}</span>
                        <span>{result_icon} {time_display}</span>
                    </div>
                    <p style="margin: 0; color: #4b5563; font-size: 14px;">{q.get("question", "")}</p>
                </div>
                """
    
    html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Session Report - {report.get("sessionTitle", "Session")}</title>
    <style>
        * {{ box-sizing: border-box; }}
        body {{ margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f8fafc; }}
        @media print {{
            body {{ margin: 0; padding: 20px; }}
            .no-print {{ display: none !important; }}
        }}
    </style>
</head>
<body>
    <div style="max-width: 800px; margin: 0 auto; padding: 30px 20px; background: #ffffff;">
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #059669;">
            <h1 style="margin: 0 0 5px 0; font-size: 24px; font-weight: bold; color: #059669;">Class Pulse</h1>
            <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: bold; color: #111827;">Session Report</h2>
            <p style="margin: 0; color: #6b7280; font-size: 12px;">Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")}</p>
        </div>
        
        <!-- Session Info Table -->
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold; color: #111827;">{report.get("sessionTitle", "Session")}</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 8px 0; width: 50%; vertical-align: top;">
                        <p style="margin: 0 0 2px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Course</p>
                        <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">{report.get("courseName", "")} ({report.get("courseCode", "")})</p>
                    </td>
                    <td style="padding: 8px 0; width: 50%; vertical-align: top;">
                        <p style="margin: 0 0 2px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Instructor</p>
                        <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">{report.get("instructorName", "")}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 8px 0; width: 50%; vertical-align: top;">
                        <p style="margin: 0 0 2px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Date</p>
                        <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">{report.get("sessionDate", "")}</p>
                    </td>
                    <td style="padding: 8px 0; width: 50%; vertical-align: top;">
                        <p style="margin: 0 0 2px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Time</p>
                        <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">{report.get("sessionTime", "")} ({report.get("sessionDuration", "")})</p>
                    </td>
                </tr>
            </table>
        </div>
        
        <!-- Statistics Table - Different for instructors vs students -->
        {"" if not is_instructor else f'''
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
                <td style="width: 25%; padding: 10px; text-align: center; background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 8px;">
                    <p style="margin: 0 0 5px 0; font-size: 28px; font-weight: bold; color: #059669;">{report.get("totalParticipants", 0)}</p>
                    <p style="margin: 0; font-size: 12px; color: #065f46;">Participants</p>
                </td>
                <td style="width: 5px;"></td>
                <td style="width: 25%; padding: 10px; text-align: center; background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px;">
                    <p style="margin: 0 0 5px 0; font-size: 28px; font-weight: bold; color: #0d9488;">{report.get("totalQuestionsAsked", 0)}</p>
                    <p style="margin: 0; font-size: 12px; color: #134e4a;">Questions Asked</p>
                </td>
                <td style="width: 5px;"></td>
                <td style="width: 25%; padding: 10px; text-align: center; background: #eef2ff; border: 1px solid #e0e7ff; border-radius: 8px;">
                    <p style="margin: 0 0 5px 0; font-size: 28px; font-weight: bold; color: #6366f1;">{"N/A" if report.get("averageQuizScore") is None else f"{report.get('averageQuizScore'):.1f}%"}</p>
                    <p style="margin: 0; font-size: 12px; color: #3730a3;">Avg. Quiz Score</p>
                </td>
                <td style="width: 5px;"></td>
                <td style="width: 25%; padding: 10px; text-align: center; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px;">
                    <p style="margin: 0 0 5px 0; font-size: 28px; font-weight: bold; color: #f59e0b;">{report.get("engagementSummary", {}).get("highly_engaged", 0)}</p>
                    <p style="margin: 0; font-size: 12px; color: #92400e;">Highly Engaged</p>
                </td>
            </tr>
        </table>
        '''}
        {"" if is_instructor else f'''
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
                <td style="width: 48%; padding: 10px; text-align: center; background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px;">
                    <p style="margin: 0 0 5px 0; font-size: 28px; font-weight: bold; color: #0d9488;">{report.get("totalQuestionsAsked", 0)}</p>
                    <p style="margin: 0; font-size: 12px; color: #134e4a;">Questions Asked</p>
                </td>
                <td style="width: 4%;"></td>
                <td style="width: 48%; padding: 10px; text-align: center; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px;">
                    <p style="margin: 0 0 5px 0; font-size: 28px; font-weight: bold; color: #f59e0b;">{report.get("engagementSummary", {}).get("highly_engaged", 0)}</p>
                    <p style="margin: 0; font-size: 12px; color: #92400e;">Highly Engaged</p>
                </td>
            </tr>
        </table>
        '''}
        
        {"" if not is_instructor else f'''
        <!-- Student Performance Table (Instructor View) -->
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
            <div style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 16px; font-weight: bold; color: #111827;">Student Performance</h3>
            </div>
            <div style="padding: 0;">
                <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                    <thead>
                        <tr style="background: #e5e7eb;">
                            <th style="padding: 8px 6px; text-align: left; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 22%;">Student</th>
                            <th style="padding: 8px 6px; text-align: left; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 28%;">Email</th>
                            <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 12%;">Questions</th>
                            <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 12%;">Correct</th>
                            <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 12%;">Score</th>
                            <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 14%;">Connection</th>
                        </tr>
                    </thead>
                    <tbody>
                        {student_rows if student_rows else '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #9ca3af;">No student data available</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
        '''}
        
        {"" if is_instructor else f'''
        <!-- Personal Quiz Results (Student View) -->
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
            <div style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 16px; font-weight: bold; color: #111827;">Your Quiz Results</h3>
            </div>
            <div style="padding: 20px;">
                {personal_quiz_details if personal_quiz_details else '<p style="text-align: center; color: #9ca3af;">No quiz data available</p>'}
            </div>
        </div>
        '''}
        
        {"" if not is_instructor else f'''
        <!-- Engagement Summary - Instructors only -->
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
            <div style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 16px; font-weight: bold; color: #111827;">Engagement Summary</h3>
            </div>
            <div style="padding: 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="width: 33%; padding: 15px; text-align: center; background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 8px;">
                            <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: bold; color: #059669;">{report.get("engagementSummary", {}).get("highly_engaged", 0)}</p>
                            <p style="margin: 0; font-size: 12px; color: #065f46;">Highly Engaged</p>
                        </td>
                        <td style="width: 5px;"></td>
                        <td style="width: 33%; padding: 15px; text-align: center; background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px;">
                            <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: bold; color: #d97706;">{report.get("engagementSummary", {}).get("moderately_engaged", 0)}</p>
                            <p style="margin: 0; font-size: 12px; color: #92400e;">Moderately Engaged</p>
                        </td>
                        <td style="width: 5px;"></td>
                        <td style="width: 33%; padding: 15px; text-align: center; background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px;">
                            <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: bold; color: #dc2626;">{report.get("engagementSummary", {}).get("at_risk", 0)}</p>
                            <p style="margin: 0; font-size: 12px; color: #991b1b;">At Risk</p>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
        '''}
        
        <!-- Footer -->
        <div style="text-align: center; padding: 24px; color: #9ca3af; font-size: 12px;">
            <p style="margin: 0;">© {year} Class Pulse. All rights reserved.</p>
            <p style="margin: 8px 0 0 0;">This report was automatically generated based on session data.</p>
        </div>
        
        <!-- Print Button (no-print) -->
        <div class="no-print" style="text-align: center; margin-top: 24px;">
            <button onclick="window.print()" style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: white; border: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;">
                Print / Save as PDF
            </button>
        </div>
        
    </div>
</body>
</html>
    """
    
    return html

