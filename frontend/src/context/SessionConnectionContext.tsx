/**
 * Global session connection and quiz delivery.
 * - Single WebSocket per student per session (app-wide, not page-dependent).
 * - Questions delivered regardless of which tab/page the user is on.
 * - Deduplication: same question is not re-triggered when switching tabs.
 * - Rehydration: answered question IDs from backend so refresh does not re-deliver or double-count.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import type { Session } from "../services/sessionService";
import { quizService } from "../services/quizService";
import { toast } from "sonner";

const STORAGE_KEY = "connectedSessionId";
const WS_PING_INTERVAL_MS = 15000;

interface SessionConnectionContextType {
  connectedSessionId: string | null;
  incomingQuiz: any | null;
  clearIncomingQuiz: () => void;
  joinSession: (session: Session) => void;
  leaveSession: () => void;
  /** Push quiz from poll/fetch into same dedupe flow so no duplicate popup */
  receiveQuizFromPoll: (data: any) => void;
  /** Mark a question as answered (so it is not re-shown or double-counted after refresh). */
  markQuestionAnswered: (questionId: string) => void;
  /** Increments when an answer is submitted; use as dependency to refetch session stats. */
  sessionStatsInvalidated: number;
}

const SessionConnectionContext = createContext<SessionConnectionContextType | undefined>(undefined);

export function SessionConnectionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [connectedSessionId, setConnectedSessionIdState] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
  );
  const [incomingQuiz, setIncomingQuizState] = useState<any | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastShownQuestionIdRef = useRef<string | null>(null);
  const currentSessionKeyRef = useRef<string | null>(null);
  /** Rehydrated + local: question IDs already answered in this session (no re-deliver, no double-count). */
  const answeredQuestionIdsRef = useRef<Set<string>>(new Set());

  const clearIncomingQuiz = useCallback(() => setIncomingQuizState(null), []);

  const [sessionStatsInvalidated, setSessionStatsInvalidated] = useState(0);
  const markQuestionAnswered = useCallback((questionId: string) => {
    answeredQuestionIdsRef.current.add(questionId);
    setSessionStatsInvalidated((n) => n + 1);
  }, []);

  const setConnectedSessionId = useCallback((id: string | null) => {
    setConnectedSessionIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const closeWs = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (_) {}
      wsRef.current = null;
    }
    currentSessionKeyRef.current = null;
  }, []);

  const leaveSession = useCallback(() => {
    closeWs();
    setConnectedSessionId(null);
    setIncomingQuizState(null);
    answeredQuestionIdsRef.current.clear();
    toast.info("Disconnected from session");
  }, [closeWs, setConnectedSessionId]);

  const showQuizIfNew = useCallback((data: any) => {
    const qid = data?.questionId ?? data?.question_id ?? null;
    if (!qid) return;
    if (answeredQuestionIdsRef.current.has(qid)) return;
    if (lastShownQuestionIdRef.current === qid) return;
    lastShownQuestionIdRef.current = qid;
    setIncomingQuizState(data);
  }, []);

  const joinSession = useCallback(
    (session: Session) => {
      if (!user?.id) return;
      const sessionKey = session.zoomMeetingId || session.id;
      if (!session.join_url) {
        toast.error("Zoom join URL missing");
        return;
      }

      window.open(session.join_url, "_blank");

      const studentId = user.id;
      const studentName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email?.split("@")[0] || "Student";
      const studentEmail = user.email || "";
      const wsBase =
        import.meta.env.VITE_WS_URL ||
        (import.meta.env.VITE_API_URL || "").replace("/api", "").replace("http", "ws") ||
        "ws://localhost:8000";
      const url = `${wsBase}/ws/session/${sessionKey}/${studentId}?student_name=${encodeURIComponent(studentName)}&student_email=${encodeURIComponent(studentEmail)}`;

      closeWs();
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setConnectedSessionId(sessionKey);
        currentSessionKeyRef.current = sessionKey;
        wsRef.current = ws;
        toast.success(`Joined "${session.title}"`);
        const sendPing = () => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        };
        sendPing();
        pingIntervalRef.current = setInterval(sendPing, WS_PING_INTERVAL_MS);
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          if (currentSessionKeyRef.current === sessionKey) {
            setConnectedSessionId(null);
            setIncomingQuizState(null);
          }
        }
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      };

      ws.onerror = () => {
        toast.error("Failed to connect to session");
      };

      ws.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "quiz") {
            toast.success("New Quiz Question!", {
              description: data.question || "Answer the quiz now!",
              duration: 10000,
              position: "top-center",
            });
            showQuizIfNew(data);
          } else if (data.type === "meeting_ended") {
            toast.info("Meeting has ended");
            leaveSession();
          }
        } catch (_) {}
      };

      wsRef.current = ws;
    },
    [user, closeWs, setConnectedSessionId, showQuizIfNew]
  );

  /** Restore WebSocket when app loads with connectedSessionId in localStorage (e.g. after refresh). */
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!stored || !user?.id || user?.role === "instructor" || user?.role === "admin") return;
    if (wsRef.current && currentSessionKeyRef.current === stored) return;

    const wsBase =
      import.meta.env.VITE_WS_URL ||
      (import.meta.env.VITE_API_URL || "").replace("/api", "").replace("http", "ws") ||
      "ws://localhost:8000";
    const studentName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email?.split("@")[0] || "Student";
    const url = `${wsBase}/ws/session/${stored}/${user.id}?student_name=${encodeURIComponent(studentName)}&student_email=${encodeURIComponent(user.email || "")}`;

    closeWs();
    const ws = new WebSocket(url);
    ws.onopen = () => {
      setConnectedSessionId(stored);
      currentSessionKeyRef.current = stored;
      wsRef.current = ws;
      const sendPing = () => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      };
      sendPing();
      pingIntervalRef.current = setInterval(sendPing, WS_PING_INTERVAL_MS);
    };
    ws.onclose = () => {
      if (wsRef.current === ws && currentSessionKeyRef.current === stored) {
        setConnectedSessionId(null);
      }
      wsRef.current = null;
      currentSessionKeyRef.current = null;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
    ws.onmessage = (event) => {
      if (event.data === "pong") return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "quiz") showQuizIfNew(data);
        else if (data.type === "meeting_ended") {
          toast.info("Meeting has ended");
          leaveSession();
        }
      } catch (_) {}
    };
    wsRef.current = ws;
    return () => {
      closeWs();
    };
  }, [user?.id, user?.role]);

  const receiveQuizFromPoll = useCallback(
    (data: any) => {
      if (data?.questionId || data?.question_id) showQuizIfNew(data);
    },
    [showQuizIfNew]
  );

  const value: SessionConnectionContextType = {
    connectedSessionId,
    incomingQuiz,
    clearIncomingQuiz,
    joinSession,
    leaveSession,
    receiveQuizFromPoll,
    markQuestionAnswered,
    sessionStatsInvalidated,
  };

  return (
    <SessionConnectionContext.Provider value={value}>
      {children}
    </SessionConnectionContext.Provider>
  );
}

export function useSessionConnection() {
  const ctx = useContext(SessionConnectionContext);
  if (ctx === undefined) throw new Error("useSessionConnection must be used within SessionConnectionProvider");
  return ctx;
}
