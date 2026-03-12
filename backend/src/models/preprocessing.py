"""
Preprocessing Service
=====================

Fetches student quiz answer data and network metrics directly from the database
for a given session, computes engagement scores, and stores the preprocessed
results back into MongoDB (collection: preprocessed_engagement).

No file upload, no dataset splitting – everything lives in the database.
"""

import pandas as pd
import numpy as np
from datetime import datetime
from typing import List, Dict, Optional
from bson import ObjectId
from ..database.connection import get_database


class PreprocessingService:
    """Preprocess quiz + network data for a session and persist results."""

    COLLECTION = "preprocessed_engagement"

    # ── thresholds (same as original notebook) ──────────────────────────
    POOR_RTT = 3000       # ms
    POOR_JITTER = 1500    # ms

    # ── Fixed scaler parameters (estimated from training data) ────────
    # The KMeans model was trained on StandardScaler-transformed data.
    # We use fixed mean/std so scaling is consistent regardless of
    # session size (1 student or 100 students).
    #
    # engagement_score range: 0.0 (no attempt / wrong) → ~1.0 (correct + fast)
    # With these params, typical mappings are:
    #   raw 0.0  → scaled -1.33 → "low"    (no attempt / wrong)
    #   raw 0.28 → scaled -0.40 → boundary low/medium
    #   raw 0.50 → scaled  0.33 → "medium" (correct, slower)
    #   raw 0.62 → scaled  0.73 → boundary medium/high
    #   raw 0.80 → scaled  1.33 → "high"   (correct + fast)
    SCALER_MEAN = 0.40
    SCALER_STD = 0.30

    # ── public API ──────────────────────────────────────────────────────
    async def run(self, session_id: str) -> List[dict]:
        """
        Main entry-point.

        1. Fetch quiz answers + participants + latency data from DB
        2. Build a DataFrame (one row per student × question)
        3. Compute engagement scores
        4. Store preprocessed rows in MongoDB
        5. Return the stored documents
        """
        db = get_database()
        if db is None:

            raise Exception("Database not connected")

        # Collect from both MongoDB session _id and zoomMeetingId variants.
        # This avoids fragmented datasets when different collections store
        # either identifier for the same live session.
        all_session_ids = await self._resolve_session_ids(db, session_id)

        # ── 1. gather raw data ──────────────────────────────────────────
        quiz_answers = await self._fetch_quiz_answers(db, all_session_ids)
        participant_ids = await self._fetch_participant_ids(db, all_session_ids)
        assigned_question_map = await self._fetch_assigned_question_map(
            db, all_session_ids
        )
        triggered_question_ids = await self._fetch_triggered_question_ids(

            db, session_id, quiz_answers
        )
        latency_map = await self._fetch_latency_map(db, all_session_ids)

        if not triggered_question_ids and not assigned_question_map:
            # Nothing to preprocess – no questions were triggered yet
            return []

        # ── 2. build rows (attempted + not-attempted) ───────────────────
        rows = self._build_rows(
            quiz_answers,
            participant_ids,
            triggered_question_ids,
            latency_map,
            assigned_question_map,
        )

        if not rows:
            return []

        df = pd.DataFrame(rows)

        # ── 3. compute engagement ───────────────────────────────────────
        df = self._compute_engagement(df)

        # ── 4. scale engagement score ───────────────────────────────────
        # Use FIXED scaler parameters matching the training data so that
        # the KMeans model receives values in the expected range.
        # (A fresh StandardScaler per-session produces inconsistent values
        #  and always outputs 0.0 with a single student.)
        df["engagement_score_scaled"] = (
            (df["engagement_score"] - self.SCALER_MEAN) / self.SCALER_STD
        )

        # ── 5. persist to MongoDB ───────────────────────────────────────
        docs = self._dataframe_to_docs(df, session_id)
        await self._store(db, session_id, docs)

        return docs

    # ── data fetching helpers ───────────────────────────────────────────
    async def _fetch_quiz_answers(self, db, session_ids: List[str]) -> List[dict]:
        """Get all quiz_answers for the resolved session IDs."""
        answers: List[dict] = []
        async for doc in db.quiz_answers.find({"sessionId": {"$in": session_ids}}):
            doc["_id"] = str(doc["_id"])
            answers.append(doc)
        return answers

    async def _fetch_participant_ids(self, db, session_ids: List[str]) -> List[str]:
        """Get student IDs of all participants (active or left) in the session."""
        ids: List[str] = []
        async for p in db.session_participants.find(
            {"sessionId": {"$in": session_ids}}, {"studentId": 1}
        ):
            sid = p.get("studentId")
            if sid and sid not in ids:
                ids.append(sid)

        # Also include students who submitted answers but may not be
        # recorded as session_participants (edge-case safety net).
        async for a in db.quiz_answers.find(
            {"sessionId": {"$in": session_ids}}, {"studentId": 1}
        ):
            sid = a.get("studentId")
            if sid and sid not in ids:
                ids.append(sid)

        # Include students who were assigned at least one question.
        async for a in db.question_assignments.find(
            {"sessionId": {"$in": session_ids}}, {"studentId": 1}
        ):
            sid = a.get("studentId")
            if sid and sid not in ids:
                ids.append(sid)

        return ids

    async def _fetch_triggered_question_ids(
        self, db, session_id: str, quiz_answers: List[dict]
    ) -> List[str]:
        """
        Determine all question IDs that were triggered in this session.
        We derive this from the distinct questionIds in quiz_answers.
        """
        qids: List[str] = []
        for a in quiz_answers:
            qid = a.get("questionId")
            if qid and qid not in qids:
                qids.append(qid)
        return qids

    async def _fetch_assigned_question_map(
        self, db, session_ids: List[str]
    ) -> Dict[str, List[str]]:
        """
        Build per-student expected question IDs from question_assignments:
          { studentId: [questionId, ...] }

        This is the primary source for "not attempted" rows so students are
        evaluated only against questions actually assigned to them.
        """
        assigned_map: Dict[str, List[str]] = {}
        async for doc in db.question_assignments.find(
            {"sessionId": {"$in": session_ids}},
            {"studentId": 1, "questionId": 1},
        ):
            sid = doc.get("studentId")
            qid = doc.get("questionId")
            if not sid or not qid:
                continue
            qid_str = str(qid)
            if sid not in assigned_map:
                assigned_map[sid] = []
            if qid_str not in assigned_map[sid]:
                assigned_map[sid].append(qid_str)
        return assigned_map

    async def _fetch_latency_map(
        self, db, session_ids: List[str]
    ) -> Dict[str, dict]:
        """
        Build { studentId: { avg_rtt_ms, avg_jitter_ms } } from the
        latency_metrics collection for this session.
        """
        latency: Dict[str, dict] = {}
        async for doc in db.latency_metrics.find({"session_id": {"$in": session_ids}}):
            sid = doc.get("student_id")
            if sid:
                latency[sid] = {
                    "rtt_ms": doc.get("avg_rtt_ms", 0),
                    "jitter_ms": doc.get("avg_jitter_ms", 0),
                }
        return latency

    async def _resolve_session_ids(self, db, session_id: str) -> List[str]:
        """
        Resolve all known IDs for a session (MongoDB _id + zoomMeetingId).
        """
        ids: List[str] = [session_id]
        try:
            if len(session_id) == 24:
                try:
                    doc = await db.sessions.find_one(
                        {"_id": ObjectId(session_id)},
                        {"zoomMeetingId": 1},
                    )
                    if doc and doc.get("zoomMeetingId"):
                        zoom_id = str(doc["zoomMeetingId"])
                        if zoom_id not in ids:
                            ids.append(zoom_id)
                except Exception:
                    pass

            for variant in ([session_id] + ([int(session_id)] if session_id.isdigit() else [])):
                doc = await db.sessions.find_one(
                    {"zoomMeetingId": variant},
                    {"_id": 1, "zoomMeetingId": 1},
                )
                if not doc:
                    continue
                mongo_id = str(doc["_id"])
                if mongo_id not in ids:
                    ids.append(mongo_id)
                if doc.get("zoomMeetingId") is not None:
                    zoom_id = str(doc["zoomMeetingId"])
                    if zoom_id not in ids:
                        ids.append(zoom_id)
        except Exception:
            pass
        return ids

    # ── row construction ────────────────────────────────────────────────
    def _build_rows(
        self,
        quiz_answers: List[dict],
        participant_ids: List[str],
        question_ids: List[str],
        latency_map: Dict[str, dict],
        assigned_question_map: Optional[Dict[str, List[str]]] = None,
    ) -> List[dict]:
        """
        One row per (student, question).
        Students who answered  → attempt_status = 1
        Students who did NOT   → attempt_status = 0
        """
        # Index answers by (studentId, questionId) for quick lookup
        answer_index: Dict[tuple, dict] = {}
        for a in quiz_answers:
            key = (a["studentId"], a["questionId"])
            answer_index[key] = a

        rows: List[dict] = []

        for student_id in participant_ids:
            student_latency = latency_map.get(student_id, {})
            # Prefer per-student assigned questions. Fallback to global list
            # if assignments are unavailable (legacy sessions).
            student_question_ids = (assigned_question_map or {}).get(student_id) or question_ids
            if not student_question_ids:
                continue

            for question_id in student_question_ids:
                answer = answer_index.get((student_id, question_id))

                if answer:
                    # ── student attempted this question ──────────────────
                    ns = answer.get("networkStrength") or {}
                    rows.append({
                        "studentId": student_id,
                        "questionId": question_id,
                        "attempt_status": 1,
                        "is_correct": 1 if answer.get("isCorrect") else 0,
                        "response_time_sec": float(answer.get("timeTaken", 0)),
                        "rtt_ms": float(ns.get("rttMs") or student_latency.get("rtt_ms", 0)),
                        "jitter_ms": float(ns.get("jitterMs") or student_latency.get("jitter_ms", 0)),
                    })
                else:
                    # ── student did NOT attempt this question ────────────
                    rows.append({
                        "studentId": student_id,
                        "questionId": question_id,
                        "attempt_status": 0,
                        "is_correct": 0,
                        "response_time_sec": 0.0,
                        "rtt_ms": float(student_latency.get("rtt_ms", 0)),
                        "jitter_ms": float(student_latency.get("jitter_ms", 0)),
                    })

        return rows

    # ── engagement computation (mirrors original notebook logic) ────────
    def _compute_engagement(self, df: pd.DataFrame) -> pd.DataFrame:
        """Compute engagement_score following the original Colab logic."""

        # net_retrieved: True if we have BOTH RTT and Jitter data
        # (matches Colab training logic: ~RTT.isna() & ~Jitter.isna())
        df["net_retrieved"] = (
            (df["rtt_ms"] != 0) & (df["jitter_ms"] != 0)
        ).astype(int)

        df["engagement_score"] = 0.0

        attempted = df["attempt_status"] == 1
        not_attempted = df["attempt_status"] == 0

        # ── Attempted students ──────────────────────────────────────────
        df.loc[attempted, "engagement_score"] = (
            df.loc[attempted, "is_correct"] * 0.6
            + (1 / (df.loc[attempted, "response_time_sec"] + 1)) * 0.4
        )

        # ── Not-attempted students ──────────────────────────────────────
        poor_network = (
            (df["rtt_ms"] > self.POOR_RTT)
            | (df["jitter_ms"] > self.POOR_JITTER)
        )
        df.loc[not_attempted & poor_network, "engagement_score"] = 0.45
        df.loc[not_attempted & ~poor_network, "engagement_score"] = 0.0

        # ── Network penalty ─────────────────────────────────────────────
        df.loc[
            (df["attempt_status"] == 0) & (df["net_retrieved"] == 1),
            "engagement_score",
        ] -= 0.1

        df["engagement_score"] = df["engagement_score"].clip(lower=0)

        return df

    # ── persistence ─────────────────────────────────────────────────────
    def _dataframe_to_docs(
        self, df: pd.DataFrame, session_id: str
    ) -> List[dict]:
        """Convert the processed DataFrame into a list of MongoDB documents."""
        now = datetime.utcnow()
        docs: List[dict] = []

        for _, row in df.iterrows():
            docs.append({
                "sessionId": session_id,
                "studentId": row["studentId"],
                "questionId": row["questionId"],
                "attempt_status": int(row["attempt_status"]),
                "is_correct": int(row["is_correct"]),
                "response_time_sec": float(row["response_time_sec"]),
                "rtt_ms": float(row["rtt_ms"]),
                "jitter_ms": float(row["jitter_ms"]),
                "net_retrieved": int(row["net_retrieved"]),
                "engagement_score": float(row["engagement_score"]),
                "engagement_score_scaled": float(row["engagement_score_scaled"]),
                "processedAt": now,
            })

        return docs

    async def _store(self, db, session_id: str, docs: List[dict]) -> None:
        """Replace all preprocessed docs for this session."""
        # Remove previous results for this session
        await db[self.COLLECTION].delete_many({"sessionId": session_id})

        if docs:
            await db[self.COLLECTION].insert_many(docs)

    # ── read-back helper (used by clustering / reports) ─────────────────
    async def get_preprocessed(self, session_id: str) -> List[dict]:
        """Return stored preprocessed engagement data for a session."""
        db = get_database()
        if db is None:
            return []

        results: List[dict] = []
        async for doc in db[self.COLLECTION].find({"sessionId": session_id}):
            doc["_id"] = str(doc["_id"])
            results.append(doc)
        return results

    async def get_student_engagement(
        self, session_id: str, student_id: str
    ) -> List[dict]:
        """Return preprocessed rows for a single student in a session."""
        db = get_database()
        if db is None:
            return []

        results: List[dict] = []
        async for doc in db[self.COLLECTION].find({
            "sessionId": session_id,
            "studentId": student_id,
        }):
            doc["_id"] = str(doc["_id"])
            results.append(doc)
        return results
