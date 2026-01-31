import { useEffect, useState, useRef } from "react";
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

// --------------------------------------
// QUIZ POPUP COMPONENT
// --------------------------------------
interface QuizPopupProps {
  quiz: any;
  onClose: () => void;
  onAnswerSubmitted?: (isCorrect: boolean) => void;
  networkStrength?: {
    quality: string;
    rttMs: number | null;
    jitterMs?: number;
  };
}

const QuizPopup = ({ quiz, onClose, onAnswerSubmitted, networkStrength }: QuizPopupProps) => {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState<number>(quiz?.timeLimit || 30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL;

  // Debug: Log the quiz data received
  useEffect(() => {
    console.log("📝 QuizPopup received data:", quiz);
    console.log("   - question:", quiz?.question);
    console.log("   - options:", quiz?.options);
    console.log("   - questionId:", quiz?.questionId);
  }, [quiz]);

  // countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      onClose();
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft, onClose]);

  const handleAnswerClick = async (answerIndex: number) => {
    if (isSubmitting || hasSubmitted) return;
    setIsSubmitting(true);

    try {
      const payload = {
        questionId: quiz?.questionId || quiz?.question_id || "UNKNOWN",
        answerIndex,
        timeTaken: (quiz?.timeLimit || 30) - timeLeft,
        studentId: user?.id || quiz?.studentId || "UNKNOWN",
        sessionId: quiz?.sessionId || quiz?.session_id || "GLOBAL",
        // 📶 Network strength at the moment of answering
        networkStrength: networkStrength ? {
          quality: networkStrength.quality,
          rttMs: networkStrength.rttMs ? Math.round(networkStrength.rttMs) : null,
          jitterMs: networkStrength.jitterMs ? Math.round(networkStrength.jitterMs) : null,
        } : null,
      };

      console.log("📤 Submitting answer:", payload);

      const res = await fetch(`${API_BASE_URL}/api/quiz/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error("Submit failed:", await res.text());
        alert("❌ Failed to submit answer");
      } else {
        const data = await res.json();
        console.log("✅ Answer stored:", data);
        alert(data.isCorrect ? "✅ Correct!" : "❌ Incorrect");
        
        // 📊 Notify parent about answer submission
        onAnswerSubmitted?.(data.isCorrect);
      }

      setHasSubmitted(true);
      onClose();
    } catch (err) {
      console.error("Submit error:", err);
      alert("❌ Error submitting answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safety check - ensure quiz data exists
  if (!quiz) {
    return null;
  }

  // Get options array safely
  const options = quiz.options || quiz.answers || [];
  const questionText = quiz.question || quiz.text || "No question text";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg w-96 max-w-[90vw] shadow-lg">
        <h2 className="text-lg font-bold mb-3">📝 New Quiz</h2>

        {/* Question Text */}
        <p className="font-medium mb-4 text-gray-800">{questionText}</p>

        {/* Options */}
        <div className="space-y-2">
          {options.length > 0 ? (
            options.map((op: string, i: number) => (
              <button
                key={i}
                className="w-full p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                disabled={isSubmitting || hasSubmitted}
                onClick={() => handleAnswerClick(i)}
              >
                <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                {op}
              </button>
            ))
          ) : (
            <p className="text-red-500 text-sm">⚠️ No options available</p>
          )}
        </div>

        {/* Timer and Status */}
        <div className="mt-4 flex justify-between items-center text-sm text-gray-600">
          <span>
            Time Left: <span className={`font-bold ${timeLeft <= 10 ? 'text-red-500' : ''}`}>{timeLeft}s</span>
          </span>
          {isSubmitting && <span style={{ color: '#3B82F6' }}>Sending...</span>}
        </div>

        {/* Close button */}
        <button
          className="mt-4 w-full p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};


// --------------------------------------
// MAIN COMPONENT
// --------------------------------------
export const StudentDashboard = () => {
  const { user } = useAuth();
  const { connectedSessionId, incomingQuiz, clearIncomingQuiz, receiveQuizFromPoll } = useSessionConnection();
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

  // Helper: true if session date is today (dashboard shows only today's sessions)
  const isSessionToday = (session: Session): boolean => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
    const d = session.date;
    if (!d) return false;
    if (d.includes("-") && d.length >= 10) {
      const sessionDateStr = d.slice(0, 10);
      return sessionDateStr === todayStr;
    }
    try {
      const parsed = new Date(d);
      return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === todayStr;
    } catch {
      return false;
    }
  };

  // ===========================================================
  // ⭐ LOAD REAL SESSIONS FROM BACKEND - Today's upcoming/live only
  // ===========================================================
  useEffect(() => {
    const loadSessions = async () => {
      const allSessions = await sessionService.getAllSessions();
      const filtered = allSessions.filter(
        s => (s.status === "upcoming" || s.status === "live") && isSessionToday(s)
      );
      const sorted = [...filtered].sort((a, b) => {
        const tA = `${a.date}T${a.time || "00:00"}`;
        const tB = `${b.date}T${b.time || "00:00"}`;
        return new Date(tA).getTime() - new Date(tB).getTime();
      });
      setSessions(sorted.slice(0, 10));
    };

    loadSessions();
  }, []);

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
          setSessions(prev =>
            prev.map(s =>
              s.id === data.sessionId || s.zoomMeetingId === data.zoomMeetingId || s.zoomMeetingId === data.sessionId
                ? { ...s, status: "live" as const }
                : s
            )
          );
          toast.success("Meeting is now live!");
        }

        if (data.type === "meeting_ended") {
          setSessions(prev =>
            prev.map(s =>
              s.id === data.sessionId || s.zoomMeetingId === data.zoomMeetingId
                ? { ...s, status: "completed" as const }
                : s
            ).filter(s => s.status === "upcoming" || s.status === "live")
          );
          toast.info("Meeting has ended");
        }
      } catch (e) {
        console.error("Global WS JSON ERROR:", e);
      }
    };

    return () => ws.close();
  }, [user?.id]);

  // ===========================================================
  // UI RENDER
  // ===========================================================
  return (
    <div className="py-6">
      {/* QUIZ POPUP */}
      {incomingQuiz && (
        <QuizPopup
          quiz={incomingQuiz}
          onClose={clearIncomingQuiz}
          onAnswerSubmitted={(isCorrect) => {
            setSessionQuizStats(prev => ({
              ...prev,
              questionsAnswered: prev.questionsAnswered + 1,
              correctAnswers: prev.correctAnswers + (isCorrect ? 1 : 0),
            }));
          }}
          networkStrength={{
            quality: connectionQuality,
            rttMs: currentRtt ?? null,
            jitterMs: latencyStats?.jitter,
          }}
        />
      )}

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">
            Welcome back, {user?.firstName || "Student"}!
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            Here's what's happening with your courses today.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Live connection state + network metrics (real-time, no refresh) */}
          {connectedSessionId && (
            <Link to="/dashboard/sessions" className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm border text-blue-600 hover:opacity-90">
              <WifiIcon className="h-4 w-4" />
              <ConnectionQualityBadge
                quality={connectionQuality}
                rtt={currentRtt}
                isMonitoring={isLatencyMonitoring}
              />
              <span className="text-sm font-medium">In meeting · Manage on Meetings</span>
            </Link>
          )}
          
          <Link to="/dashboard/student/engagement" className="w-full sm:w-auto">
            <Button
              variant="primary"
              leftIcon={<ActivityIcon className="h-4 w-4" />}
              fullWidth
              className="sm:w-auto"
            >
              View Engagement
            </Button>
          </Link>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="mb-8 text-white rounded-xl shadow-lg p-6" style={{ background: 'linear-gradient(to right, #3B82F6, #2563eb)' }}>
        <div>
          <h2 className="text-xl font-bold">Your Learning Summary</h2>
          <p className="mt-1" style={{ color: '#d1f5e8' }}>
            You are in <span className="font-semibold">Active Participants</span>
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Live network metrics — RTT, jitter, quality (real-time) */}
          <div className="bg-white bg-opacity-10 rounded-lg p-4">
            <WifiIcon className="h-6 w-6" style={{ color: "#b8e6d4" }} />
            <p className="text-sm font-medium">Connection</p>
            <p className="text-lg font-bold">
              {connectedSessionId ? (
                <span style={{ color: "#b8e6d4" }} className="capitalize">
                  {connectionQuality}
                  {currentRtt != null && (
                    <span className="text-sm font-normal opacity-90 ml-1">
                      {Math.round(currentRtt)}ms
                      {latencyStats?.jitter != null && ` · ${Math.round(latencyStats.jitter)}ms jitter`}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-gray-300">Not in session</span>
              )}
            </p>
          </div>

          {/* Questions - Count of questions instructor has given this session */}
          <div className="bg-white bg-opacity-10 rounded-lg p-4">
            <BellIcon className="h-6 w-6 text-yellow-300" />
            <p className="text-sm font-medium">Questions Given</p>
            <p className="text-lg font-bold">{sessionQuizStats.questionsReceived}</p>
          </div>

          {/* Quiz Stats - Correct answers / total questions for this session */}
          <div className="bg-white bg-opacity-10 rounded-lg p-4">
            <TrendingUpIcon className="h-6 w-6" style={{ color: '#b8e6d4' }} />
            <p className="text-sm font-medium">Correct Answers</p>
            <p className="text-lg font-bold">
              {sessionQuizStats.correctAnswers}
              <span className="text-sm font-normal" style={{ color: '#c5edd9' }}>
                {" "}/ {sessionQuizStats.questionsAnswered}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Meetings Section */}
      <div>
        {/* MEETINGS SECTIONS */}
        <div className="space-y-4">
          {/* Header with View All Link */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Today&apos;s Upcoming Meetings</h3>
            <Link to="/dashboard/sessions">
              <span className="text-sm hover:opacity-80" style={{ color: '#3B82F6' }}>Join from Meetings →</span>
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            View-only. Go to <Link to="/dashboard/sessions" className="text-blue-600 hover:underline">Meetings</Link> to join.
          </p>

          {/* Live connection status + real-time metrics */}
          {connectedSessionId && (
            <div className="p-3 rounded-lg bg-white shadow" style={{ borderColor: "#3B82F6", borderWidth: "1px" }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: "#3B82F6" }}
                  />
                  <span className="text-sm font-medium" style={{ color: "#2563eb" }}>
                    Connected to session
                  </span>
                  <ConnectionQualityBadge
                    quality={connectionQuality}
                    rtt={currentRtt}
                    isMonitoring={isLatencyMonitoring}
                    className="ml-1"
                  />
                </div>
                <Link to="/dashboard/sessions" className="text-xs font-medium text-blue-600 hover:underline">
                  Go to Meetings →
                </Link>
              </div>
              <p className="text-xs mt-1 text-gray-500">
                {isLatencyMonitoring && currentRtt != null
                  ? `Live: ${Math.round(currentRtt)}ms RTT${latencyStats?.jitter != null ? ` · ${Math.round(latencyStats.jitter)}ms jitter` : ""} · ${connectionQuality}`
                  : "View-only here. Join or leave from the Meetings page."}
              </p>
            </div>
          )}

          {sessions.length === 0 ? (
            <div className="bg-white shadow rounded-lg px-4 py-8 text-center text-gray-500">
              <p className="text-sm">No meetings today</p>
              <Link to="/dashboard/sessions" className="text-sm text-blue-600 hover:underline mt-2 inline-block">Go to Meetings</Link>
            </div>
          ) : (
            <>
              {/* STANDALONE MEETINGS SECTION */}
              {sessions.filter(s => s.isStandalone === true).length > 0 && (
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-3 border-b">
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <span className="text-indigo-600"></span>
                      Standalone Meetings
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Meetings you've enrolled in with a key
                    </p>
                  </div>
                  {sessions.filter(s => s.isStandalone === true).map((session) => {
                    const sessionKey = session.zoomMeetingId || session.id;
                    const isConnectedToThis = connectedSessionId === sessionKey;
                    return (
                      <div key={session.id} className="px-4 py-4 border-t hover:bg-gray-50" style={isConnectedToThis ? { backgroundColor: '#eff6ff' } : {}}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium" style={{ color: '#3B82F6' }}>
                                {session.title}
                              </p>
                              {session.status === 'live' && (
                                <Badge variant="danger" className="bg-red-600 text-white text-xs">LIVE</Badge>
                              )}
                              {isConnectedToThis && (
                                <Badge variant="success" className="text-white text-xs" style={{ backgroundColor: '#3B82F6' }}>CONNECTED</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {session.course} • {session.instructor}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                              <CalendarIcon className="h-3 w-3" />
                              {session.date} • {session.time}
                            </p>
                          </div>
                          <Link to="/dashboard/sessions" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                            Join from Meetings →
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* COURSE MEETINGS SECTION */}
              {sessions.filter(s => !s.isStandalone).length > 0 && (
                <div className="bg-white shadow rounded-lg">
                  <div className="px-4 py-3 border-b">
                    <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <span className="text-blue-600"></span>
                      Course Meetings
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Meetings from your enrolled courses
                    </p>
                  </div>
                  {sessions.filter(s => !s.isStandalone).map((session) => {
                    const sessionKey = session.zoomMeetingId || session.id;
                    const isConnectedToThis = connectedSessionId === sessionKey;
                    return (
                      <div key={session.id} className="px-4 py-4 border-t hover:bg-gray-50" style={isConnectedToThis ? { backgroundColor: '#eff6ff' } : {}}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium" style={{ color: '#3B82F6' }}>
                                {session.title}
                              </p>
                              {session.status === 'live' && (
                                <Badge variant="danger" className="bg-red-600 text-white text-xs">LIVE</Badge>
                              )}
                              {isConnectedToThis && (
                                <Badge variant="success" className="text-white text-xs" style={{ backgroundColor: '#3B82F6' }}>CONNECTED</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {session.course} • {session.instructor}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                              <CalendarIcon className="h-3 w-3" />
                              {session.date} • {session.time}
                            </p>
                          </div>
                          <Link to="/dashboard/sessions" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                            Join from Meetings →
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
