from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from pydantic import BaseModel
from bson import ObjectId
from ..services.clustering_service import ClusteringService
from ..services.ws_manager import ws_manager
from ..models.cluster import StudentCluster
from ..middleware.auth import get_current_user
from ..database.connection import get_database

router = APIRouter(prefix="/api/clustering", tags=["clustering"])
clustering_service = ClusteringService()


def _is_valid_object_id(sid: str) -> bool:
    """Check if a string is a valid 24-char hex MongoDB ObjectId."""
    if not sid or len(sid) != 24:
        return False
    try:
        ObjectId(sid)
        return True
    except Exception:
        return False


async def _resolve_student_info(student_ids: List[str]) -> tuple:
    """Look up student names and roles from the users collection.
    Returns (names_dict, non_student_ids_set):
      - names_dict: studentId -> 'firstName lastName'
      - non_student_ids_set: set of IDs that are NOT students
        (instructors, admins, or non-ObjectId IDs like 'instructor_xxx')
    """
    names: Dict[str, str] = {}
    non_student_ids: set = set()

    if not student_ids:
        return names, non_student_ids

    db = get_database()
    if db is None:
        return names, non_student_ids

    object_ids = []
    for sid in student_ids:
        if not _is_valid_object_id(sid):
            # IDs like "instructor_6..." are not real students
            non_student_ids.add(sid)
            continue
        object_ids.append(ObjectId(sid))

    if object_ids:
        async for user in db.users.find(
            {"_id": {"$in": object_ids}},
            {"firstName": 1, "lastName": 1, "role": 1}
        ):
            uid = str(user["_id"])
            role = user.get("role", "student")
            first = user.get("firstName", "")
            last = user.get("lastName", "")

            if role in ("instructor", "admin"):
                non_student_ids.add(uid)
            else:
                names[uid] = f"{first} {last}".strip() or f"Student {uid[:8]}"

    return names, non_student_ids


class UpdateClustersRequest(BaseModel):
    sessionId: str
    quizPerformance: Optional[Dict] = None


@router.get("/session/{session_id}")
async def get_clusters(
    session_id: str,
    request: Request,
    user: dict = Depends(get_current_user)
):
    """Get clusters for a session, including real-time stats."""
    try:
        if not session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing sessionId"
            )

        print(f"Getting clusters for session: {session_id}")
        clusters = await clustering_service.get_clusters(session_id)
        print(f"Returning {len(clusters)} clusters for session {session_id}")

        # Resolve student names and identify non-students (instructors/admins)
        all_student_ids = []
        for c in clusters:
            all_student_ids.extend(c.students)
        student_names, non_student_ids = await _resolve_student_info(list(set(all_student_ids)))

        if non_student_ids:
            print(f"🚫 Filtering out non-student IDs from clusters: {non_student_ids}")

        # Attach names to each cluster, filtering out instructors/admins
        enriched = []
        for c in clusters:
            filtered_students = [sid for sid in c.students if sid not in non_student_ids]
            cluster_dict = c.model_dump()
            cluster_dict["students"] = filtered_students
            cluster_dict["studentCount"] = len(filtered_students)
            cluster_dict["studentNames"] = {
                sid: student_names.get(sid, f"Student {sid[:8]}")
                for sid in filtered_students
            }
            enriched.append(cluster_dict)

        # ── Also compute real-time stats (piggybacked on this response) ──
        realtime_stats = await _compute_realtime_stats(session_id)

        return {
            "clusters": enriched,
            "realtimeStats": realtime_stats,
        }
    except Exception as e:
        print(f"Error getting clusters: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/update")
async def update_clusters(
    request_data: UpdateClustersRequest,
    request: Request,
    user: dict = Depends(get_current_user)
):
    """Update clusters based on quiz performance"""
    try:
        if not request_data.sessionId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing sessionId"
            )

        print(
            f"Updating clusters for session: {request_data.sessionId}",
            request_data.quizPerformance
        )
        clusters = await clustering_service.update_clusters(
            request_data.sessionId,
            request_data.quizPerformance
        )

        # Resolve student names and filter out instructors/admins
        all_student_ids = []
        for c in clusters:
            all_student_ids.extend(c.students)
        student_names, non_student_ids = await _resolve_student_info(list(set(all_student_ids)))

        enriched = []
        for c in clusters:
            filtered_students = [sid for sid in c.students if sid not in non_student_ids]
            cluster_dict = c.model_dump()
            cluster_dict["students"] = filtered_students
            cluster_dict["studentCount"] = len(filtered_students)
            cluster_dict["studentNames"] = {
                sid: student_names.get(sid, f"Student {sid[:8]}")
                for sid in filtered_students
            }
            enriched.append(cluster_dict)

        return enriched
    except Exception as e:
        print(f"Error updating clusters: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/student/{student_id}")
async def get_student_cluster(
    student_id: str,
    session_id: str = Query(..., alias="sessionId"),
    user: dict = Depends(get_current_user)
):
    """Get student's cluster assignment"""
    try:
        if not student_id or not session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing required parameters"
            )

        cluster_id = await clustering_service.get_student_cluster(
            student_id, session_id
        )

        return {"clusterId": cluster_id}
    except Exception as e:
        print(f"Error getting student cluster: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


async def _compute_realtime_stats(session_id: str) -> dict:
    """Compute real-time student count and question count for a session.
    Uses WebSocket manager (in-memory) as the primary source for live
    connected students, then falls back to MongoDB collections."""
    db = get_database()
    if db is None:
        return {"totalStudents": 0, "activeStudents": 0, "totalQuestions": 0, "totalAnswers": 0}

    try:
        all_ids = await _resolve_session_ids(db, session_id)
        id_filter = {"sessionId": {"$in": all_ids}}
        print(f"📊 realtime-stats: session_id={session_id}, resolved IDs={all_ids}")

        # ── Students: PRIMARY SOURCE = WebSocket manager (live connections) ──
        # This is the same data source as the Student Network Monitor
        ws_participants = ws_manager.get_session_participants_by_multiple_ids(all_ids)
        ws_student_ids = set()
        for p in ws_participants:
            sid = p.get("studentId")
            if sid:
                ws_student_ids.add(sid)
        print(f"📊 WebSocket live participants: {len(ws_student_ids)} across IDs {all_ids}")

        # ── Students: SECONDARY SOURCE = MongoDB collections ─────────
        db_student_ids: set = set()
        active_sids: set = set()
        async for p in db.session_participants.find(id_filter, {"studentId": 1, "status": 1}):
            sid = p.get("studentId")
            if sid:
                db_student_ids.add(sid)
                if p.get("status") == "active":
                    active_sids.add(sid)

        assignment_sids = set(await db.question_assignments.distinct("studentId", id_filter))
        answer_sids = set(await db.quiz_answers.distinct("studentId", id_filter))

        # Union of ALL sources
        all_student_ids = ws_student_ids | db_student_ids | assignment_sids | answer_sids

        # Filter out instructors/admins and non-ObjectId IDs (e.g. "instructor_xxx")
        if all_student_ids:
            non_student_ids = set()
            obj_ids = []
            for sid in all_student_ids:
                if not _is_valid_object_id(sid):
                    non_student_ids.add(sid)
                    continue
                obj_ids.append(ObjectId(sid))
            if obj_ids:
                async for u in db.users.find(
                    {"_id": {"$in": obj_ids}, "role": {"$in": ["instructor", "admin"]}},
                    {"_id": 1}
                ):
                    non_student_ids.add(str(u["_id"]))
            all_student_ids -= non_student_ids
            ws_student_ids -= non_student_ids
            active_sids -= non_student_ids

        total_students = len(all_student_ids)
        # Active = WebSocket-connected students (most accurate for "right now")
        # Fall back to session_participants active, then total
        active_students = len(ws_student_ids) if ws_student_ids else (len(active_sids) if active_sids else total_students)

        # ── Questions SENT ───────────────────────────────────────────
        questions_from_assignments = set(await db.question_assignments.distinct("questionId", id_filter))
        questions_from_answers = set(await db.quiz_answers.distinct("questionId", id_filter))
        total_questions = len(questions_from_assignments | questions_from_answers)

        # Total answer submissions
        total_answers = await db.quiz_answers.count_documents(id_filter)

        print(f"📊 realtime-stats result: students={total_students} (active={active_students}), "
              f"questions_sent={total_questions}, answers={total_answers}")

        return {
            "totalStudents": total_students,
            "activeStudents": active_students,
            "totalQuestions": total_questions,
            "totalAnswers": total_answers,
        }
    except Exception as e:
        print(f"⚠️ realtime-stats error: {e}")
        return {"totalStudents": 0, "activeStudents": 0, "totalQuestions": 0, "totalAnswers": 0}


async def _resolve_session_ids(db, session_id: str) -> List[str]:
    """
    Resolve all possible session IDs (MongoDB _id + zoomMeetingId).
    Returns every string variant so queries against collections that
    may store the session under either ID will match.
    """
    ids = [session_id]
    try:
        if len(session_id) == 24:
            try:
                doc = await db.sessions.find_one(
                    {"_id": ObjectId(session_id)}, {"zoomMeetingId": 1}
                )
                if doc and doc.get("zoomMeetingId"):
                    zoom_id = str(doc["zoomMeetingId"])
                    if zoom_id not in ids:
                        ids.append(zoom_id)
            except Exception:
                pass

        # Also try to look up by zoomMeetingId (string or int)
        for variant in ([session_id] + ([int(session_id)] if session_id.isdigit() else [])):
            doc = await db.sessions.find_one(
                {"zoomMeetingId": variant}, {"_id": 1, "zoomMeetingId": 1}
            )
            if doc:
                mongo_id = str(doc["_id"])
                if mongo_id not in ids:
                    ids.append(mongo_id)
                zoom_val = doc.get("zoomMeetingId")
                if zoom_val and str(zoom_val) not in ids:
                    ids.append(str(zoom_val))
    except Exception:
        pass
    return ids


@router.get("/session/{session_id}/realtime-stats")
async def get_realtime_stats(
    session_id: str,
    user: dict = Depends(get_current_user)
):
    """
    Real-time session stats polled by the analytics dashboard.

    Returns:
      - totalStudents  : unique students across session_participants,
                         question_assignments, and quiz_answers
      - activeStudents : currently active (from session_participants)
      - totalQuestions  : distinct questions SENT (assigned or answered)
      - totalAnswers   : total quiz answer submissions
    """
    try:
        db = get_database()
        if db is None:
            raise HTTPException(status_code=500, detail="Database not connected")

        all_ids = await _resolve_session_ids(db, session_id)
        id_filter = {"sessionId": {"$in": all_ids}}
        print(f"📊 realtime-stats: session_id={session_id}, resolved IDs={all_ids}")

        # ── Students ─────────────────────────────────────────────────
        # 1. From session_participants (the primary source)
        participant_sids: set = set()
        active_sids: set = set()
        async for p in db.session_participants.find(id_filter, {"studentId": 1, "status": 1}):
            sid = p.get("studentId")
            if sid:
                participant_sids.add(sid)
                if p.get("status") == "active":
                    active_sids.add(sid)

        # 2. From question_assignments (students who received a question)
        assignment_sids = set(
            await db.question_assignments.distinct("studentId", id_filter)
        )

        # 3. From quiz_answers (students who answered a question)
        answer_sids = set(
            await db.quiz_answers.distinct("studentId", id_filter)
        )

        # Union of ALL sources
        all_student_ids = participant_sids | assignment_sids | answer_sids
        total_students = len(all_student_ids)

        # Active = from session_participants; fall back to all known students
        active_students = len(active_sids) if active_sids else total_students

        # ── Questions SENT ───────────────────────────────────────────
        # Distinct questionIds from question_assignments (questions pushed
        # to students) — this increments the moment a question is sent,
        # even before any student answers.
        questions_from_assignments = set(
            await db.question_assignments.distinct("questionId", id_filter)
        )

        # Also check quiz_answers in case some answers were recorded
        # without an assignment entry.
        questions_from_answers = set(
            await db.quiz_answers.distinct("questionId", id_filter)
        )

        all_question_ids = questions_from_assignments | questions_from_answers
        total_questions = len(all_question_ids)

        # Total answer submissions
        total_answers = await db.quiz_answers.count_documents(id_filter)

        print(
            f"📊 realtime-stats result: students={total_students} "
            f"(active={active_students}), questions_sent={total_questions}, "
            f"answers={total_answers}"
        )

        return {
            "totalStudents": total_students,
            "activeStudents": active_students,
            "totalQuestions": total_questions,
            "totalAnswers": total_answers,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting realtime stats: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

