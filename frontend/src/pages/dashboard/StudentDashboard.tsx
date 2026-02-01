import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  BellIcon,
  TrendingUpIcon,
  ActivityIcon,
  CalendarIcon,
  WifiIcon,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import { useSessionConnection } from "../../context/SessionConnectionContext";
import { useLatencyMonitor } from "../../hooks/useLatencyMonitor";
import { ConnectionQualityBadge } from "../../components/engagement/ConnectionQualityIndicator";
import { sessionService, Session } from "../../services/sessionService";
import { quizService } from "../../services/quizService";
import { isWithinNext24Hours, normalizeStatus } from "../../utils/sessionFilters";
import { toast } from "sonner";

// =====================================================
// 🔔 NOTIFICATION HELPERS
// =====================================================

// Play notification sound when quiz arrives
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a more noticeable notification sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Play a pleasant two-tone notification
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.15); // C#6
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
    
    console.log("🔊 Notification sound played");
  } catch (error) {
    console.log("Could not play notification sound:", error);
  }
};

// Show browser notification
const showBrowserNotification = (title: string, body: string) => {
  // Check if browser notifications are supported
  if (!("Notification" in window)) {
    console.log("Browser doesn't support notifications");
    return;
  }
  
  // Request permission if not granted
  if (Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: "📝",
      tag: "quiz-notification",
      requireInteraction: true, // Keep notification until user interacts
    });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, {
          body,
          icon: "📝",
          tag: "quiz-notification",
        });
      }
    });
  }
};

// Quiz popup is rendered globally in DashboardLayout so students receive questions on any page.

// --------------------------------------
// MAIN COMPONENT
// --------------------------------------
export const StudentDashboard = () => {
  const { user } = useAuth();
  const { connectedSessionId, incomingQuiz, receiveQuizFromPoll, sessionStatsInvalidated } = useSessionConnection();
  const [sessions, setSessions] = useState<Session[]>([]);
  const lastCountedQuestionIdRef = useRef<string | null>(null);

  const [sessionQuizStats, setSessionQuizStats] = useState({
    questionsReceived: 0,
    questionsAnswered: 0,
    correctAnswers: 0,
  });

  const studentDisplayName = user
    ? (user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`.trim()
        : user.firstName || user.lastName || user.email?.split("@")[0] || "Student")
    : "Student";

  const {
    currentRtt,
    quality: connectionQuality,
    stats: latencyStats,
    isMonitoring: isLatencyMonitoring,
  } = useLatencyMonitor({
    sessionId: connectedSessionId,
    studentId: user?.id,
    studentName: studentDisplayName,
    userRole: "student",
    enabled: !!connectedSessionId && !!user?.id,
    pingInterval: 3000,
    reportInterval: 5000,
  });

  // ===========================================================
  // ⭐ LOAD REAL SESSIONS FROM BACKEND - Next 24h upcoming/live only
  // ===========================================================
  const loadSessions = useCallback(async () => {
    const allSessions = await sessionService.getAllSessions();
    const statusOk = (s: Session) => {
      const status = normalizeStatus(s.status);
      return status === "upcoming" || status === "live";
    };
    const filtered = allSessions.filter(
      s => statusOk(s) && isWithinNext24Hours(s)
    );
    const byId = new Map<string, Session>();
    filtered.forEach(s => byId.set(s.id, s));
    const deduped = Array.from(byId.values());
    const sorted = [...deduped].sort((a, b) => {
      const tA = `${a.date}T${a.time || "00:00"}`;
      const tB = `${b.date}T${b.time || "00:00"}`;
      return new Date(tA).getTime() - new Date(tB).getTime();
    });
    setSessions(sorted.slice(0, 20));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    refreshIntervalRef.current = setInterval(loadSessions, 60000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [loadSessions]);

  // ===========================================================
  // 📊 REHYDRATE: Load persisted session stats on mount/refresh and after submit (no double-count)
  // ===========================================================
  useEffect(() => {
    const sessionId = connectedSessionId || localStorage.getItem("connectedSessionId");
    if (!sessionId || !user?.id) return;

    const loadStats = async () => {
      const stats = await quizService.getSessionStats(sessionId);
      setSessionQuizStats({
        questionsReceived: stats.questionsReceived ?? 0,
        questionsAnswered: stats.questionsAnswered ?? 0,
        correctAnswers: stats.correctAnswers ?? 0,
      });
    };

    loadStats();
  }, [connectedSessionId, user?.id, sessionStatsInvalidated]);

  // ===========================================================
  // 📊 REAL-TIME: Increment "Questions Given" when new quiz arrives (no refresh)
  // ===========================================================
  useEffect(() => {
    const qid = incomingQuiz?.questionId ?? incomingQuiz?.question_id ?? null;
    if (!qid || lastCountedQuestionIdRef.current === qid) return;
    lastCountedQuestionIdRef.current = qid;
    setSessionQuizStats(prev => ({ ...prev, questionsReceived: prev.questionsReceived + 1 }));
  }, [incomingQuiz?.questionId, incomingQuiz?.question_id]);

  // ===========================================================
  // 📬 FETCH MISSED QUIZ WHEN DASHBOARD LOADS (e.g. after clicking push notification)
  // ===========================================================
  useEffect(() => {
    const sessionId = connectedSessionId || localStorage.getItem("connectedSessionId");
    if (!sessionId || !user?.id) return;

    const fetchLatestQuiz = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const res = await fetch(`${apiUrl}/api/live/latest-quiz/${sessionId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
        });
        const data = await res.json();
        if (data.success && data.quiz) receiveQuizFromPoll(data.quiz);
      } catch (e) {
        console.error("Failed to fetch latest quiz:", e);
      }
    };

    fetchLatestQuiz();
    const onVisible = () => {
      if (document.visibilityState === "visible" && (connectedSessionId || localStorage.getItem("connectedSessionId"))) {
        fetchLatestQuiz();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user?.id, connectedSessionId, receiveQuizFromPoll]);

  // ===========================================================
  // 📬 POLL FOR QUIZ EVERY 15s WHILE CONNECTED (fallback if WebSocket misses)
  // ===========================================================
  useEffect(() => {
    const sessionId = connectedSessionId || localStorage.getItem("connectedSessionId");
    if (!sessionId || !user?.id) return;

    const poll = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const res = await fetch(`${apiUrl}/api/live/latest-quiz/${sessionId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
        });
        const data = await res.json();
        if (data.success && data.quiz) receiveQuizFromPoll(data.quiz);
      } catch (e) {
        // ignore
      }
    };

    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [connectedSessionId, user?.id, receiveQuizFromPoll]);

  // ===========================================================
  // 🎯 JOINING IS ONLY VIA MEETINGS PAGE — Dashboard is view-only
  // ===========================================================

  // ===========================================================
  // ⭐ GLOBAL WebSocket — Real-time session list + announcements (no refresh)
  // ===========================================================
  useEffect(() => {
    if (!user?.id) return;

    const wsBase =
      import.meta.env.VITE_WS_URL ||
      (import.meta.env.VITE_API_URL || "").replace("/api", "").replace("http", "ws") ||
      "ws://localhost:8000";
    const socketUrl = `${wsBase}/ws/global/${user.id}`;

    const ws = new WebSocket(socketUrl);

    ws.onopen = () => console.log("🌍 [StudentDashboard] Global WS connected");
    ws.onclose = () => console.log("❌ [StudentDashboard] Global WS closed");
    ws.onerror = (err) => console.error("Global WS ERROR:", err);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "session_started") {
          loadSessions();
          toast.success("Meeting is now live!");
        }

        if (data.type === "meeting_ended") {
          loadSessions();
          toast.info("Meeting has ended");
        }
      } catch (e) {
        console.error("Global WS JSON ERROR:", e);
      }
    };

    return () => ws.close();
  }, [user?.id, loadSessions]);

  // ===========================================================
  // UI RENDER
  // When student has enrolled meetings: show ONLY the meeting list (dashboard = meeting list).
  // When no meetings: show welcome + summary + empty state.
  // ===========================================================
  const hasMeetings = sessions.length > 0;

  return (
    <div className="py-6">
      {/* When student has enrolled meetings: dashboard is only the meeting list */}
      {hasMeetings ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
              Your meetings
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              {connectedSessionId && (
                <Link to="/dashboard/sessions" className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm border text-blue-600 hover:opacity-90 text-sm">
                  <WifiIcon className="h-4 w-4" />
                  <ConnectionQualityBadge quality={connectionQuality} rtt={currentRtt} isMonitoring={isLatencyMonitoring} />
                  <span className="font-medium">In meeting · Manage</span>
                </Link>
              )}
              <Link to="/dashboard/sessions" className="text-sm font-medium" style={{ color: '#3B82F6' }}>
                Join from Meetings →
              </Link>
              <Link to="/dashboard/student/engagement">
                <Button variant="outline" size="sm" leftIcon={<ActivityIcon className="h-4 w-4" />}>
                  Engagement
                </Button>
              </Link>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            View-only. Go to <Link to="/dashboard/sessions" className="text-blue-600 hover:underline">Meetings</Link> to join.
          </p>

          {connectedSessionId && (
            <div className="p-3 rounded-lg bg-white shadow border border-blue-100 flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-blue-700">In session:</span>
              <span className="text-sm text-gray-600">
                Questions: {sessionQuizStats.questionsReceived} · Correct: {sessionQuizStats.correctAnswers}/{sessionQuizStats.questionsAnswered}
              </span>
              <Link to="/dashboard/sessions" className="text-xs text-blue-600 hover:underline">Go to Meetings →</Link>
            </div>
          )}

          {/* Meeting list only — no big summary block */}
          <div className="space-y-4">
            {sessions.filter(s => s.isStandalone === true).length > 0 && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-3 border-b">
                  <h4 className="text-sm font-semibold text-gray-900">Standalone meetings</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Meetings you enrolled in with a key</p>
                </div>
                {sessions.filter(s => s.isStandalone === true).map((session) => {
                  const sessionKey = session.zoomMeetingId || session.id;
                  const isConnectedToThis = connectedSessionId === sessionKey;
                  return (
                    <div key={session.id} className="px-4 py-4 border-t hover:bg-gray-50" style={isConnectedToThis ? { backgroundColor: '#eff6ff' } : {}}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium" style={{ color: '#3B82F6' }}>{session.title}</p>
                            {session.status === 'live' && <Badge variant="danger" className="bg-red-600 text-white text-xs">LIVE</Badge>}
                            {isConnectedToThis && <Badge variant="success" className="text-white text-xs" style={{ backgroundColor: '#3B82F6' }}>CONNECTED</Badge>}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{session.course} · {session.instructor}</p>
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                            <CalendarIcon className="h-3 w-3" />
                            {session.date} · {session.time}
                          </p>
                        </div>
                        <Link to="/dashboard/sessions" className="text-xs text-blue-600 hover:underline whitespace-nowrap">Join from Meetings →</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {sessions.filter(s => !s.isStandalone).length > 0 && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-3 border-b">
                  <h4 className="text-sm font-semibold text-gray-900">Course meetings</h4>
                  <p className="text-xs text-gray-500 mt-0.5">From your enrolled courses</p>
                </div>
                {sessions.filter(s => !s.isStandalone).map((session) => {
                  const sessionKey = session.zoomMeetingId || session.id;
                  const isConnectedToThis = connectedSessionId === sessionKey;
                  return (
                    <div key={session.id} className="px-4 py-4 border-t hover:bg-gray-50" style={isConnectedToThis ? { backgroundColor: '#eff6ff' } : {}}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium" style={{ color: '#3B82F6' }}>{session.title}</p>
                            {session.status === 'live' && <Badge variant="danger" className="bg-red-600 text-white text-xs">LIVE</Badge>}
                            {isConnectedToThis && <Badge variant="success" className="text-white text-xs" style={{ backgroundColor: '#3B82F6' }}>CONNECTED</Badge>}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{session.course} · {session.instructor}</p>
                          <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                            <CalendarIcon className="h-3 w-3" />
                            {session.date} · {session.time}
                          </p>
                        </div>
                        <Link to="/dashboard/sessions" className="text-xs text-blue-600 hover:underline whitespace-nowrap">Join from Meetings →</Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* No enrolled meetings: show welcome + full summary + empty state */
        <>
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Welcome back, {user?.firstName || "Student"}!</h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-500">Here's what's happening with your courses today.</p>
            </div>
            <div className="flex items-center gap-3">
              {connectedSessionId && (
                <Link to="/dashboard/sessions" className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm border text-blue-600 hover:opacity-90">
                  <WifiIcon className="h-4 w-4" />
                  <ConnectionQualityBadge quality={connectionQuality} rtt={currentRtt} isMonitoring={isLatencyMonitoring} />
                  <span className="text-sm font-medium">In meeting · Manage on Meetings</span>
                </Link>
              )}
              <Link to="/dashboard/student/engagement" className="w-full sm:w-auto">
                <Button variant="primary" leftIcon={<ActivityIcon className="h-4 w-4" />} fullWidth className="sm:w-auto">View Engagement</Button>
              </Link>
            </div>
          </div>

          <div className="mb-8 text-white rounded-xl shadow-lg p-6" style={{ background: 'linear-gradient(to right, #3B82F6, #2563eb)' }}>
            <div>
              <h2 className="text-xl font-bold">Your Learning Summary</h2>
              <p className="mt-1" style={{ color: '#d1f5e8' }}>You are in <span className="font-semibold">Active Participants</span></p>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="bg-white bg-opacity-10 rounded-lg p-4">
                <WifiIcon className="h-6 w-6" style={{ color: "#b8e6d4" }} />
                <p className="text-sm font-medium">Connection</p>
                <p className="text-lg font-bold">
                  {connectedSessionId ? (
                    <span style={{ color: "#b8e6d4" }} className="capitalize">{connectionQuality}{currentRtt != null && <span className="text-sm font-normal opacity-90 ml-1">{Math.round(currentRtt)}ms{latencyStats?.jitter != null && ` · ${Math.round(latencyStats.jitter)}ms jitter`}</span>}</span>
                  ) : (
                    <span className="text-gray-300">Not in session</span>
                  )}
                </p>
              </div>
              <div className="bg-white bg-opacity-10 rounded-lg p-4">
                <BellIcon className="h-6 w-6 text-yellow-300" />
                <p className="text-sm font-medium">Questions Given</p>
                <p className="text-lg font-bold">{sessionQuizStats.questionsReceived}</p>
              </div>
              <div className="bg-white bg-opacity-10 rounded-lg p-4">
                <TrendingUpIcon className="h-6 w-6" style={{ color: '#b8e6d4' }} />
                <p className="text-sm font-medium">Correct Answers</p>
                <p className="text-lg font-bold">{sessionQuizStats.correctAnswers}<span className="text-sm font-normal" style={{ color: '#c5edd9' }}> / {sessionQuizStats.questionsAnswered}</span></p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">Upcoming Meetings (next 24 hours)</h3>
              <Link to="/dashboard/sessions"><span className="text-sm hover:opacity-80" style={{ color: '#3B82F6' }}>Join from Meetings →</span></Link>
            </div>
            <p className="text-xs text-gray-500 mt-1">View-only. Go to <Link to="/dashboard/sessions" className="text-blue-600 hover:underline">Meetings</Link> to join.</p>
            {connectedSessionId && (
              <div className="p-3 rounded-lg bg-white shadow mt-4" style={{ borderColor: "#3B82F6", borderWidth: "1px" }}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#3B82F6" }} />
                    <span className="text-sm font-medium" style={{ color: "#2563eb" }}>Connected to session</span>
                    <ConnectionQualityBadge quality={connectionQuality} rtt={currentRtt} isMonitoring={isLatencyMonitoring} className="ml-1" />
                  </div>
                  <Link to="/dashboard/sessions" className="text-xs font-medium text-blue-600 hover:underline">Go to Meetings →</Link>
                </div>
              </div>
            )}
            <div className="bg-white shadow rounded-lg px-4 py-8 text-center text-gray-500 mt-4">
              <p className="text-sm">No meetings in the next 24 hours</p>
              <Link to="/dashboard/sessions" className="text-sm text-blue-600 hover:underline mt-2 inline-block">Go to Meetings</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
