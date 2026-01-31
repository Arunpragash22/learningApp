import type { Session } from "../services/sessionService";

/**
 * Parses session date and time into a single Date (local timezone).
 */
export function getSessionStartDate(session: Session): Date | null {
  const d = session.date;
  const t = session.time || "00:00";
  if (!d) return null;
  const dateStr = d.includes("T") ? d.slice(0, 10) : d.slice(0, 10);
  const combined = `${dateStr}T${t}`;
  const parsed = new Date(combined);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * True if the session should be shown on the dashboard: upcoming or live,
 * and for upcoming sessions, start time is within the next 24 hours.
 */
export function isWithinNext24Hours(session: Session): boolean {
  if (session.status === "live") return true;
  if (session.status !== "upcoming") return false;
  const start = getSessionStartDate(session);
  if (!start) return false;
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return start >= now && start <= in24h;
}
