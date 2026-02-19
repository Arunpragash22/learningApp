"""
Feedback Service
================

Ports the Colab personalized-feedback model (Model-2) to work
with MongoDB data instead of CSV file uploads.

Data sources (all from MongoDB):
  - quiz_answers        → is_correct, timeTaken, questionId, studentId
  - users               → firstName, lastName, email
  - clusters            → engagementLevel (active / moderate / passive)
  - latency_metrics     → avg_rtt_ms, avg_jitter_ms
  - session_participants→ studentId list

The feedback generation logic is kept EXACTLY as the original Colab notebook.
"""

import io
import csv
import numpy as np
import pandas as pd
from typing import List, Dict, Optional, Tuple
from ..database.connection import get_database


POOR_RTT = 3000
POOR_JITTER = 1500


# ── Column-name aliases (match Colab notebook expectations) ──────
_COL_ADM = "student_id"
_COL_CORRECT = "is_correct"
_COL_NAME = "student_name"
_COL_EMAIL = "email"
_COL_QID = "question_id"
_COL_RT = "response_time_sec"
_COL_RTT = "rtt_ms"
_COL_JITTER = "jitter_ms"
_COL_NETQ = "network_quality"
_COL_CLUSTER = "engagement_label"


def _net_quality_label(rtt: float, jitter: float) -> str:
    if rtt > POOR_RTT or jitter > POOR_JITTER:
        return "poor"
    if rtt > 1500 or jitter > 750:
        return "fair"
    return "good"


async def _fetch_raw_data(
    session_id: str,
) -> Tuple[pd.DataFrame, Dict[str, dict]]:
    """
    Pull quiz_answers + latency + cluster info from MongoDB and
    return a DataFrame shaped like the Colab CSV plus a user-info dict.
    """
    db = get_database()
    if db is None:
        return pd.DataFrame(), {}

    # Resolve alternate session IDs (MongoDB _id ↔ Zoom meeting ID)
    all_ids = [session_id]
    try:
        from bson import ObjectId
        if len(session_id) == 24:
            try:
                doc = await db.sessions.find_one(
                    {"_id": ObjectId(session_id)}, {"zoomMeetingId": 1}
                )
                if doc and doc.get("zoomMeetingId"):
                    z = str(doc["zoomMeetingId"])
                    if z not in all_ids:
                        all_ids.append(z)
            except Exception:
                pass
        for variant in ([session_id] + ([int(session_id)] if session_id.isdigit() else [])):
            doc = await db.sessions.find_one(
                {"zoomMeetingId": variant}, {"_id": 1, "zoomMeetingId": 1}
            )
            if doc:
                mid = str(doc["_id"])
                if mid not in all_ids:
                    all_ids.append(mid)
                zv = doc.get("zoomMeetingId")
                if zv and str(zv) not in all_ids:
                    all_ids.append(str(zv))
    except Exception:
        pass

    id_filter = {"sessionId": {"$in": all_ids}}

    # ── quiz_answers ────────────────────────────────────────────────
    answers: List[dict] = []
    async for a in db.quiz_answers.find(id_filter):
        ns = a.get("networkStrength") or {}
        answers.append({
            _COL_ADM: a.get("studentId", ""),
            _COL_QID: a.get("questionId", ""),
            _COL_CORRECT: 1 if a.get("isCorrect") else 0,
            _COL_RT: float(a.get("timeTaken", 0)),
            _COL_RTT: float(ns.get("rttMs", 0)),
            _COL_JITTER: float(ns.get("jitterMs", 0)),
        })

    if not answers:
        return pd.DataFrame(), {}

    df = pd.DataFrame(answers)

    # ── latency_metrics (supplement zeros) ──────────────────────────
    latency_map: Dict[str, dict] = {}
    for sid in all_ids:
        async for doc in db.latency_metrics.find({"session_id": sid}):
            s = doc.get("student_id")
            if s:
                latency_map[s] = {
                    "rtt": float(doc.get("avg_rtt_ms", 0)),
                    "jitter": float(doc.get("avg_jitter_ms", 0)),
                }

    def _fill_latency(row):
        if row[_COL_RTT] == 0 and row[_COL_JITTER] == 0:
            lat = latency_map.get(row[_COL_ADM], {})
            row[_COL_RTT] = lat.get("rtt", 0)
            row[_COL_JITTER] = lat.get("jitter", 0)
        return row

    df = df.apply(_fill_latency, axis=1)
    df[_COL_NETQ] = df.apply(
        lambda r: _net_quality_label(r[_COL_RTT], r[_COL_JITTER]), axis=1
    )

    # ── cluster labels ──────────────────────────────────────────────
    cluster_map: Dict[str, str] = {}
    for sid in all_ids:
        async for c in db.clusters.find({"sessionId": sid}):
            level = c.get("engagementLevel", "")
            for s in c.get("students", []):
                cluster_map[s] = level

    df[_COL_CLUSTER] = df[_COL_ADM].map(cluster_map).fillna("moderate")

    # ── user info ───────────────────────────────────────────────────
    from bson import ObjectId as OID
    unique_sids = df[_COL_ADM].unique().tolist()
    user_info: Dict[str, dict] = {}
    obj_ids = []
    for s in unique_sids:
        if len(s) == 24:
            try:
                obj_ids.append(OID(s))
            except Exception:
                pass

    if obj_ids:
        async for u in db.users.find(
            {"_id": {"$in": obj_ids}},
            {"firstName": 1, "lastName": 1, "email": 1}
        ):
            uid = str(u["_id"])
            first = u.get("firstName", "")
            last = u.get("lastName", "")
            user_info[uid] = {
                "name": f"{first} {last}".strip() or f"Student {uid[:8]}",
                "email": u.get("email", ""),
            }

    df[_COL_NAME] = df[_COL_ADM].map(
        lambda s: user_info.get(s, {}).get("name", f"Student {s[:8]}")
    )
    df[_COL_EMAIL] = df[_COL_ADM].map(
        lambda s: user_info.get(s, {}).get("email", "")
    )

    return df, user_info


# ── Aggregation (same as Colab section 2) ────────────────────────

def _mode_or_first(s):
    s = s.dropna()
    if len(s) == 0:
        return None
    m = s.mode()
    return m.iloc[0] if len(m) else s.iloc[0]


def _normalize_cluster_label(x):
    if pd.isna(x):
        return "Moderate"
    s = str(x).strip().lower()
    if s in ("active", "high", "engaged", "high_engagement", "high engagement"):
        return "Active"
    if s in ("moderate", "medium", "mid", "average", "moderate_engagement", "moderate engagement"):
        return "Moderate"
    if s in ("passive", "low", "disengaged", "low_engagement", "low engagement"):
        return "Passive"
    return str(x).strip()


def _aggregate_per_student(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame()

    group_cols = [_COL_ADM, _COL_NAME, _COL_EMAIL]

    agg: dict = {
        "total_attempts": (_COL_CORRECT, "count"),
        "correct_sum": (_COL_CORRECT, "sum"),
        "accuracy": (_COL_CORRECT, "mean"),
        "unique_questions": (_COL_QID, pd.Series.nunique),
        "median_rt_sec": (_COL_RT, "median"),
        "median_rtt_ms": (_COL_RTT, "median"),
        "median_jitter_ms": (_COL_JITTER, "median"),
    }

    def _poor_ratio(s):
        s = s.dropna().astype(str).str.strip().str.lower()
        if len(s) == 0:
            return np.nan
        return (s == "poor").mean()

    agg["poor_net_ratio"] = (_COL_NETQ, _poor_ratio)
    agg["net_quality_mode"] = (_COL_NETQ, _mode_or_first)
    agg["cluster_label_raw"] = (_COL_CLUSTER, _mode_or_first)

    students = df.groupby(group_cols, dropna=False).agg(**agg).reset_index()
    students["cluster_label"] = students["cluster_label_raw"].apply(
        _normalize_cluster_label
    )
    return students


# ── Feedback generator (Model-2) — EXACT Colab logic ────────────

def _safe_name(x):
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "Student"
    s = str(x).strip()
    return s.title() if s else "Student"


def _pct(x):
    return "N/A" if pd.isna(x) else f"{int(round(float(x) * 100))}%"


def _num(x, nd=1):
    return "N/A" if pd.isna(x) else str(round(float(x), nd))


def _generate_feedback(r) -> dict:
    """
    Generate personalized feedback for one student row.
    Returns a dict with structured feedback data.
    """
    name = _safe_name(r.get(_COL_NAME))

    label = r.get("cluster_label", "Moderate")
    if label not in ("Active", "Moderate", "Passive"):
        label = "Moderate"

    total = int(r.get("total_attempts", 0)) if not pd.isna(r.get("total_attempts", np.nan)) else 0
    correct = int(round(r.get("correct_sum", 0))) if not pd.isna(r.get("correct_sum", np.nan)) else 0
    acc = r.get("accuracy", np.nan)

    intro = {
        "Active": f"Hi {name}, great job staying consistently engaged.",
        "Moderate": f"Hi {name}, you're participating fairly well—good progress so far.",
        "Passive": f"Hi {name}, your engagement is low right now, but you can improve step by step.",
    }[label]

    perf = f"Your accuracy is {_pct(acc)} ({correct}/{total} correct)."

    rt_line = ""
    if "median_rt_sec" in r.index and not pd.isna(r["median_rt_sec"]):
        rt_line = f" Your typical response time is about {_num(r['median_rt_sec'], 1)} seconds."

    net_line = ""
    if "poor_net_ratio" in r.index and not pd.isna(r["poor_net_ratio"]) and float(r["poor_net_ratio"]) >= 0.6:
        net_line = (
            " Your network looks weak in many attempts, so some delays may not be "
            "your fault—try a more stable connection if possible."
        )

    actions: List[str] = []
    if pd.isna(acc):
        actions.append("Attempt a few more questions so we can measure your performance properly")
    elif acc < 0.50:
        actions.append("Review the basics and redo wrong questions slowly to understand mistakes")
        actions.append("Practice 10 easy-to-medium questions on the same topic today")
    elif acc < 0.75:
        actions.append("Focus on your most-missed topics and practice 5 similar questions per topic")
        actions.append("After each quiz, note 2 mistakes and the correct rule/formula")
    else:
        actions.append("Maintain performance with a short mixed practice set after each lesson")
        actions.append("Add 3 harder questions weekly to strengthen weak areas")

    if "median_rt_sec" in r.index and not pd.isna(r["median_rt_sec"]):
        rt = float(r["median_rt_sec"])
        if rt > 120:
            actions.append("Train speed using a 60–90 second timer per MCQ and avoid overthinking")
        elif rt > 60:
            actions.append("Reduce time by eliminating wrong options first before choosing the answer")
        else:
            actions.append("Keep your speed, but double-check units/signs before submitting")

    if label == "Passive":
        actions.append("Set a small goal: attempt at least 3 questions daily this week to build consistency")
    elif label == "Moderate":
        actions.append("Attempt quizzes on the same day they are shared to move into the Active group")
    else:
        actions.append("Keep momentum by adding one extra weekly revision session")

    next_steps = "Next steps: " + "; ".join(actions[:3]) + "."
    close = "Tell me one topic you find hardest, and I'll suggest a short mini-plan."

    full_text = " ".join([intro, perf + rt_line + net_line, next_steps, close])

    # Determine feedback type for the UI card
    if label == "Active":
        fb_type = "achievement"
    elif label == "Passive":
        fb_type = "warning" if (not pd.isna(acc) and acc < 0.5) else "improvement"
    else:
        fb_type = "encouragement"

    return {
        "type": fb_type,
        "message": full_text,
        "clusterContext": f"{label} Participants",
        "suggestions": actions[:3],
        "cluster_label": label,
    }


# ── Public API ───────────────────────────────────────────────────

async def get_student_feedback(
    session_id: str, student_id: str
) -> Optional[dict]:
    """Get personalized feedback for a single student in a session."""
    df, _ = await _fetch_raw_data(session_id)
    if df.empty:
        return None

    student_df = df[df[_COL_ADM] == student_id]
    if student_df.empty:
        return None

    agg = _aggregate_per_student(student_df)
    if agg.empty:
        return None

    row = agg.iloc[0]
    fb = _generate_feedback(row)
    fb["studentId"] = student_id
    fb["studentName"] = row.get(_COL_NAME, "")
    fb["accuracy"] = float(row["accuracy"]) if not pd.isna(row.get("accuracy")) else None
    fb["totalAttempts"] = int(row.get("total_attempts", 0))
    fb["correctAnswers"] = int(round(row.get("correct_sum", 0)))
    fb["medianResponseTime"] = float(row.get("median_rt_sec", 0)) if not pd.isna(row.get("median_rt_sec")) else None
    return fb


async def get_session_feedback(session_id: str) -> List[dict]:
    """Get personalized feedback for ALL students in a session."""
    df, _ = await _fetch_raw_data(session_id)
    if df.empty:
        return []

    students = _aggregate_per_student(df)
    if students.empty:
        return []

    results = []
    for _, row in students.iterrows():
        fb = _generate_feedback(row)
        fb["studentId"] = row[_COL_ADM]
        fb["studentName"] = row.get(_COL_NAME, "")
        fb["email"] = row.get(_COL_EMAIL, "")
        fb["accuracy"] = float(row["accuracy"]) if not pd.isna(row.get("accuracy")) else None
        fb["totalAttempts"] = int(row.get("total_attempts", 0))
        fb["correctAnswers"] = int(round(row.get("correct_sum", 0)))
        fb["medianResponseTime"] = float(row.get("median_rt_sec", 0)) if not pd.isna(row.get("median_rt_sec")) else None
        fb["cluster_label"] = row.get("cluster_label", "Moderate")
        results.append(fb)

    return results


async def generate_feedback_csv(session_id: str) -> str:
    """Generate CSV string matching the Colab output format."""
    df, _ = await _fetch_raw_data(session_id)
    if df.empty:
        return ""

    students = _aggregate_per_student(df)
    if students.empty:
        return ""

    students["personalized_feedback"] = students.apply(_generate_feedback_text, axis=1)

    export_cols = [
        _COL_ADM, _COL_NAME, _COL_EMAIL,
        "cluster_label", "total_attempts", "correct_sum", "accuracy",
        "unique_questions", "median_rt_sec",
        "median_rtt_ms", "median_jitter_ms",
        "poor_net_ratio", "net_quality_mode",
        "personalized_feedback",
    ]
    export_cols = [c for c in export_cols if c in students.columns]

    output = io.StringIO()
    students[export_cols].to_csv(output, index=False)
    return output.getvalue()


def _generate_feedback_text(r) -> str:
    """Plain-text version for CSV export (same as Colab)."""
    fb = _generate_feedback(r)
    return fb["message"]
