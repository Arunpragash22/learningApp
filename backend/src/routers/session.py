# src/routers/session.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from bson import ObjectId
from datetime import datetime

from src.database.connection import db
from src.middleware.auth import get_current_user, require_instructor
from src.services.zoom_service import create_zoom_meeting, list_zoom_meetings, get_zoom_meeting, ZoomServiceError
from src.models.course import CourseModel
from src.models.session_report_model import SessionReportModel
from src.services.email_service import email_service
from src.services.ws_manager import ws_manager
from src.services.quiz_scheduler import quiz_scheduler

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


class SessionCreate(BaseModel):
    title: str
    course: str  # Course name for display
    courseCode: str
    courseId: Optional[str] = None  # Link to Course document for access control
    date: str          # "2025-11-25"
    time: str          # "10:00 AM - 11:00 AM" or "10:00"
    startTime: Optional[str] = None  # Start time in HH:MM format
    endTime: Optional[str] = None    # End time in HH:MM format
    durationMinutes: int
    timezone: str = "Asia/Colombo"
    description: Optional[str] = None
    materials: Optional[List[str]] = []
    isStandalone: Optional[bool] = False  # True for standalone sessions
    enrollmentKey: Optional[str] = None  # Enrollment key for standalone sessions


class SessionOut(BaseModel):
    id: str
    title: str
    course: str
    courseCode: str
    courseId: Optional[str] = None  # Link to Course document
    instructor: str
    instructorId: Optional[str] = None  # Link to instructor user
    date: str
    time: str
    startTime: Optional[str] = None  # Start time in HH:MM format
    endTime: Optional[str] = None    # End time in HH:MM format
    duration: str
    status: str
    participants: Optional[int] = 0
    expectedParticipants: Optional[int] = 0
    engagement: Optional[int] = 0
    recordingAvailable: Optional[bool] = False
    zoomMeetingId: Optional[str] = None
    join_url: Optional[str] = None
    start_url: Optional[str] = None
    isStandalone: Optional[bool] = False
    enrollmentKey: Optional[str] = None
    description: Optional[str] = None
    materials: Optional[List[str]] = []


def _session_doc_to_out(doc, include_urls: bool = True) -> SessionOut:
    return SessionOut(
        id=str(doc["_id"]),
        title=doc["title"],
        course=doc["course"],
        courseCode=doc["courseCode"],
        courseId=doc.get("courseId"),
        instructor=doc["instructor"],
        instructorId=doc.get("instructorId"),
        date=doc["date"],
        time=doc["time"],
        startTime=doc.get("startTime"),
        endTime=doc.get("endTime"),
        duration=doc["duration"],
        status=doc.get("status", "upcoming"),
        participants=doc.get("participants", 0),
        expectedParticipants=doc.get("expectedParticipants", 0),
        engagement=doc.get("engagement", 0),
        recordingAvailable=doc.get("recordingAvailable", False),
        zoomMeetingId=str(doc.get("zoomMeetingId")) if doc.get("zoomMeetingId") else None,
        join_url=doc.get("join_url") if include_urls else None,
        start_url=doc.get("start_url") if include_urls else None,
        isStandalone=doc.get("isStandalone", False),
        enrollmentKey=doc.get("enrollmentKey"),
        description=doc.get("description"),
        materials=doc.get("materials", []),
    )


@router.post("", response_model=SessionOut)
async def create_session(
    payload: SessionCreate,
    user: dict = Depends(require_instructor),
):
    """
    Create session + Zoom meeting.
    Sessions are linked to courses. Only enrolled students can see the join URL.
    """
    try:
        # Verify course belongs to this instructor if courseId is provided
        if payload.courseId:
            course = await CourseModel.find_by_id(payload.courseId)
            if not course:
                raise HTTPException(status_code=404, detail="Course not found")
            if course["instructorId"] != user["id"]:
                raise HTTPException(status_code=403, detail="You can only create sessions for your own courses")

        # 1) parse date+time into ISO for Zoom
        # simple version: just use today's date/time string if parsing fails
        try:
            # Expect "HH:MM" 24h time
            dt = datetime.fromisoformat(f"{payload.date}T{payload.time}")
        except Exception:
            # fallback = now + 10 minutes
            dt = datetime.utcnow()

        zoom_time_iso = dt.isoformat(timespec="seconds")

        zoom = await create_zoom_meeting(
            topic=payload.title,
            start_time_iso=zoom_time_iso,
            duration_minutes=payload.durationMinutes,
            timezone=payload.timezone,
        )

        doc = {
            "title": payload.title,
            "course": payload.course,
            "courseCode": payload.courseCode,
            "courseId": payload.courseId,  # Link to Course for access control
            "instructor": f"{user.get('firstName', '')} {user.get('lastName', '')}".strip()
                          or user.get("email", "Unknown Instructor"),
            "instructorId": user["id"],  # Link to instructor user
            "date": payload.date,
            "time": payload.time,
            "startTime": payload.startTime,
            "endTime": payload.endTime,
            "duration": f"{payload.durationMinutes} minutes",
            "description": payload.description,
            "materials": payload.materials or [],
            "status": "upcoming",
            "participants": 0,
            "expectedParticipants": 0,
            "engagement": 0,
            "recordingAvailable": False,
            "zoomMeetingId": str(zoom["meeting_id"]),
            "join_url": zoom["join_url"],
            "start_url": zoom["start_url"],
            "isStandalone": payload.isStandalone,  # Standalone session flag
            "enrollmentKey": payload.enrollmentKey,  # Enrollment key for standalone sessions
            "enrolledStudents": [],  # List of student IDs enrolled in this standalone session
            "createdAt": datetime.utcnow(),
        }

        result = await db.database.sessions.insert_one(doc)
        saved = await db.database.sessions.find_one({"_id": result.inserted_id})
        return _session_doc_to_out(saved)

    except ZoomServiceError as ze:
        raise HTTPException(status_code=400, detail=str(ze))
    except HTTPException:
        raise
    except Exception as e:
        print("Error creating session:", e)
        raise HTTPException(status_code=500, detail="Failed to create session")


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    course: Optional[str] = None
    courseCode: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    durationMinutes: Optional[int] = None
    description: Optional[str] = None
    materials: Optional[List[str]] = None


@router.put("/{session_id}", response_model=SessionOut)
async def update_session(
    session_id: str,
    payload: SessionUpdate,
    user: dict = Depends(require_instructor),
):
    """
    Update an existing session.
    Only the instructor who created the session can update it.
    """
    try:
        # Find the session
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Verify ownership
        if session.get("instructorId") != user["id"]:
            raise HTTPException(status_code=403, detail="You can only edit your own sessions")
        
        # Prepare update data
        update_data = {}
        if payload.title is not None:
            update_data["title"] = payload.title
        if payload.course is not None:
            update_data["course"] = payload.course
        if payload.courseCode is not None:
            update_data["courseCode"] = payload.courseCode
        if payload.date is not None:
            update_data["date"] = payload.date
        if payload.time is not None:
            update_data["time"] = payload.time
        if payload.startTime is not None:
            update_data["startTime"] = payload.startTime
        if payload.endTime is not None:
            update_data["endTime"] = payload.endTime
        if payload.durationMinutes is not None:
            update_data["duration"] = f"{payload.durationMinutes} minutes"
        if payload.description is not None:
            update_data["description"] = payload.description
        if payload.materials is not None:
            update_data["materials"] = payload.materials
        
        update_data["updatedAt"] = datetime.utcnow()
        
        # Update the session
        await db.database.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": update_data}
        )
        
        # Fetch and return updated session
        updated_session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        return _session_doc_to_out(updated_session)
        
    except HTTPException:
        raise
    except Exception as e:
        print("Error updating session:", e)
        raise HTTPException(status_code=500, detail="Failed to update session")


class EnrollmentRequest(BaseModel):
    enrollmentKey: str


@router.post("/enroll-by-key")
async def enroll_by_key(
    request: EnrollmentRequest,
    user: dict = Depends(get_current_user),
):
    """
    Enroll a student in a standalone session using an enrollment key.
    Returns session details after successful enrollment.
    """
    try:
        # Find session with matching enrollment key
        session = await db.database.sessions.find_one({
            "enrollmentKey": request.enrollmentKey.strip().upper(),
            "isStandalone": True
        })
        
        if not session:
            raise HTTPException(status_code=404, detail="Invalid enrollment key. Please check and try again.")
        
        session_id = str(session["_id"])
        user_id = user.get("id")
        
        # Check if student is already enrolled
        if user_id in session.get("enrolledStudents", []):
            return {
                "success": True,
                "message": "You are already enrolled in this session",
                "sessionId": session_id,
                "sessionTitle": session["title"]
            }
        
        # Add student to enrolled students list
        await db.database.sessions.update_one(
            {"_id": session["_id"]},
            {"$addToSet": {"enrolledStudents": user_id}}
        )
        
        return {
            "success": True,
            "message": "Successfully enrolled in session",
            "sessionId": session_id,
            "sessionTitle": session["title"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print("Error enrolling in session:", e)
        raise HTTPException(status_code=500, detail="Failed to enroll in session")


@router.post("/{session_id}/enroll")
async def enroll_in_specific_session(
    session_id: str,
    request: EnrollmentRequest,
    user: dict = Depends(get_current_user),
):
    """
    Enroll a student in a specific standalone session using an enrollment key.
    This is used when student clicks "Enter Key" for a specific session.
    """
    try:
        # Find the session and verify enrollment key
        session = await db.database.sessions.find_one({
            "_id": ObjectId(session_id),
            "isStandalone": True
        })
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found or is not a standalone session")
        
        # Verify enrollment key matches
        if session.get("enrollmentKey", "").upper() != request.enrollmentKey.strip().upper():
            raise HTTPException(status_code=403, detail="Invalid enrollment key for this session")
        
        user_id = user.get("id")
        
        # Check if student is already enrolled
        if user_id in session.get("enrolledStudents", []):
            return {
                "success": True,
                "message": "You are already enrolled in this session",
                "sessionId": session_id,
                "sessionTitle": session["title"]
            }
        
        # Add student to enrolled students list
        await db.database.sessions.update_one(
            {"_id": session["_id"]},
            {"$addToSet": {"enrolledStudents": user_id}}
        )
        
        return {
            "success": True,
            "message": "Successfully enrolled in session",
            "sessionId": session_id,
            "sessionTitle": session["title"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print("Error enrolling in specific session:", e)
        raise HTTPException(status_code=500, detail="Failed to enroll in session")


@router.get("", response_model=List[SessionOut])
async def list_sessions(user: dict = Depends(get_current_user)):
    """
    List sessions based on user role:
    - Instructors: See only their own sessions (with full URLs)
    - Students: See only sessions from courses they're enrolled in (with join URLs)
    - Admin: See all sessions
    """
    # Safety check - ensure user is authenticated
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_role = user.get("role", "student")
    user_id = user.get("id")
    
    if user_role == "admin":
        # Admins see all sessions
        cursor = db.database.sessions.find().sort("date", -1)
        sessions = await cursor.to_list(length=None)
        return [_session_doc_to_out(doc) for doc in sessions]
    
    elif user_role == "instructor":
        # Instructors see only their own sessions
        cursor = db.database.sessions.find({"instructorId": user_id}).sort("date", -1)
        sessions = await cursor.to_list(length=None)
        return [_session_doc_to_out(doc) for doc in sessions]
    
    else:
        # Students see:
        # 1. Sessions from courses they're enrolled in
        # 2. Standalone sessions they've enrolled in via enrollment key
        enrolled_courses = await CourseModel.find_enrolled_courses(user_id)
        enrolled_course_ids = [c["id"] for c in enrolled_courses]
        
        all_sessions = []
        
        # Get course-based sessions
        if enrolled_course_ids:
            cursor = db.database.sessions.find({
                "courseId": {"$in": enrolled_course_ids}
            }).sort("date", -1)
            course_sessions = await cursor.to_list(length=None)
            all_sessions.extend(course_sessions)
        
        # Get standalone sessions student is enrolled in
        standalone_cursor = db.database.sessions.find({
            "isStandalone": True,
            "enrolledStudents": user_id
        }).sort("date", -1)
        standalone_sessions = await standalone_cursor.to_list(length=None)
        all_sessions.extend(standalone_sessions)
        
        # Include join URLs for enrolled students
        return [_session_doc_to_out(doc, include_urls=True) for doc in all_sessions]


@router.get("/instructor/my-sessions", response_model=List[SessionOut])
async def get_my_sessions(user: dict = Depends(require_instructor)):
    """Get all sessions created by the current instructor"""
    cursor = db.database.sessions.find({"instructorId": user["id"]}).sort("date", -1)
    sessions = await cursor.to_list(length=None)
    return [_session_doc_to_out(doc) for doc in sessions]


@router.get("/course/{course_id}", response_model=List[SessionOut])
async def get_sessions_by_course(course_id: str, user: dict = Depends(get_current_user)):
    """Get all sessions for a specific course"""
    user_role = user.get("role", "student")
    user_id = user.get("id")
    
    # Check if user has access to this course
    if user_role == "student":
        is_enrolled = await CourseModel.is_student_enrolled(course_id, user_id)
        if not is_enrolled:
            raise HTTPException(status_code=403, detail="You are not enrolled in this course")
    elif user_role == "instructor":
        course = await CourseModel.find_by_id(course_id)
        if course and course["instructorId"] != user_id:
            raise HTTPException(status_code=403, detail="You can only view sessions for your own courses")
    
    cursor = db.database.sessions.find({"courseId": course_id}).sort("date", -1)
    sessions = await cursor.to_list(length=None)
    return [_session_doc_to_out(doc) for doc in sessions]


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(session_id: str, user: dict = Depends(get_current_user)):
    """Get a specific session - access controlled based on enrollment"""
    try:
        doc = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Session not found")
        
        user_role = user.get("role", "student")
        user_id = user.get("id")
        
        # Access control
        if user_role == "instructor" or user_role == "admin":
            # Instructors and admins can view any session (needed for editing)
            pass
        elif user_role == "student":
            # Students can only view sessions they're enrolled in
            is_standalone = doc.get("isStandalone", False)
            if is_standalone:
                # For standalone sessions, check if student is enrolled
                enrolled_students = doc.get("enrolledStudents", [])
                if user_id not in enrolled_students:
                    raise HTTPException(status_code=403, detail="You are not enrolled in this session")
            else:
                # For course-based sessions, check course enrollment
                course_id = doc.get("courseId")
                if course_id:
                    is_enrolled = await CourseModel.is_student_enrolled(course_id, user_id)
                    if not is_enrolled:
                        raise HTTPException(status_code=403, detail="You are not enrolled in this course")
        
        return _session_doc_to_out(doc)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching session: {e}")
        raise HTTPException(status_code=404, detail="Session not found")


@router.post("/{session_id}/end")
async def end_session(
    session_id: str,
    user: dict = Depends(require_instructor)
):
    """
    End a session and automatically generate report.
    - Marks session as 'completed'
    - Generates full report with all participant data
    - Saves report to MongoDB
    - Optionally sends email notifications to participants
    """
    try:
        # Verify session exists and belongs to this instructor
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("instructorId") != user["id"]:
            raise HTTPException(status_code=403, detail="You can only end your own sessions")
        
        if session.get("status") == "completed":
            raise HTTPException(status_code=400, detail="Session is already completed")
        
        # Update session status to completed
        await db.database.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {
                    "status": "completed",
                    "actualEndTime": datetime.utcnow(),
                    "endedAt": datetime.utcnow(),
                    "endedBy": user["id"]
                }
            }
        )
        
        # 🛑 Stop quiz automation if running
        automation_stopped = await quiz_scheduler.stop_automation(session_id)
        print(f"🛑 Quiz automation stop result: {automation_stopped}")
        
        # Get zoomMeetingId for participant lookup
        zoom_meeting_id = session.get("zoomMeetingId")
        
        # Get participant count - check BOTH MongoDB session_id AND zoomMeetingId
        participant_count = await db.database.session_participants.count_documents({
            "sessionId": session_id
        })
        
        # Also check by zoomMeetingId
        if zoom_meeting_id:
            zoom_count = await db.database.session_participants.count_documents({
                "sessionId": str(zoom_meeting_id)
            })
            if zoom_count > participant_count:
                participant_count = zoom_count
        
        print(f"📊 End Session: Found {participant_count} participants (sessionId={session_id}, zoomId={zoom_meeting_id})")
        
        # Update participant count in session
        await db.database.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"participants": participant_count}}
        )
        
        # Generate and save MASTER report with ALL data to MongoDB
        # This retrieves ALL data from MongoDB collections and compiles into one report
        report = await SessionReportModel.generate_master_report(
            session_id=session_id,
            instructor_id=user["id"]
        )
        
        print(f"📊 Report generated: {report.get('totalParticipants', 0)} participants, saved ID: {report.get('id')}")
        
        # Send email notifications to all participants
        # Get participants from BOTH sessionId and zoomMeetingId
        emails_sent = 0
        participants = []
        seen_emails = set()
        
        async for p in db.database.session_participants.find({"sessionId": session_id}):
            if p.get("studentEmail") and p.get("studentEmail") not in seen_emails:
                participants.append(p)
                seen_emails.add(p.get("studentEmail"))
        
        if zoom_meeting_id:
            async for p in db.database.session_participants.find({"sessionId": str(zoom_meeting_id)}):
                if p.get("studentEmail") and p.get("studentEmail") not in seen_emails:
                    participants.append(p)
                    seen_emails.add(p.get("studentEmail"))
        
        for p in participants:
            try:
                success = email_service.send_session_report_email(
                    to_email=p.get("studentEmail"),
                    student_name=p.get("studentName", "Student"),
                    session_title=session.get("title", "Session"),
                    course_name=session.get("course", "Course"),
                    session_id=session_id,
                    is_instructor=False
                )
                if success:
                    emails_sent += 1
            except Exception as e:
                print(f"Failed to send email to {p.get('studentEmail')}: {e}")
        
        # Send email to instructor
        instructor_email = user.get("email")
        if instructor_email:
            try:
                email_service.send_session_report_email(
                    to_email=instructor_email,
                    student_name=f"{user.get('firstName', '')} {user.get('lastName', '')}".strip(),
                    session_title=session.get("title", "Session"),
                    course_name=session.get("course", "Course"),
                    session_id=session_id,
                    is_instructor=True
                )
                emails_sent += 1
            except Exception as e:
                print(f"Failed to send email to instructor: {e}")
        
        return {
            "success": True,
            "message": "Session ended successfully",
            "sessionId": session_id,
            "status": "completed",
            "participantCount": participant_count,
            "reportGenerated": report is not None,
            "reportId": report.get("id") if report else None,
            "emailsSent": emails_sent,
            "automationStopped": automation_stopped.get("success", False),
            "questionsAutoTriggered": automation_stopped.get("questions_triggered", 0)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error ending session: {e}")
        raise HTTPException(status_code=500, detail="Failed to end session")


class StartSessionRequest(BaseModel):
    """Request body for starting a session with optional automation config"""
    enableRealTimeAnalytics: Optional[bool] = False  # Enable real-time analytics (default: disabled)
    enableAutomation: Optional[bool] = True  # Auto-trigger questions (default: enabled, only if analytics enabled)
    firstDelaySeconds: Optional[int] = 120   # Delay before first question (2 minutes)
    intervalSeconds: Optional[int] = 600     # Interval between questions (10 minutes)
    maxQuestions: Optional[int] = None       # Max questions to auto-trigger (None = unlimited)


@router.post("/{session_id}/start")
async def start_session(
    session_id: str,
    request: Optional[StartSessionRequest] = None,
    user: dict = Depends(require_instructor)
):
    """
    Start a session (mark as live)
    
    Optional automation configuration:
    - enableRealTimeAnalytics: Enable real-time analytics (default: False)
    - enableAutomation: Enable auto-triggering questions (default: True, only if analytics enabled)
    - firstDelaySeconds: Seconds before first question (default: 120 = 2 minutes)
    - intervalSeconds: Seconds between questions (default: 600 = 10 minutes)
    - maxQuestions: Maximum questions to auto-trigger (default: None = unlimited)
    """
    try:
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.get("instructorId") != user["id"]:
            raise HTTPException(status_code=403, detail="You can only start your own sessions")
        
        # Use default config if none provided
        if request is None:
            request = StartSessionRequest()
        
        # Only enable automation if real-time analytics is also enabled
        effective_automation = request.enableRealTimeAnalytics and request.enableAutomation
        
        await db.database.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {
                    "status": "live",
                    "actualStartTime": datetime.utcnow(),
                    "startedAt": datetime.utcnow(),
                    "realTimeAnalyticsEnabled": request.enableRealTimeAnalytics,
                    "automationEnabled": effective_automation,
                    "automationConfig": {
                        "firstDelaySeconds": request.firstDelaySeconds,
                        "intervalSeconds": request.intervalSeconds,
                        "maxQuestions": request.maxQuestions
                    }
                }
            }
        )
        
        # 🎯 Broadcast session started event to all connected clients
        # Use both session_id and zoomMeetingId to reach all participants
        zoom_meeting_id = session.get("zoomMeetingId")
        session_started_event = {
            "type": "session_started",
            "sessionId": session_id,
            "zoomMeetingId": str(zoom_meeting_id) if zoom_meeting_id else None,
            "status": "live",
            "message": "Session has started",
            "timestamp": datetime.utcnow().isoformat(),
            "realTimeAnalyticsEnabled": request.enableRealTimeAnalytics,
            "automationEnabled": effective_automation
        }
        
        # Broadcast using zoomMeetingId if available
        if zoom_meeting_id:
            await ws_manager.broadcast_to_session(str(zoom_meeting_id), session_started_event)
        # Also broadcast using MongoDB session_id
        await ws_manager.broadcast_to_session(session_id, session_started_event)
        
        print(f"📢 Session started event broadcasted: session={session_id}, zoom={zoom_meeting_id}, analytics={request.enableRealTimeAnalytics}")
        
        # 🤖 Start quiz automation if enabled (only when real-time analytics is on)
        automation_result = None
        if effective_automation:
            automation_result = await quiz_scheduler.start_automation(
                session_id=session_id,
                zoom_meeting_id=str(zoom_meeting_id) if zoom_meeting_id else None,
                first_delay_seconds=request.firstDelaySeconds,
                interval_seconds=request.intervalSeconds,
                max_questions=request.maxQuestions
            )
            print(f"🤖 Quiz automation started: {automation_result}")
        
        return {
            "success": True, 
            "message": "Session started", 
            "status": "live",
            "realTimeAnalyticsEnabled": request.enableRealTimeAnalytics,
            "automationEnabled": effective_automation,
            "automation": automation_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error starting session: {e}")
        raise HTTPException(status_code=500, detail="Failed to start session")


@router.post("/{session_id}/join")
async def join_session(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Student joins a session - tracks participation and broadcasts event.
    This endpoint should be called when a student clicks 'Join' button.
    Returns session details and confirms participation.
    """
    try:
        # Verify session exists
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        user_role = user.get("role", "student")
        user_id = user.get("id")
        
        # Verify access based on role
        if user_role == "student":
            # Check if student has access to this session
            is_standalone = session.get("isStandalone", False)
            if is_standalone:
                # For standalone sessions, check if student is enrolled
                enrolled_students = session.get("enrolledStudents", [])
                if user_id not in enrolled_students:
                    raise HTTPException(status_code=403, detail="You are not enrolled in this session")
            else:
                # For course-based sessions, check course enrollment
                course_id = session.get("courseId")
                if course_id:
                    is_enrolled = await CourseModel.is_student_enrolled(course_id, user_id)
                    if not is_enrolled:
                        raise HTTPException(status_code=403, detail="You are not enrolled in this course")
        
        # Track participation using WebSocket manager
        # This will save to MongoDB and broadcast to all participants
        student_name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or user.get("email", "Student")
        student_email = user.get("email", "")
        
        # Use zoomMeetingId as session key for WebSocket rooms
        session_key = session.get("zoomMeetingId") or str(session["_id"])
        
        # Note: Actual WebSocket join happens when student connects via WebSocket
        # This endpoint just confirms they have permission and returns session details
        
        # Broadcast student join intent event
        join_event = {
            "type": "student_join_intent",
            "sessionId": session_id,
            "zoomMeetingId": str(session.get("zoomMeetingId")) if session.get("zoomMeetingId") else None,
            "studentId": user_id,
            "studentName": student_name,
            "studentEmail": student_email,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Broadcast to session room
        zoom_meeting_id = session.get("zoomMeetingId")
        if zoom_meeting_id:
            await ws_manager.broadcast_to_session(str(zoom_meeting_id), join_event)
        await ws_manager.broadcast_to_session(session_id, join_event)
        
        print(f"✅ Student join intent: session={session_id}, student={user_id}, name={student_name}")
        
        return {
            "success": True,
            "message": "Ready to join session",
            "sessionId": session_id,
            "sessionKey": session_key,
            "sessionTitle": session.get("title"),
            "status": session.get("status", "upcoming"),
            "join_url": session.get("join_url"),
            "studentId": user_id,
            "studentName": student_name
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error joining session: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to join session")


@router.post("/{session_id}/leave")
async def leave_session(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Student leaves a session - updates participation status and broadcasts event.
    This endpoint should be called when a student clicks 'Leave Session' button.
    """
    try:
        # Verify session exists
        session = await db.database.sessions.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        user_id = user.get("id")
        student_name = f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or user.get("email", "Student")
        
        # Use both session_id and zoomMeetingId for WebSocket room cleanup
        zoom_meeting_id = session.get("zoomMeetingId")
        session_key = str(zoom_meeting_id) if zoom_meeting_id else session_id
        
        # Leave session room in WebSocket manager
        # This will update MongoDB and broadcast to all participants
        if zoom_meeting_id:
            await ws_manager.leave_session_room(str(zoom_meeting_id), user_id)
        await ws_manager.leave_session_room(session_id, user_id)
        
        # Broadcast student left event
        leave_event = {
            "type": "student_left",
            "sessionId": session_id,
            "zoomMeetingId": str(zoom_meeting_id) if zoom_meeting_id else None,
            "studentId": user_id,
            "studentName": student_name,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Broadcast to session room
        if zoom_meeting_id:
            await ws_manager.broadcast_to_session(str(zoom_meeting_id), leave_event)
        await ws_manager.broadcast_to_session(session_id, leave_event)
        
        print(f"✅ Student left session: session={session_id}, student={user_id}")
        
        return {
            "success": True,
            "message": "Left session successfully",
            "sessionId": session_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error leaving session: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to leave session")


@router.post("/sync-zoom-meetings")
async def sync_zoom_meetings(
    user: dict = Depends(require_instructor)
):
    """
    Auto-sync previously scheduled Zoom meetings with the platform.
    Fetches scheduled meetings from Zoom API and creates/updates session records.
    """
    try:
        # Fetch scheduled meetings from Zoom
        zoom_meetings = await list_zoom_meetings(page_size=100, type="scheduled")
        
        synced_count = 0
        created_count = 0
        updated_count = 0
        
        for zoom_meeting in zoom_meetings:
            zoom_meeting_id = str(zoom_meeting.get("id"))
            topic = zoom_meeting.get("topic", "Untitled Meeting")
            start_time = zoom_meeting.get("start_time")
            duration = zoom_meeting.get("duration", 60)
            join_url = zoom_meeting.get("join_url")
            start_url = zoom_meeting.get("start_url")
            
            # Check if session already exists with this Zoom meeting ID
            existing_session = await db.database.sessions.find_one({
                "zoomMeetingId": zoom_meeting_id,
                "instructorId": user["id"]
            })
            
            if existing_session:
                # Update existing session with latest Zoom data
                await db.database.sessions.update_one(
                    {"_id": existing_session["_id"]},
                    {
                        "$set": {
                            "title": topic,
                            "join_url": join_url,
                            "start_url": start_url,
                            "duration": f"{duration} minutes",
                            "updatedAt": datetime.utcnow()
                        }
                    }
                )
                updated_count += 1
            else:
                # Create new session from Zoom meeting
                # Parse start_time to extract date and time
                try:
                    if start_time:
                        dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                        date_str = dt.strftime("%Y-%m-%d")
                        time_str = dt.strftime("%I:%M %p")
                    else:
                        date_str = datetime.utcnow().strftime("%Y-%m-%d")
                        time_str = datetime.utcnow().strftime("%I:%M %p")
                except:
                    date_str = datetime.utcnow().strftime("%Y-%m-%d")
                    time_str = datetime.utcnow().strftime("%I:%M %p")
                
                new_session = {
                    "title": topic,
                    "course": "Synced from Zoom",
                    "courseCode": "ZOOM_SYNC",
                    "courseId": None,
                    "instructor": f"{user.get('firstName', '')} {user.get('lastName', '')}".strip() or user.get("email", "Unknown Instructor"),
                    "instructorId": user["id"],
                    "date": date_str,
                    "time": time_str,
                    "startTime": dt.strftime("%H:%M") if start_time else None,
                    "endTime": None,
                    "duration": f"{duration} minutes",
                    "status": "upcoming",
                    "participants": 0,
                    "expectedParticipants": 0,
                    "engagement": 0,
                    "recordingAvailable": False,
                    "zoomMeetingId": zoom_meeting_id,
                    "join_url": join_url,
                    "start_url": start_url,
                    "isStandalone": True,  # Mark as standalone since it's synced
                    "enrollmentKey": None,
                    "enrolledStudents": [],
                    "createdAt": datetime.utcnow(),
                    "syncedFromZoom": True
                }
                
                await db.database.sessions.insert_one(new_session)
                created_count += 1
            
            synced_count += 1
        
        return {
            "success": True,
            "message": f"Synced {synced_count} meetings from Zoom",
            "syncedCount": synced_count,
            "createdCount": created_count,
            "updatedCount": updated_count
        }
        
    except ZoomServiceError as ze:
        raise HTTPException(status_code=400, detail=str(ze))
    except Exception as e:
        print(f"Error syncing Zoom meetings: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to sync Zoom meetings: {str(e)}")
