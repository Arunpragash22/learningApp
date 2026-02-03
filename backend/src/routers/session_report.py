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
    Get all reports - ONLY for Instructors.
    Instructors see reports for all their sessions with full student details.
    """
    try:
        user_role = user.get("role", "student")
        user_id = user.get("id")
        
        # ONLY INSTRUCTORS CAN ACCESS REPORTS LIST
        if user_role == "student":
            raise HTTPException(
                status_code=403, 
                detail="Only instructors can view reports"
            )
        
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
        
        # Check access permissions
        if user_role == "student":
            # Students can only view their own reports
            student_ids = [s.get("studentId") for s in report.get("students", [])]
            if user_id not in student_ids:
                raise HTTPException(status_code=403, detail="Access denied")
            # Filter to only show their data
            report["students"] = [s for s in report.get("students", []) if s.get("studentId") == user_id]
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
        
        # Get stored report from MongoDB
        report = await SessionReportModel.get_report_for_user(session_id, user_id, user_role)
        
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
        
        # Instructors can only view reports for their own sessions
        if user_role == "instructor":
            if session.get("instructorId") != user_id:
                raise HTTPException(
                    status_code=403, 
                    detail="You can only view reports for your own sessions"
                )
        
        # Get report (instructor: full; student: filtered to their data)
        report = await SessionReportModel.get_report_for_user(session_id, user_id, user_role)
        
        if not report:
            # No stored report - generate fresh report (live or preview)
            report = await SessionReportModel.generate_report(session_id, user_id, user_role)
        
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
        print(f"Error generating report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate report")


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
        report = await SessionReportModel.get_report_for_user(session_id, user_id, user_role)
        if not report:
            report = await SessionReportModel.generate_report(session_id, user_id, user_role)
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
        print(f"Error downloading report: {e}")
        raise HTTPException(status_code=500, detail="Failed to download report")


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
            
            connection = student.get("averageConnectionQuality", "unknown")
            connection_badge = f'<span style="padding: 2px 8px; border-radius: 9999px; font-size: 12px; {"background: #dcfce7; color: #166534;" if connection in ["excellent", "good"] else "background: #fef3c7; color: #92400e;" if connection == "fair" else "background: #fee2e2; color: #991b1b;"}">{connection.title()}</span>'
            
            student_rows += f"""
            <tr>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">{student.get("studentName", "Unknown")}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">{student.get("studentEmail", "N/A")}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">{student.get("totalQuestions", 0)}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">{student.get("correctAnswers", 0)}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; {score_color}; font-weight: 600;">{score_display}</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">{connection_badge}</td>
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
        @media print {{
            body {{ margin: 0; padding: 20px; }}
            .no-print {{ display: none !important; }}
        }}
    </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; -webkit-font-smoothing: antialiased;">
    <div style="max-width: 900px; margin: 0 auto; padding: 40px 20px;">
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
            <div style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #0d9488 100%); padding: 12px 24px; border-radius: 50px; margin-bottom: 16px;">
                <span style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">Class Pulse</span>
            </div>
            <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: #111827;">Session Report</h1>
            <p style="margin: 0; color: #6b7280; font-size: 14px;">Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")}</p>
        </div>
        
        <!-- Session Info Card -->
        <div style="background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); overflow: hidden; margin-bottom: 24px;">
            <div style="height: 4px; background: linear-gradient(90deg, #059669 0%, #0d9488 50%, #06b6d4 100%);"></div>
            <div style="padding: 24px;">
                <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #111827;">{report.get("sessionTitle", "Session")}</h2>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
                    <div>
                        <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Course</p>
                        <p style="margin: 0; font-size: 15px; color: #374151; font-weight: 500;">{report.get("courseName", "")} ({report.get("courseCode", "")})</p>
                    </div>
                    <div>
                        <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Instructor</p>
                        <p style="margin: 0; font-size: 15px; color: #374151; font-weight: 500;">{report.get("instructorName", "")}</p>
                    </div>
                    <div>
                        <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Date</p>
                        <p style="margin: 0; font-size: 15px; color: #374151; font-weight: 500;">{report.get("sessionDate", "")}</p>
                    </div>
                    <div>
                        <p style="margin: 0 0 4px 0; font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">Time</p>
                        <p style="margin: 0; font-size: 15px; color: #374151; font-weight: 500;">{report.get("sessionTime", "")} ({report.get("sessionDuration", "")})</p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Statistics Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
            <div style="background: #ffffff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); text-align: center;">
                <p style="margin: 0 0 8px 0; font-size: 32px; font-weight: 700; color: #059669;">{report.get("totalParticipants", 0)}</p>
                <p style="margin: 0; font-size: 13px; color: #6b7280;">Participants</p>
            </div>
            <div style="background: #ffffff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); text-align: center;">
                <p style="margin: 0 0 8px 0; font-size: 32px; font-weight: 700; color: #0d9488;">{report.get("totalQuestionsAsked", 0)}</p>
                <p style="margin: 0; font-size: 13px; color: #6b7280;">Questions Asked</p>
            </div>
            <div style="background: #ffffff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); text-align: center;">
                <p style="margin: 0 0 8px 0; font-size: 32px; font-weight: 700; color: #6366f1;">{report.get("averageQuizScore", "N/A") if report.get("averageQuizScore") is None else f"{report.get('averageQuizScore'):.1f}%"}</p>
                <p style="margin: 0; font-size: 13px; color: #6b7280;">Avg. Quiz Score</p>
            </div>
            <div style="background: #ffffff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); text-align: center;">
                <p style="margin: 0 0 8px 0; font-size: 32px; font-weight: 700; color: #f59e0b;">{report.get("engagementSummary", {}).get("highly_engaged", 0)}</p>
                <p style="margin: 0; font-size: 13px; color: #6b7280;">Highly Engaged</p>
            </div>
        </div>
        
        {"" if not is_instructor else f'''
        <!-- Student Performance Table (Instructor View) -->
        <div style="background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); overflow: hidden; margin-bottom: 24px;">
            <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Student Performance</h3>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f9fafb;">
                            <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Student</th>
                            <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Email</th>
                            <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Questions</th>
                            <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Correct</th>
                            <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Score</th>
                            <th style="padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Connection</th>
                        </tr>
                    </thead>
                    <tbody>
                        {student_rows if student_rows else '<tr><td colspan="6" style="padding: 24px; text-align: center; color: #9ca3af;">No student data available</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
        '''}
        
        {"" if is_instructor else f'''
        <!-- Personal Quiz Results (Student View) -->
        <div style="background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); overflow: hidden; margin-bottom: 24px;">
            <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Your Quiz Results</h3>
            </div>
            <div style="padding: 24px;">
                {personal_quiz_details if personal_quiz_details else '<p style="text-align: center; color: #9ca3af;">No quiz data available</p>'}
            </div>
        </div>
        '''}
        
        <!-- Engagement Summary -->
        <div style="background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); overflow: hidden; margin-bottom: 24px;">
            <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Engagement Summary</h3>
            </div>
            <div style="padding: 24px;">
                <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 150px; padding: 16px; background: #ecfdf5; border-radius: 8px; text-align: center;">
                        <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: 700; color: #059669;">{report.get("engagementSummary", {}).get("highly_engaged", 0)}</p>
                        <p style="margin: 0; font-size: 13px; color: #065f46;">Highly Engaged</p>
                    </div>
                    <div style="flex: 1; min-width: 150px; padding: 16px; background: #fef3c7; border-radius: 8px; text-align: center;">
                        <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: 700; color: #d97706;">{report.get("engagementSummary", {}).get("moderately_engaged", 0)}</p>
                        <p style="margin: 0; font-size: 13px; color: #92400e;">Moderately Engaged</p>
                    </div>
                    <div style="flex: 1; min-width: 150px; padding: 16px; background: #fee2e2; border-radius: 8px; text-align: center;">
                        <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: 700; color: #dc2626;">{report.get("engagementSummary", {}).get("at_risk", 0)}</p>
                        <p style="margin: 0; font-size: 13px; color: #991b1b;">At Risk</p>
                    </div>
                </div>
            </div>
        </div>
        
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

