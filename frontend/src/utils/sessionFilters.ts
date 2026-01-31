import type { Session } from "../services/sessionService";

/**
 * Normalize status to lowercase for consistent filtering (backend may return mixed case).
 */
export function normalizeStatus(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

/**
 * Parses session date and time into a single Date (local timezone).
 * Handles date as "YYYY-MM-DD" or ISO string; time as "HH:MM" or "HH:MM:SS".
 */
export function getSessionStartDate(session: Session): Date | null {
  const d = session.date;
  const t = session.time || "00:00";
  if (!d) return null;
  const dateStr = typeof d === "string" && d.length >= 10 ? d.slice(0, 10) : "";
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const timePart = typeof t === "string" ? t.trim() : "00:00";
  const combined = `${dateStr}T${timePart.length >= 5 ? timePart : "00:00"}`;
  const parsed = new Date(combined);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * True if the session should be shown on the dashboard: upcoming or live,
 * and for upcoming sessions, start time is within the next 24 hours.
 */
export function isWithinNext24Hours(session: Session): boolean {
  const status = normalizeStatus(session.status);
  if (status === "live") return true;
  if (status !== "upcoming") return false;
  const start = getSessionStartDate(session);
  if (!start) return false;
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return start >= now && start <= in24h;
}
