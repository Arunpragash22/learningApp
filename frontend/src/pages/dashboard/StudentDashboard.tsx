import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  BellIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  ActivityIcon,
  PlayIcon,
  CalendarIcon,
  WifiIcon,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import { sessionService, Session } from "../../services/sessionService";
import { toast } from "sonner";
import { useLatencyMonitor, ConnectionQuality } from "../../hooks/useLatencyMonitor";
import { ConnectionQualityBadge } from "../../components/engagement/ConnectionQualityIndicator";

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
// DEFAULT DASHBOARD CONTENT
// --------------------------------------
const recentActivities = [
  {
    id: "1",
    type: "session",
    title: "Database Management Systems",
    course: "CS202: Database Systems",
    date: "2023-10-10",
    engagement: "High",
  },
  {
    id: "2",
    type: "quiz",
    title: "Mid-term Assessment",
    course: "CS301: Machine Learning Fundamentals",
    date: "2023-10-08",
    score: "85%",
  },
];

const performanceData = {
  engagementScore: 85,
  attendanceRate: 92,
  questionsAsked: 12,
  quizAverage: 88,
};

// --------------------------------------
// MAIN COMPONENT
// --------------------------------------
export const StudentDashboard = () => {
  const { user } = useAuth();
  const [incomingQuiz, setIncomingQuiz] = useState<any | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  
  // 🎯 Session WebSocket state - only joined sessions receive quizzes
  const [sessionWs, setSessionWs] = useState<WebSocket | null>(null);
  const [connectedSessionId, setConnectedSessionId] = useState<string | null>(
    localStorage.getItem('connectedSessionId')
  );
  
  // 📊 Session quiz tracking - resets each session
  const [sessionQuizStats, setSessionQuizStats] = useState({
    questionsReceived: 0,    // Questions sent by instructor
    questionsAnswered: 0,    // Total questions student answered
    correctAnswers: 0,       // Correct answers count
  });

  // 📶 WebRTC-aware Connection Latency Monitoring
  // This monitors network quality when student joins a session
  const handleConnectionQualityChange = useCallback((quality: ConnectionQuality) => {
    if (quality === 'poor' || quality === 'critical') {
      toast.warning(`⚠️ Your connection quality is ${quality}. This may affect your session.`);
    }
  }, []);

  // Build display name with fallbacks
  const studentDisplayName = user 
    ? (user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`.trim()
        : user.firstName || user.lastName || user.email?.split('@')[0] || 'Student')
    : 'Student';

  const {
    isMonitoring: isLatencyMonitoring,
    currentRtt,
    quality: connectionQuality,
    stats: latencyStats,
  } = useLatencyMonitor({
    sessionId: connectedSessionId, // Only monitor when connected to a session
    studentId: user?.id,
    studentName: studentDisplayName, // Use proper display name
    userRole: 'student', // Only student data is stored in database
    enabled: !!connectedSessionId && !!user?.id, // Enable only when in a session
    pingInterval: 3000, // Ping every 3 seconds for faster updates
    reportInterval: 5000, // Report to server every 5 seconds
    onQualityChange: handleConnectionQualityChange
  });
  
  // Notify when monitoring starts
  useEffect(() => {
    if (isLatencyMonitoring && connectedSessionId) {
      console.log('📶 Network monitoring ACTIVE:', {
        sessionId: connectedSessionId,
        studentId: user?.id,
        studentName: studentDisplayName
      });
      toast.success(`📶 Network monitoring active for session ${connectedSessionId}`);
    }
  }, [isLatencyMonitoring]); // Only trigger when monitoring status changes

  // ===========================================================
  // 🎯 AUTO-CONNECT TO LIVE SESSION (WebSocket only, no Zoom)
  // ===========================================================
  const autoJoinSession = (session: Session) => {
    const studentId = user?.id || `STUDENT_${Date.now()}`;
    const studentName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown Student';
    const studentEmail = user?.email || '';
    const sessionKey = session.zoomMeetingId || session.id;
    const wsBase = import.meta.env.VITE_WS_URL;
    
    console.log('🎯 Auto-connecting to live session:', {
      sessionTitle: session.title,
      sessionKey: sessionKey,
      studentId: studentId
    });
    
    // Close any previous session WebSocket
    if (sessionWs) {
      sessionWs.close();
    }
    
    // Include student name and email as query parameters
    const encodedName = encodeURIComponent(studentName);
    const encodedEmail = encodeURIComponent(studentEmail);
    const sessionWsUrl = `${wsBase}/ws/session/${sessionKey}/${studentId}?student_name=${encodedName}&student_email=${encodedEmail}`;
    
    // Create WebSocket connection
    const ws = new WebSocket(sessionWsUrl);
    
    ws.onopen = () => {
      console.log(`✅ Auto-connected to session ${sessionKey} WebSocket`);
      setConnectedSessionId(sessionKey);
      localStorage.setItem('connectedSessionId', sessionKey);
      
      setSessionQuizStats({
        questionsReceived: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
      });
      
      toast.success(`📶 Auto-connected to live session: ${session.title}`);
      toast.info(`Network monitoring started automatically`);
    };
    
    ws.onclose = () => {
      console.log(`🔌 Session ${sessionKey} WebSocket closed`);
      if (connectedSessionId === sessionKey) {
        setConnectedSessionId(null);
        localStorage.removeItem('connectedSessionId');
      }
    };
    
    ws.onerror = (err) => {
      console.error("Session WS ERROR:", err);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "quiz") {
          setIncomingQuiz(data);
          setSessionQuizStats(prev => ({
            ...prev,
            questionsReceived: prev.questionsReceived + 1
          }));
          playNotificationSound();
          toast.info(`📝 New quiz question received!`);
        }
      } catch (err) {
        console.error("WS message parse error:", err);
      }
    };
    
    setSessionWs(ws);
  };

  // ===========================================================
  // ⭐ LOAD REAL SESSIONS FROM BACKEND
  // ===========================================================
  useEffect(() => {
    const loadSessions = async () => {
      const allSessions = await sessionService.getAllSessions();
      // Show only upcoming and live sessions
      const filtered = allSessions.filter(s => s.status === 'upcoming' || s.status === 'live');
      setSessions(filtered.slice(0, 5)); // Show max 5
      
      // 🎯 AUTO-CONNECT to live sessions if not already connected
      if (!connectedSessionId && user?.id) {
        const liveSessions = filtered.filter(s => s.status === 'live');
        
        if (liveSessions.length > 0) {
          // Auto-join the first live session
          const liveSession = liveSessions[0];
          console.log('🎯 Found live session, auto-connecting:', liveSession.title);
          autoJoinSession(liveSession);
        }
      }
    };
    loadSessions();
    
    const interval = setInterval(loadSessions, 3000); // Refresh every 3 seconds for near real-time updates
    return () => clearInterval(interval);
  }, [connectedSessionId, user?.id]); // Re-check when connection or user changes

  // ===========================================================
  // 🎯 JOIN ZOOM MEETING + CONNECT TO SESSION WEBSOCKET
  // Only students who click Join will receive quiz questions
  // ===========================================================
  const handleJoinSession = (session: Session) => {
    if (!session.join_url) {
      alert("❌ Zoom join URL missing");
      return;
    }
    
    // Open Zoom meeting
    window.open(session.join_url, '_blank');
    
    // 🎯 Connect to session-specific WebSocket
    const studentId = user?.id || `STUDENT_${Date.now()}`;
    const studentName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown Student';
    const studentEmail = user?.email || '';
    const sessionKey = session.zoomMeetingId || session.id;
    const wsBase = import.meta.env.VITE_WS_URL;
    
    console.log('🎯 Joining session:', {
      sessionTitle: session.title,
      sessionKey: sessionKey,
      zoomMeetingId: session.zoomMeetingId,
      sessionId: session.id,
      studentId: studentId,
      studentName: studentName
    });
    
    // Include student name and email as query parameters for report generation
    const encodedName = encodeURIComponent(studentName);
    const encodedEmail = encodeURIComponent(studentEmail);
    const sessionWsUrl = `${wsBase}/ws/session/${sessionKey}/${studentId}?student_name=${encodedName}&student_email=${encodedEmail}`;
    
    console.log(`🔗 Connecting to session WebSocket: ${sessionWsUrl}`);
    
    // Close any previous session WebSocket
    if (sessionWs) {
      console.log("🔌 Closing previous session WebSocket");
      sessionWs.close();
    }
    
    // Create new session WebSocket
    const ws = new WebSocket(sessionWsUrl);
    
    ws.onopen = () => {
      console.log(`✅ Connected to session ${sessionKey} WebSocket`);
      console.log(`📶 Network monitoring will start automatically`);
      setConnectedSessionId(sessionKey);
      localStorage.setItem('connectedSessionId', sessionKey); // Persist connection state
      
      // 📊 Reset session quiz stats for new session
      setSessionQuizStats({
        questionsReceived: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
      });
      
      // 🔔 Request notification permission
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
      
      // Play a subtle sound to confirm connection
      playNotificationSound();
      
      // Show success notification
      toast.success(`✅ Joined "${session.title}" - You'll receive quiz notifications`);
      toast.info(`📶 Network monitoring started for session ${sessionKey}`);
    };
    
    ws.onclose = () => {
      console.log(`🔌 Session ${sessionKey} WebSocket closed`);
      
      // Auto-reconnect logic for maintaining real-time consistency
      if (connectedSessionId === sessionKey) {
        console.log('🔄 Attempting to reconnect WebSocket...');
        
        // Attempt reconnection after 1 second
        setTimeout(() => {
          if (connectedSessionId === sessionKey) { // Only reconnect if still supposed to be connected
            console.log('🔄 Reconnecting to session WebSocket...');
            const reconnectWs = new WebSocket(sessionWsUrl);
            
            reconnectWs.onopen = () => {
              console.log(`✅ Reconnected to session ${sessionKey} WebSocket`);
              setSessionWs(reconnectWs);
              
              // Re-register with server
              reconnectWs.send(JSON.stringify({
                type: "reconnect",
                sessionId: sessionKey,
                studentId: studentId,
                studentName: studentName,
                studentEmail: studentEmail
              }));
            };
            
            reconnectWs.onmessage = ws.onmessage; // Reuse same message handler
            reconnectWs.onerror = ws.onerror;
            reconnectWs.onclose = ws.onclose; // Will trigger reconnection again if needed
          }
        }, 1000);
      } else {
        // Not supposed to be connected, clear state
        setConnectedSessionId(null);
        localStorage.removeItem('connectedSessionId');
      }
    };
    
    ws.onerror = (err) => {
      console.error("Session WS ERROR:", err);
      // Error will trigger onclose, which handles reconnection
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📬 Session WS message:", data);
        
        // Handle quiz questions from session room
        if (data.type === "quiz") {
          console.log("🎯 Quiz received from session room!");
          
          // 📊 Increment questions received from instructor
          setSessionQuizStats(prev => ({
            ...prev,
            questionsReceived: prev.questionsReceived + 1,
          }));
          
          // 🔔 1) Play notification sound
          playNotificationSound();
          
          // 🔔 2) Show toast notification (visible in-app message)
          toast.success("📝 New Quiz Question!", {
            description: data.question || "Answer the quiz now!",
            duration: 10000, // Show for 10 seconds
            position: "top-center",
          });
          
          // 🔔 3) Show browser/system notification (if permitted)
          showBrowserNotification("📝 New Quiz!", data.question || "You have a new quiz question");
          
          // 4) Show quiz popup
          setIncomingQuiz(data);
        } else if (data.type === "session_joined") {
          console.log("✅ Session join confirmed:", data);
        } else if (data.type === "participant_joined" || data.type === "participant_left") {
          // Real-time participant status update - refresh session list to show updated participant count
          console.log(`👥 Participant ${data.type === 'participant_joined' ? 'joined' : 'left'}:`, data.studentName || data.studentId);
          // Optionally refresh sessions to show updated participant counts
          // This will be handled by the auto-refresh interval already in place
        }
      } catch (e) {
        console.error("Session WS JSON ERROR:", e);
      }
    };
    
    setSessionWs(ws);
  };

  // Cleanup session WebSocket on unmount
  useEffect(() => {
    return () => {
      if (sessionWs) {
        sessionWs.close();
      }
    };
  }, [sessionWs]);

  // ===========================================================
  // ⭐ GLOBAL WebSocket — Receive Notifications (fallback)
  // ===========================================================
  useEffect(() => {
    if (!user) return;

    const studentId = user?.id || `STUDENT_${Date.now()}`;
    const wsBase = import.meta.env.VITE_WS_URL;
    const socketUrl = `${wsBase}/ws/global/${studentId}`;

    console.log("Connecting Global WS:", socketUrl);

    const ws = new WebSocket(socketUrl);

    ws.onopen = () => console.log("🌍 Global WS CONNECTED");
    ws.onclose = () => console.log("❌ Global WS CLOSED");
    ws.onerror = (err) => console.error("Global WS ERROR:", err);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Global WS message:", data);

        // Note: Session-specific quizzes now come via session WebSocket
        // This global WS is kept for announcements and fallback
        if (data.type === "quiz" && !connectedSessionId) {
          // Only show global quizzes if not connected to a session
          console.log("⚠️ Received global quiz (no session connected)");
          // Optionally show: setIncomingQuiz(data);
        }
      } catch (e) {
        console.error("Global WS JSON ERROR:", e);
      }
    };

    return () => ws.close();
  }, [user, connectedSessionId]);

  // ===========================================================
  // UI RENDER
  // ===========================================================
  return (
    <div className="py-6">
      {/* QUIZ POPUP */}
      {incomingQuiz && (
        <QuizPopup 
          quiz={incomingQuiz} 
          onClose={() => setIncomingQuiz(null)}
          onAnswerSubmitted={(isCorrect) => {
            setSessionQuizStats(prev => ({
              ...prev,
              questionsAnswered: prev.questionsAnswered + 1,
              correctAnswers: prev.correctAnswers + (isCorrect ? 1 : 0),
            }));
          }}
          networkStrength={{
            quality: connectionQuality,
            rttMs: currentRtt,
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
          {/* 📶 Connection Quality Badge - shows when connected to session */}
          {connectedSessionId && (
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm border">
              <WifiIcon className="h-4 w-4 text-gray-500" />
              <ConnectionQualityBadge
                quality={connectionQuality}
                rtt={currentRtt}
                isMonitoring={isLatencyMonitoring}
              />
            </div>
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
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-bold">Your Learning Summary</h2>
            <p className="mt-1" style={{ color: '#d1f5e8' }}>
              You are in <span className="font-semibold">Active Participants</span>
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-white bg-opacity-25 text-sm font-medium">
            {performanceData.engagementScore}% Engagement
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Network Strength - Shows connection quality when in session */}
          <div className="bg-white bg-opacity-10 rounded-lg p-4">
            <WifiIcon className="h-6 w-6" style={{ color: '#b8e6d4' }} />
            <p className="text-sm font-medium">Network Strength</p>
            <p className="text-lg font-bold">
              {connectedSessionId ? (
                <span className="capitalize" style={{ 
                  color: connectionQuality === 'excellent' || connectionQuality === 'good' 
                    ? '#b8e6d4' 
                    : connectionQuality === 'fair' 
                      ? '#fcd34d'
                      : connectionQuality === 'poor' || connectionQuality === 'critical'
                        ? '#fca5a5'
                        : 'inherit'
                }}>
                  {connectionQuality}
                  {currentRtt && <span className="text-xs ml-1">({Math.round(currentRtt)}ms)</span>}
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

          <div className="bg-white bg-opacity-10 rounded-lg p-4">
            <CalendarIcon className="h-6 w-6" style={{ color: '#b8e6d4' }} />
            <p className="text-sm font-medium">Next Class</p>
            <p className="text-lg font-bold">7 days</p>
          </div>
        </div>
      </div>

      {/* Meetings Sections + Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* MEETINGS SECTIONS - LEFT COLUMN */}
        <div className="space-y-4">
          {/* Header with View All Link */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Your Meetings</h3>
            <Link to="/dashboard/sessions">
              <span className="text-sm hover:opacity-80" style={{ color: '#3B82F6' }}>View All</span>
            </Link>
          </div>

          {/* 📶 Show connection status banner when connected */}
          {connectedSessionId && (
            <div className="p-3 rounded-lg bg-white shadow" style={{ borderColor: '#3B82F6', borderWidth: '1px' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3B82F6' }}></div>
                  <span className="text-sm font-medium" style={{ color: '#4a8b73' }}>
                    Connected to session
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <WifiIcon className="h-4 w-4" style={{ color: '#3B82F6' }} />
                  <span className="text-xs" style={{ color: '#2563eb' }}>
                    {currentRtt ? `${Math.round(currentRtt)}ms` : 'Measuring...'} • {connectionQuality}
                  </span>
                </div>
              </div>
              <p className="text-xs mt-1" style={{ color: '#3B82F6' }}>
                Your network quality is being monitored for engagement analysis.
              </p>
            </div>
          )}

          {sessions.length === 0 ? (
            <div className="bg-white shadow rounded-lg px-4 py-8 text-center text-gray-500">
              <p className="text-sm">No upcoming meetings</p>
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
                          <Button
                            variant={isConnectedToThis ? 'secondary' : session.status === 'live' ? 'primary' : 'outline'}
                            size="sm"
                            leftIcon={isConnectedToThis ? <WifiIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                            onClick={() => handleJoinSession(session)}
                          >
                            {isConnectedToThis ? 'Joined' : session.status === 'live' ? 'Join' : 'Join'}
                          </Button>
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
                          <Button
                            variant={isConnectedToThis ? 'secondary' : session.status === 'live' ? 'primary' : 'outline'}
                            size="sm"
                            leftIcon={isConnectedToThis ? <WifiIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                            onClick={() => handleJoinSession(session)}
                          >
                            {isConnectedToThis ? 'Joined' : session.status === 'live' ? 'Join' : 'Join'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Activity */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5">
            <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
          </div>

          {recentActivities.map((activity) => (
            <div key={activity.id} className="px-4 py-4 border-t">
              <p className="text-sm font-medium" style={{ color: '#3B82F6' }}>
                {activity.title}
              </p>
              <p className="text-xs text-gray-500">{activity.course}</p>
              <p className="text-xs mt-1 text-gray-500">{activity.date}</p>

              {activity.type === "session" && (
                <p className="text-xs mt-1 font-medium" style={{ color: '#3B82F6' }}>
                  Engagement: {activity.engagement}
                </p>
              )}

              {activity.type === "quiz" && (
                <p className="text-xs mt-1 font-medium" style={{ color: '#3B82F6' }}>
                  Score: {activity.score}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
