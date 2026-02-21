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


async def _resolve_session(session_id: str):
    """Resolve a session_id that may be a MongoDB ObjectId or a Zoom meeting ID."""
    # Try MongoDB ObjectId first
    try:
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if session:
            return session, str(session["_id"])
    except Exception:
        pass

    # Fallback: lookup by zoomMeetingId (stored as int or string)
    session = await db.database.sessions.find_one({"zoomMeetingId": session_id})
    if not session:
        try:
            session = await db.database.sessions.find_one({"zoomMeetingId": int(session_id)})
        except (ValueError, TypeError):
            pass
    if not session:
        session = await db.database.sessions.find_one({"zoomMeetingId": str(session_id)})

    if session:
        return session, str(session["_id"])
    return None, None


@router.get("/resolve/{session_id}")
async def resolve_session_id(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """Resolve a Zoom meeting ID or MongoDB ObjectId to the canonical MongoDB session ID."""
    session, resolved_id = await _resolve_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"sessionId": resolved_id, "title": session.get("title", "")}


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
    Accepts MongoDB ObjectId or Zoom meeting ID.
    """
    try:
        session, resolved_id = await _resolve_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session_id = resolved_id
        
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
    Accepts MongoDB ObjectId or Zoom meeting ID.
    """
    try:
        user_role = user.get("role", "student")
        user_id = user.get("id")
        user_email = user.get("email", "")
        
        session, resolved_id = await _resolve_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session_id = resolved_id
        
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
        session, resolved_id = await _resolve_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session_id = resolved_id
        
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


def _build_performance_graphs_html(quiz_details: list) -> str:
    """Build inline SVG performance trend graphs for the PDF report."""
    if not quiz_details or len(quiz_details) < 1:
        return ""

    n = len(quiz_details)
    chart_w = 200
    chart_h = 120
    pad_l, pad_r, pad_t, pad_b = 35, 10, 10, 25
    plot_w = chart_w - pad_l - pad_r
    plot_h = chart_h - pad_t - pad_b

    # ── 1. Accuracy Over Time (line chart) ────────────────────────
    acc_values = [q.get("runningAccuracy", 0) for q in quiz_details]
    acc_points = []
    for i, v in enumerate(acc_values):
        x = pad_l + (i / max(n - 1, 1)) * plot_w if n > 1 else pad_l + plot_w / 2
        y = pad_t + plot_h - (v / 100) * plot_h
        acc_points.append((x, y))

    acc_line = " ".join(f"{x:.1f},{y:.1f}" for x, y in acc_points)
    acc_dots = "".join(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#6366f1"/>' for x, y in acc_points
    )
    # Y-axis labels and grid
    acc_y_labels = ""
    for pct in [0, 25, 50, 75, 100]:
        y = pad_t + plot_h - (pct / 100) * plot_h
        acc_y_labels += f'<text x="{pad_l - 3}" y="{y + 3}" text-anchor="end" font-size="7" fill="#9ca3af">{pct}%</text>'
        acc_y_labels += f'<line x1="{pad_l}" y1="{y}" x2="{chart_w - pad_r}" y2="{y}" stroke="#f0f0f0" stroke-width="0.5"/>'
    # 75% reference line
    ref_y = pad_t + plot_h - 0.75 * plot_h
    acc_ref = f'<line x1="{pad_l}" y1="{ref_y}" x2="{chart_w - pad_r}" y2="{ref_y}" stroke="#22c55e" stroke-width="0.7" stroke-dasharray="3,3"/>'
    # X-axis labels
    acc_x_labels = ""
    for i in range(n):
        x = pad_l + (i / max(n - 1, 1)) * plot_w if n > 1 else pad_l + plot_w / 2
        acc_x_labels += f'<text x="{x}" y="{chart_h - 5}" text-anchor="middle" font-size="7" fill="#9ca3af">Q{i+1}</text>'

    accuracy_svg = f'''<svg viewBox="0 0 {chart_w} {chart_h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
        {acc_y_labels}{acc_ref}{acc_x_labels}
        <polyline points="{acc_line}" fill="none" stroke="#6366f1" stroke-width="2" stroke-linejoin="round"/>
        {acc_dots}
    </svg>'''

    # ── 2. Response Time (bar chart) ──────────────────────────────
    rt_values = [round(q.get("timeTaken", 0) or 0, 1) for q in quiz_details]
    max_rt = max(rt_values) if rt_values else 1
    if max_rt == 0:
        max_rt = 1
    bar_w = plot_w / max(n, 1) * 0.6
    bar_gap = plot_w / max(n, 1)

    rt_bars = ""
    rt_x_labels = ""
    for i, v in enumerate(rt_values):
        x = pad_l + i * bar_gap + (bar_gap - bar_w) / 2
        h = (v / max_rt) * plot_h
        y = pad_t + plot_h - h
        rt_bars += f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{h:.1f}" rx="2" fill="#8b5cf6"/>'
        lx = pad_l + i * bar_gap + bar_gap / 2
        rt_x_labels += f'<text x="{lx:.1f}" y="{chart_h - 5}" text-anchor="middle" font-size="7" fill="#9ca3af">Q{i+1}</text>'

    # Y-axis for response time
    rt_y_labels = ""
    for frac in [0, 0.25, 0.5, 0.75, 1.0]:
        val = max_rt * frac
        y = pad_t + plot_h - frac * plot_h
        label = f"{val:.0f}s" if val == int(val) else f"{val:.1f}s"
        rt_y_labels += f'<text x="{pad_l - 3}" y="{y + 3}" text-anchor="end" font-size="7" fill="#9ca3af">{label}</text>'
        rt_y_labels += f'<line x1="{pad_l}" y1="{y}" x2="{chart_w - pad_r}" y2="{y}" stroke="#f0f0f0" stroke-width="0.5"/>'

    response_svg = f'''<svg viewBox="0 0 {chart_w} {chart_h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
        {rt_y_labels}{rt_x_labels}{rt_bars}
    </svg>'''

    # ── 3. Cluster Level (step chart) ─────────────────────────────
    CLUSTER_NUM = {"passive": 1, "moderate": 2, "active": 3}
    CLUSTER_COLOR = {"passive": "#ef4444", "moderate": "#f59e0b", "active": "#22c55e"}
    cluster_values = [CLUSTER_NUM.get((q.get("clusterAtAnswer") or "moderate").lower(), 2) for q in quiz_details]

    # Build step-after path
    cl_points = []
    for i, v in enumerate(cluster_values):
        x = pad_l + (i / max(n - 1, 1)) * plot_w if n > 1 else pad_l + plot_w / 2
        y = pad_t + plot_h - ((v - 0.5) / 3) * plot_h
        if i > 0 and n > 1:
            cl_points.append((x, cl_points[-1][1]))
        cl_points.append((x, y))

    cl_line = " ".join(f"{x:.1f},{y:.1f}" for x, y in cl_points)
    # Fill area
    if cl_points:
        base_y = pad_t + plot_h
        fill_pts = f"{cl_points[0][0]:.1f},{base_y:.1f} " + cl_line + f" {cl_points[-1][0]:.1f},{base_y:.1f}"
    else:
        fill_pts = ""

    cl_y_labels = ""
    for label, num in [("Passive", 1), ("Moderate", 2), ("Active", 3)]:
        y = pad_t + plot_h - ((num - 0.5) / 3) * plot_h
        cl_y_labels += f'<text x="{pad_l - 3}" y="{y + 3}" text-anchor="end" font-size="7" fill="#9ca3af">{label}</text>'
        cl_y_labels += f'<line x1="{pad_l}" y1="{y}" x2="{chart_w - pad_r}" y2="{y}" stroke="#f0f0f0" stroke-width="0.5"/>'

    cl_x_labels = ""
    for i in range(n):
        x = pad_l + (i / max(n - 1, 1)) * plot_w if n > 1 else pad_l + plot_w / 2
        cl_x_labels += f'<text x="{x}" y="{chart_h - 5}" text-anchor="middle" font-size="7" fill="#9ca3af">Q{i+1}</text>'

    cluster_svg = f'''<svg viewBox="0 0 {chart_w} {chart_h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
        {cl_y_labels}{cl_x_labels}
        <polygon points="{fill_pts}" fill="#d1fae5" opacity="0.6"/>
        <polyline points="{cl_line}" fill="none" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/>
    </svg>'''

    return f'''
    <div style="margin-bottom: 20px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: bold; color: #111827;">Performance Trends</h3>
        <table style="width: 100%; border-collapse: separate; border-spacing: 8px 0;">
            <tr>
                <td style="width: 33%; vertical-align: top; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #374151;">Accuracy Over Time</p>
                    {accuracy_svg}
                </td>
                <td style="width: 33%; vertical-align: top; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #374151;">Response Time</p>
                    {response_svg}
                </td>
                <td style="width: 33%; vertical-align: top; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 600; color: #374151;">Cluster Level</p>
                    {cluster_svg}
                </td>
            </tr>
        </table>
    </div>
    '''


def _generate_report_html(report: dict, user_role: str) -> str:
    """Generate downloadable HTML report — different content for student vs instructor."""
    year = datetime.now().year
    is_instructor = user_role in ["instructor", "admin"]
    students = report.get("students", [])

    # ── Instructor view: build student rows ──
    student_rows = ""
    if is_instructor and students:
        for idx, student in enumerate(students, 1):
            quiz_score = student.get("quizScore")
            score_display = f"{quiz_score:.1f}%" if quiz_score is not None else "N/A"
            score_color = "#059669" if quiz_score and quiz_score >= 70 else "#dc2626" if quiz_score and quiz_score < 50 else "#d97706"

            engagement = student.get("engagementLevel", "moderate")
            eng_bg = "#dcfce7" if engagement == "active" else "#fef3c7" if engagement == "moderate" else "#fee2e2"
            eng_color = "#166534" if engagement == "active" else "#92400e" if engagement == "moderate" else "#991b1b"
            eng_label = engagement.title() if engagement else "Moderate"

            connection = student.get("averageConnectionQuality") or "unknown"
            conn_bg = "#dcfce7" if connection in ["excellent", "good"] else "#fef3c7" if connection == "fair" else "#fee2e2"
            conn_color = "#166534" if connection in ["excellent", "good"] else "#92400e" if connection == "fair" else "#991b1b"

            student_rows += f"""
            <tr>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">{idx}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; font-size: 13px; font-weight: 500;">{student.get("studentName", "Unknown")}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; font-size: 12px; word-break: break-all; color: #6b7280;">{student.get("studentEmail") or "N/A"}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px;">{student.get("totalQuestions", 0)}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 13px;">{student.get("correctAnswers", 0)} / {student.get("incorrectAnswers", 0)}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: center; color: {score_color}; font-weight: 600; font-size: 13px;">{score_display}</td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                    <span style="padding: 2px 8px; border-radius: 9999px; font-size: 11px; background: {eng_bg}; color: {eng_color};">{eng_label}</span>
                </td>
                <td style="padding: 8px 6px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                    <span style="padding: 2px 8px; border-radius: 9999px; font-size: 11px; background: {conn_bg}; color: {conn_color};">{connection.title()}</span>
                </td>
            </tr>
            """

    # ── Student view: personal summary + enriched quiz details ──
    student_personal_section = ""
    if not is_instructor and students:
        s = students[0]
        quiz_score = s.get("quizScore")
        score_display = f"{quiz_score:.1f}%" if quiz_score is not None else "N/A"
        score_color = "#059669" if quiz_score and quiz_score >= 70 else "#dc2626" if quiz_score and quiz_score < 50 else "#d97706"
        avg_time = s.get("averageResponseTime")
        avg_time_display = f"{avg_time:.1f}s" if avg_time else "N/A"

        student_personal_section += f"""
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold; color: #111827;">Your Performance Summary</h3>
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #374151;"><strong>{s.get("studentName", "Student")}</strong> &mdash; {s.get("studentEmail") or ""}</p>
            <table style="width: 100%; border-collapse: separate; border-spacing: 6px 0;">
                <tr>
                    <td style="width: 25%; padding: 12px; text-align: center; background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 8px;">
                        <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: bold; color: {score_color};">{score_display}</p>
                        <p style="margin: 0; font-size: 11px; color: #065f46;">Quiz Score</p>
                    </td>
                    <td style="width: 25%; padding: 12px; text-align: center; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 8px;">
                        <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: bold; color: #2563eb;">{s.get("correctAnswers", 0)}</p>
                        <p style="margin: 0; font-size: 11px; color: #1e40af;">Correct</p>
                    </td>
                    <td style="width: 25%; padding: 12px; text-align: center; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                        <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: bold; color: #dc2626;">{s.get("incorrectAnswers", 0)}</p>
                        <p style="margin: 0; font-size: 11px; color: #991b1b;">Incorrect</p>
                    </td>
                    <td style="width: 25%; padding: 12px; text-align: center; background: #f5f3ff; border: 1px solid #ede9fe; border-radius: 8px;">
                        <p style="margin: 0 0 4px 0; font-size: 24px; font-weight: bold; color: #7c3aed;">{avg_time_display}</p>
                        <p style="margin: 0; font-size: 11px; color: #5b21b6;">Avg. Time</p>
                    </td>
                </tr>
            </table>
        </div>
        """

        quiz_details = s.get("quizDetails", [])
        if quiz_details:
            student_personal_section += _build_performance_graphs_html(quiz_details)

            student_personal_section += """
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
                <div style="padding: 15px 20px; border-bottom: 1px solid #e5e7eb;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: bold; color: #111827;">Question-by-Question Results</h3>
                </div>
                <div style="padding: 16px;">
            """
            for idx, q in enumerate(quiz_details, 1):
                is_correct = q.get("isCorrect", False)
                result_color = "#059669" if is_correct else "#dc2626"
                bg = "#f0fdf4" if is_correct else "#fef2f2"
                border_color = "#22c55e" if is_correct else "#ef4444"
                time_taken = q.get("timeTaken")
                time_display = f"{time_taken:.1f}s" if time_taken else "N/A"
                running_acc = q.get("runningAccuracy", "N/A")
                running_acc_display = f"{running_acc}%" if isinstance(running_acc, (int, float)) else "N/A"
                cluster_at = q.get("clusterAtAnswer", "")
                cluster_bg = "#dcfce7" if cluster_at == "active" else "#fef3c7" if cluster_at == "moderate" else "#fee2e2" if cluster_at == "passive" else "#f3f4f6"
                cluster_color = "#166534" if cluster_at == "active" else "#92400e" if cluster_at == "moderate" else "#991b1b" if cluster_at == "passive" else "#6b7280"

                # Build options display
                options = q.get("options", [])
                correct_idx = q.get("correctAnswer", -1)
                student_idx = q.get("studentAnswer")
                options_html = ""
                for oi, opt in enumerate(options):
                    is_student_pick = (student_idx is not None and oi == student_idx)
                    is_correct_opt = (oi == correct_idx)
                    opt_bg = ""
                    opt_border = ""
                    opt_icon = ""
                    if is_student_pick and is_correct_opt:
                        opt_bg = "background: #dcfce7;"
                        opt_border = "border: 1px solid #86efac;"
                        opt_icon = "&#10004; "
                    elif is_student_pick:
                        opt_bg = "background: #fee2e2;"
                        opt_border = "border: 1px solid #fca5a5;"
                        opt_icon = "&#10008; "
                    elif is_correct_opt:
                        opt_bg = "background: #dcfce7;"
                        opt_border = "border: 1px solid #86efac;"
                        opt_icon = "&#10004; "
                    else:
                        opt_bg = "background: #f9fafb;"
                        opt_border = "border: 1px solid #e5e7eb;"

                    label = chr(65 + oi)  # A, B, C, D
                    options_html += f"""
                        <div style="padding: 6px 10px; margin-bottom: 4px; border-radius: 6px; font-size: 12px; {opt_bg} {opt_border}">
                            <span style="font-weight: 600; color: #374151;">{label}.</span>
                            <span style="color: #374151;">{opt_icon}{opt}</span>
                            {"<span style='float:right; font-size:11px; color:#059669; font-weight:600;'>Correct Answer</span>" if is_correct_opt and not is_student_pick else ""}
                            {"<span style='float:right; font-size:11px; color:#059669; font-weight:600;'>Your Answer (Correct!)</span>" if is_student_pick and is_correct_opt else ""}
                            {"<span style='float:right; font-size:11px; color:#dc2626; font-weight:600;'>Your Answer</span>" if is_student_pick and not is_correct_opt else ""}
                        </div>
                    """

                student_personal_section += f"""
                    <div style="padding: 14px; background: {bg}; border-radius: 8px; margin-bottom: 14px; border-left: 4px solid {border_color};">
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                            <tr>
                                <td style="vertical-align: top;">
                                    <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #111827;">Q{idx}. {q.get("question", "")}</p>
                                </td>
                                <td style="width: 100px; text-align: right; vertical-align: top;">
                                    <span style="color: {result_color}; font-weight: bold; font-size: 13px;">{"Correct" if is_correct else "Incorrect"}</span>
                                </td>
                            </tr>
                        </table>
                        {options_html}
                        <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
                            <tr>
                                <td style="font-size: 11px; color: #6b7280;">Time: <strong>{time_display}</strong></td>
                                <td style="font-size: 11px; color: #6b7280; text-align: center;">Accuracy after Q{idx}: <strong style="color: {"#059669" if isinstance(running_acc, (int, float)) and running_acc >= 60 else "#dc2626"}">{running_acc_display}</strong></td>
                                <td style="font-size: 11px; text-align: right;">{"<span style=" + repr("padding:2px 8px;border-radius:9999px;font-size:10px;background:" + cluster_bg + ";color:" + cluster_color + ";") + ">" + cluster_at.title() + "</span>" if cluster_at else ""}</td>
                            </tr>
                        </table>
                    </div>
                """
            student_personal_section += """
                </div>
            </div>
            """
        else:
            student_personal_section += """
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 30px; margin-bottom: 20px; text-align: center;">
                <p style="color: #9ca3af; font-size: 14px; margin: 0;">No quiz questions were answered during this session.</p>
            </div>
            """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Session Report - {report.get("sessionTitle", "Session")}</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{ font-family: Arial, Helvetica, sans-serif; background: #ffffff; color: #111827; }}
        @media print {{
            body {{ padding: 10px; }}
            .no-print {{ display: none !important; }}
        }}
    </style>
</head>
<body>
    <div style="max-width: 800px; margin: 0 auto; padding: 30px 20px;">

        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #059669;">
            <h1 style="margin: 0 0 5px 0; font-size: 24px; font-weight: bold; color: #059669;">Class Pulse</h1>
            <h2 style="margin: 0 0 5px 0; font-size: 18px; font-weight: bold; color: #111827;">{"Instructor Session Report" if is_instructor else "Student Session Report"}</h2>
            <p style="margin: 0; color: #6b7280; font-size: 12px;">Generated on {datetime.now().strftime("%B %d, %Y at %I:%M %p")}</p>
        </div>

        <!-- Session Info -->
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: bold; color: #111827;">{report.get("sessionTitle", "Session")}</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 6px 0; width: 50%; vertical-align: top;">
                        <p style="margin: 0 0 2px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Course</p>
                        <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">{report.get("courseName", "")} ({report.get("courseCode", "")})</p>
                    </td>
                    <td style="padding: 6px 0; width: 50%; vertical-align: top;">
                        <p style="margin: 0 0 2px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Instructor</p>
                        <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">{report.get("instructorName", "")}</p>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; width: 50%; vertical-align: top;">
                        <p style="margin: 0 0 2px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Date</p>
                        <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">{report.get("sessionDate", "")}</p>
                    </td>
                    <td style="padding: 6px 0; width: 50%; vertical-align: top;">
                        <p style="margin: 0 0 2px 0; font-size: 11px; color: #9ca3af; text-transform: uppercase;">Time &amp; Duration</p>
                        <p style="margin: 0; font-size: 14px; color: #374151; font-weight: 500;">{report.get("sessionTime", "")} ({report.get("sessionDuration", "")})</p>
                    </td>
                </tr>
            </table>
        </div>

        {"" if not is_instructor else f'''
        <!-- Instructor Stats -->
        <table style="width: 100%; border-collapse: separate; border-spacing: 6px 0; margin-bottom: 20px;">
            <tr>
                <td style="width: 25%; padding: 10px; text-align: center; background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 8px;">
                    <p style="margin: 0 0 4px 0; font-size: 26px; font-weight: bold; color: #059669;">{report.get("totalParticipants", 0)}</p>
                    <p style="margin: 0; font-size: 11px; color: #065f46;">Participants</p>
                </td>
                <td style="width: 25%; padding: 10px; text-align: center; background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px;">
                    <p style="margin: 0 0 4px 0; font-size: 26px; font-weight: bold; color: #0d9488;">{report.get("totalQuestionsAsked", 0)}</p>
                    <p style="margin: 0; font-size: 11px; color: #134e4a;">Questions</p>
                </td>
                <td style="width: 25%; padding: 10px; text-align: center; background: #eef2ff; border: 1px solid #e0e7ff; border-radius: 8px;">
                    <p style="margin: 0 0 4px 0; font-size: 26px; font-weight: bold; color: #6366f1;">{"N/A" if report.get("averageQuizScore") is None else f"{report.get('averageQuizScore'):.1f}%"}</p>
                    <p style="margin: 0; font-size: 11px; color: #3730a3;">Avg Score</p>
                </td>
                <td style="width: 25%; padding: 10px; text-align: center; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px;">
                    <p style="margin: 0 0 4px 0; font-size: 26px; font-weight: bold; color: #f59e0b;">{report.get("engagementSummary", dict()).get("highly_engaged", 0)}</p>
                    <p style="margin: 0; font-size: 11px; color: #92400e;">Active</p>
                </td>
            </tr>
        </table>

        <!-- Student Performance Table -->
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
            <div style="padding: 12px 20px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 15px; font-weight: bold; color: #111827;">Student Performance ({len(students)} students)</h3>
            </div>
            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                <thead>
                    <tr style="background: #e5e7eb;">
                        <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 5%;">#</th>
                        <th style="padding: 8px 6px; text-align: left; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 18%;">Name</th>
                        <th style="padding: 8px 6px; text-align: left; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 22%;">Email</th>
                        <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 9%;">Qs</th>
                        <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 12%;">C / W</th>
                        <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 10%;">Score</th>
                        <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 12%;">Engage</th>
                        <th style="padding: 8px 6px; text-align: center; font-size: 10px; font-weight: bold; color: #374151; text-transform: uppercase; width: 12%;">Network</th>
                    </tr>
                </thead>
                <tbody>
                    {student_rows if student_rows else '<tr><td colspan="8" style="padding: 20px; text-align: center; color: #9ca3af;">No student data available</td></tr>'}
                </tbody>
            </table>
        </div>

        <!-- Engagement Summary -->
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px;">
            <div style="padding: 12px 20px; border-bottom: 1px solid #e5e7eb;">
                <h3 style="margin: 0; font-size: 15px; font-weight: bold; color: #111827;">Engagement Summary</h3>
            </div>
            <div style="padding: 16px;">
                <table style="width: 100%; border-collapse: separate; border-spacing: 6px 0;">
                    <tr>
                        <td style="width: 33%; padding: 14px; text-align: center; background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 8px;">
                            <p style="margin: 0 0 4px 0; font-size: 22px; font-weight: bold; color: #059669;">{report.get("engagementSummary", dict()).get("highly_engaged", 0)}</p>
                            <p style="margin: 0; font-size: 12px; color: #065f46;">Active</p>
                        </td>
                        <td style="width: 33%; padding: 14px; text-align: center; background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px;">
                            <p style="margin: 0 0 4px 0; font-size: 22px; font-weight: bold; color: #d97706;">{report.get("engagementSummary", dict()).get("moderately_engaged", 0)}</p>
                            <p style="margin: 0; font-size: 12px; color: #92400e;">Moderate</p>
                        </td>
                        <td style="width: 33%; padding: 14px; text-align: center; background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px;">
                            <p style="margin: 0 0 4px 0; font-size: 22px; font-weight: bold; color: #dc2626;">{report.get("engagementSummary", dict()).get("at_risk", 0)}</p>
                            <p style="margin: 0; font-size: 12px; color: #991b1b;">Passive</p>
                        </td>
                    </tr>
                </table>
            </div>
        </div>
        '''}

        {student_personal_section}

        <!-- Footer -->
        <div style="text-align: center; padding: 20px 0; color: #9ca3af; font-size: 11px; border-top: 1px solid #e5e7eb; margin-top: 10px;">
            <p style="margin: 0;">&copy; {year} Class Pulse. All rights reserved.</p>
            <p style="margin: 4px 0 0 0;">This report was automatically generated based on session data.</p>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 20px;">
            <button onclick="window.print()" style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: white; border: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;">
                Print / Save as PDF
            </button>
        </div>

    </div>
</body>
</html>"""

    return html

