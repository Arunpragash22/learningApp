import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { useLatencyMonitor } from '../../hooks/useLatencyMonitor';

import {
  SearchIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  PlayIcon,
  VideoIcon,
  BookOpenIcon,
  PlusIcon,
  EditIcon,
  FileTextIcon,
  StopCircleIcon,
  Loader2Icon,
  CheckCircleIcon,
  KeyIcon,
  XIcon,
  LockIcon
} from 'lucide-react';

import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

import { sessionService, Session } from '../../services/sessionService';

// ===========================================================
// 🎯 QUIZ POPUP COMPONENT (inline)
// ===========================================================
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

export const SessionList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [startingSessionId, setStartingSessionId] = useState<string | null>(null);

  // Enrollment key states for students
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const [enrollingSession, setEnrollingSession] = useState<Session | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Track which session the user is currently connected to
  const [connectedSessionId, setConnectedSessionId] = useState<string | null>(
    localStorage.getItem('connectedSessionId')
  );

  // WebSocket connection for session room
  const [sessionWs, setSessionWs] = useState<WebSocket | null>(null);

  // Quiz popup state
  const [incomingQuiz, setIncomingQuiz] = useState<any | null>(null);
  const lastShownQuestionIdRef = useRef<string | null>(null);

  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  // 📶 Network monitoring - Initialize when connected to a session
  const studentDisplayName = user
    ? (user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`.trim()
      : user.firstName || user.lastName || user.email?.split('@')[0] || 'Student')
    : 'Student';

  // 📶 Network monitoring state - only enabled when student actually joins Zoom meeting
  const [networkMonitoringEnabled, setNetworkMonitoringEnabled] = useState(false);

  const {
    stopMonitoring,
  } = useLatencyMonitor({
    sessionId: connectedSessionId, // Only monitor when connected to a session
    studentId: user?.id,
    studentName: studentDisplayName,
    userRole: 'student', // Only student data is stored in database
    enabled: networkMonitoringEnabled && !!connectedSessionId && !!user?.id && !isInstructor, // Enable ONLY when explicitly enabled
    pingInterval: 3000, // Ping every 3 seconds for faster updates
    reportInterval: 5000, // Report to server every 5 seconds
  });

  // Cleanup WebSocket and network monitoring on unmount or when leaving
  useEffect(() => {
    return () => {
      // Stop network monitoring when component unmounts
      if (networkMonitoringEnabled) {
        stopMonitoring();
        setNetworkMonitoringEnabled(false);
      }
      // Close WebSocket connection
      if (sessionWs) {
        sessionWs.close();
      }
    };
  }, [sessionWs, networkMonitoringEnabled, stopMonitoring]);

  // Note: Backend now handles enrollment tracking via enrolledStudents array
  // localStorage is no longer needed for tracking enrollments

  // ---------------------------------------------------
  // ⭐ Load sessions from BACKEND - Event-driven updates only
  // ---------------------------------------------------
  useEffect(() => {
    const loadSessions = async () => {
      const all = await sessionService.getAllSessions();
      setSessions(all);

      // Check if connected session is still live/upcoming
      const storedSessionId = localStorage.getItem('connectedSessionId');
      if (storedSessionId) {
        const connectedSession = all.find(s =>
          (s.zoomMeetingId === storedSessionId || s.id === storedSessionId)
        );

        // Clear connection if session ended or doesn't exist
        if (!connectedSession || connectedSession.status === 'completed') {
          localStorage.removeItem('connectedSessionId');
          setConnectedSessionId(null);
          if (sessionWs) {
            sessionWs.close();
            setSessionWs(null);
          }
          // Stop network monitoring if session ended
          if (networkMonitoringEnabled) {
            stopMonitoring();
            setNetworkMonitoringEnabled(false);
          }
        }
        // NOTE: We do NOT auto-restore WebSocket connections
        // Students must explicitly click "Join Now" to start monitoring
      }
    };

    // Initial load only - no polling
    loadSessions();

    // Sessions will be updated via WebSocket events (session_started, meeting_ended, etc.)
    // No polling interval - updates are event-driven
  }, [user?.id, isInstructor]);

  // ---------------------------------------------------
  // 📬 FETCH MISSED QUIZ WHEN PAGE LOADS (e.g. after clicking push notification)
  // ---------------------------------------------------
  useEffect(() => {
    if (isInstructor || !user?.id) return;
    const sessionId = localStorage.getItem("connectedSessionId");
    if (!sessionId) return;

    const fetchLatestQuiz = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const res = await fetch(`${apiUrl}/api/live/latest-quiz/${sessionId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
        });
        const data = await res.json();
        if (data.success && data.quiz) {
          const qid = data.quiz.questionId || data.quiz.question_id;
          if (qid !== lastShownQuestionIdRef.current) {
            lastShownQuestionIdRef.current = qid;
            console.log("📬 [SessionList] Fetched missed quiz – showing on website");
            setIncomingQuiz(data.quiz);
          }
        }
      } catch (e) {
        console.error("Failed to fetch latest quiz:", e);
      }
    };

    fetchLatestQuiz();

    const onVisible = () => {
      if (document.visibilityState === "visible" && localStorage.getItem("connectedSessionId")) {
        fetchLatestQuiz();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user?.id, isInstructor]);

  // ---------------------------------------------------
  // 📬 POLL FOR QUIZ EVERY 15s WHILE CONNECTED (fallback if WebSocket misses)
  // ---------------------------------------------------
  useEffect(() => {
    if (isInstructor || !user?.id) return;
    const sessionId = connectedSessionId || localStorage.getItem("connectedSessionId");
    if (!sessionId) return;

    const poll = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const res = await fetch(`${apiUrl}/api/live/latest-quiz/${sessionId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
        });
        const data = await res.json();
        if (data.success && data.quiz) {
          const qid = data.quiz.questionId || data.quiz.question_id;
          if (qid !== lastShownQuestionIdRef.current) {
            lastShownQuestionIdRef.current = qid;
            console.log("📬 [SessionList] Poll: new quiz – showing on website");
            setIncomingQuiz(data.quiz);
          }
        }
      } catch (e) {
        // ignore
      }
    };

    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [connectedSessionId, user?.id, isInstructor]);

  // ---------------------------------------------------
  // ⭐ WEBSOCKET LISTENER FOR REAL-TIME SESSION STATUS UPDATES
  // ---------------------------------------------------
  useEffect(() => {
    if (!user?.id) return;

    const wsBase = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'ws://localhost:8000';
    const wsUrl = `${wsBase}/ws/global/${user.id}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('✅ Connected to global WebSocket for session updates');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📬 Session update received:', data);
        
        // Handle session started event
        if (data.type === 'session_started') {
          console.log('🟢 Session started:', data.sessionId || data.zoomMeetingId);
          setSessions(prev => prev.map(s => 
            (s.id === data.sessionId || s.zoomMeetingId === data.zoomMeetingId || s.zoomMeetingId === data.sessionId)
              ? { ...s, status: 'live' as const }
              : s
          ));
          toast.success('Meeting is now live!');
        }
        
        // Handle meeting ended event
        if (data.type === 'meeting_ended') {
          console.log('🔴 Meeting ended:', data.sessionId || data.zoomMeetingId);
          setSessions(prev => prev.map(s => 
            (s.id === data.sessionId || s.zoomMeetingId === data.zoomMeetingId)
              ? { ...s, status: 'completed' as const }
              : s
          ));
          toast.info('Meeting has ended');
          
          // Clear starting state if this session was being started
          if (startingSessionId === data.sessionId || startingSessionId === data.zoomMeetingId) {
            setStartingSessionId(null);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('🔌 WebSocket closed');
    };
    
    return () => {
      ws.close();
    };
  }, [user?.id, startingSessionId]);

  // ---------------------------------------------------
  // ⭐ ENROLL IN SESSION (Students only - for standalone sessions)
  // ---------------------------------------------------
  const handleOpenEnrollModal = (session: Session) => {
    setEnrollingSession(session);
    setEnrollmentKey('');
    setShowEnrollModal(true);
  };

  const handleEnrollInSession = async () => {
    if (!enrollmentKey.trim()) {
      toast.error('Please enter an enrollment key');
      return;
    }

    setIsEnrolling(true);

    try {
      // If enrolling from header button (no specific session), use general enroll endpoint
      const enrollUrl = enrollingSession
        ? `${import.meta.env.VITE_API_URL}/api/sessions/${enrollingSession.id}/enroll`
        : `${import.meta.env.VITE_API_URL}/api/sessions/enroll-by-key`;

      const response = await fetch(enrollUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({ enrollmentKey: enrollmentKey.trim() })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const sessionTitle = enrollingSession?.title || data.sessionTitle;

        toast.success(`Successfully enrolled in meeting "${sessionTitle}"!`);
        setShowEnrollModal(false);
        setEnrollmentKey('');
        setEnrollingSession(null);

        // Reload sessions from backend - this will now include the newly enrolled meeting
        const all = await sessionService.getAllSessions();
        setSessions(all);
      } else {
        toast.error(data.message || 'Invalid enrollment key');
      }
    } catch (error) {
      console.error('Enrollment error:', error);
      toast.error('Failed to enroll. Please try again.');
    } finally {
      setIsEnrolling(false);
    }
  };

  // ---------------------------------------------------
  // ⭐ JOIN SESSION - Direct WebSocket connection
  // ---------------------------------------------------
  const handleJoinSession = async (session: Session) => {
    if (isInstructor) {
      if (!session.start_url) {
        alert("❌ Zoom host start URL missing");
        return;
      }
      // For instructors, open Zoom in new tab
      window.open(session.start_url, '_blank');

      // Store session ID for instructor too
      const sessionKey = session.zoomMeetingId || session.id;
      localStorage.setItem('connectedSessionId', sessionKey);
      setConnectedSessionId(sessionKey);
      return;
    }

    // 🎯 STUDENTS: Direct join (same as Dashboard)
    // If the meeting is visible in their list, they're already enrolled
    
    // 🎯 STEP 1: Open Zoom meeting
    if (!session.join_url) {
      toast.error("❌ Zoom join URL missing");
      return;
    }

    window.open(session.join_url, '_blank');

    // 🎯 STEP 2: Connect to WebSocket (same as StudentDashboard)
    const sessionKey = session.zoomMeetingId || session.id;
    const studentId = user?.id || `STUDENT_${Date.now()}`;
    const studentName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown Student';
    const studentEmail = user?.email || '';
    const wsBase = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL?.replace('/api', '').replace('http', 'ws') || 'ws://localhost:8000';

    const encodedName = encodeURIComponent(studentName);
    const encodedEmail = encodeURIComponent(studentEmail);
    const sessionWsUrl = `${wsBase}/ws/session/${sessionKey}/${studentId}?student_name=${encodedName}&student_email=${encodedEmail}`;

    console.log(`🔗 [SessionList] Connecting to session WebSocket: ${sessionWsUrl}`);

    // Close any previous session WebSocket and stop monitoring
    if (sessionWs) {
      console.log("🔌 [SessionList] Closing previous session WebSocket");
      sessionWs.close();
    }
    if (networkMonitoringEnabled) {
      stopMonitoring();
      setNetworkMonitoringEnabled(false);
    }

    // Create new session WebSocket
    const ws = new WebSocket(sessionWsUrl);

    ws.onopen = () => {
      console.log(`✅ [SessionList] Connected to session ${sessionKey} WebSocket`);
      setConnectedSessionId(sessionKey);
      localStorage.setItem('connectedSessionId', sessionKey);

      // 🎯 START NETWORK MONITORING ONLY AFTER SUCCESSFUL WEBSOCKET CONNECTION
      setNetworkMonitoringEnabled(true);

      toast.success(`✅ Joined "${session.title}" - Network monitoring started`);
      
      // 🔄 Send keepalive ping immediately, then every 15 seconds to prevent connection timeout
      const sendPing = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
          console.log('📡 [SessionList] Sent keepalive ping');
        }
      };
      
      // Send first ping immediately
      sendPing();
      
      // Then send ping every 15 seconds
      const pingInterval = setInterval(sendPing, 15000);
      
      // Store interval ID to clear it later
      (ws as any).pingInterval = pingInterval;
    };

    ws.onclose = () => {
      console.log(`🔌 [SessionList] Session ${sessionKey} WebSocket closed`);
      
      // Clear ping interval if it exists
      if ((ws as any).pingInterval) {
        clearInterval((ws as any).pingInterval);
      }

      // 🎯 STOP NETWORK MONITORING when WebSocket closes (student left meeting)
      if (networkMonitoringEnabled) {
        stopMonitoring();
        setNetworkMonitoringEnabled(false);
        console.log('📶 [SessionList] Network monitoring stopped - student left meeting');
      }

      if (connectedSessionId === sessionKey) {
        setConnectedSessionId(null);
        localStorage.removeItem('connectedSessionId');
        toast.info("Disconnected from session");
      }
    };

    ws.onerror = (err) => {
      console.error("[SessionList] Session WS ERROR:", err);
      toast.error("Failed to connect to session");
    };

      ws.onmessage = (event) => {
        // Backend sends "pong" as plain text for keepalive - don't parse as JSON
        if (event.data === 'pong') return;
        try {
          const data = JSON.parse(event.data);
          console.log("📬 [SessionList] Session WS message:", data);

          if (data.type === "quiz") {
            console.log("🎯 [SessionList] Quiz received from session room!");
            
            // 🔔 1) Show toast notification (visible in-app message)
            toast.success("📝 New Quiz Question!", {
              description: data.question || "Answer the quiz now!",
              duration: 10000, // Show for 10 seconds
              position: "top-center",
            });
            
            // 2) Show quiz popup (and track so polling doesn't show again)
            lastShownQuestionIdRef.current = data.questionId || data.question_id;
            setIncomingQuiz(data);
          } else if (data.type === "session_joined") {
            console.log("✅ [SessionList] Session join confirmed:", data);
          } else if (data.type === "meeting_ended") {
            console.log("🔴 [SessionList] Meeting ended event received:", data);
            toast.info("🔴 Meeting has ended", {
              description: "The host has ended the meeting",
              duration: 5000,
            });
            // Stop network monitoring
            if (networkMonitoringEnabled) {
              stopMonitoring();
              setNetworkMonitoringEnabled(false);
            }
            // Clear connection state
            setConnectedSessionId(null);
            localStorage.removeItem('connectedSessionId');
            // Close WebSocket
            if (sessionWs) {
              sessionWs.close();
              setSessionWs(null);
            }
            // Update sessions list (event-driven, no API call needed)
            setSessions(prev => prev.map(s =>
              (s.id === data.sessionId || s.zoomMeetingId === data.zoomMeetingId)
                ? { ...s, status: 'completed' as const }
                : s
            ));
          } else if (data.type === "session_started") {
            console.log("🟢 [SessionList] Session started event received:", data);
            // Update sessions list (event-driven, no API call needed)
            setSessions(prev => prev.map(s =>
              (s.id === data.sessionId || s.zoomMeetingId === data.zoomMeetingId)
                ? { ...s, status: 'live' as const }
                : s
            ));
          }
        } catch (e) {
          console.error("[SessionList] Session WS JSON ERROR:", e);
        }
      };

      setSessionWs(ws);
  };

  // ---------------------------------------------------
  // ⭐ LEAVE SESSION - Call backend and cleanup
  // ---------------------------------------------------
  const handleLeaveSession = async (session: Session) => {
    const sessionKey = session.zoomMeetingId || session.id;

    // Only allow leaving if currently in this session
    if (connectedSessionId !== sessionKey) {
      return;
    }

    try {
      // 🎯 STEP 1: Call backend leave endpoint
      const leaveResult = await sessionService.leaveSession(session.id);

      if (leaveResult.success) {
        console.log("✅ [SessionList] Backend leave successful");
        toast.success("Left session successfully");
      }

      // 🎯 STEP 2: Stop network monitoring
      if (networkMonitoringEnabled) {
        stopMonitoring();
        setNetworkMonitoringEnabled(false);
        console.log('📶 [SessionList] Network monitoring stopped');
      }

      // 🎯 STEP 3: Close WebSocket connection
      if (sessionWs) {
        sessionWs.close();
        setSessionWs(null);
        console.log('🔌 [SessionList] WebSocket closed');
      }

      // 🎯 STEP 4: Clear localStorage and state
      localStorage.removeItem('connectedSessionId');
      setConnectedSessionId(null);

    } catch (error) {
      console.error("Error leaving session:", error);
      toast.error("Failed to leave session");
    }
  };

  // ---------------------------------------------------
  // ⭐ START SESSION (Instructor only) - Opens Zoom directly
  // ---------------------------------------------------
  const handleStartSession = async (session: Session) => {
    setStartingSessionId(session.id);
    const result = await sessionService.startSession(session.id);
    if (result.success) {
      toast.success('Session started successfully!');

      // Reload sessions to update status
      const all = await sessionService.getAllSessions();
      setSessions(all);

      // 🎯 Open Zoom directly after starting session
      if (session.start_url) {
        window.open(session.start_url, '_blank');
        toast.info('🚀 Opening Zoom meeting...');
      } else {
        toast.warning('⚠️ Zoom start URL not available');
      }
    } else {
      toast.error(result.message || 'Failed to start session');
    }
    setStartingSessionId(null);
  };

  // ---------------------------------------------------
  // ⭐ END SESSION (Instructor only) - Auto generates report
  // ---------------------------------------------------
  const handleEndSession = async (sessionId: string, sessionTitle: string) => {
    if (!confirm(`Are you sure you want to end "${sessionTitle}"?\n\nThis will:\n• Mark the session as completed\n• Generate the final report\n• Send email notifications to all participants`)) {
      return;
    }

    setEndingSessionId(sessionId);
    const result = await sessionService.endSession(sessionId);

    if (result.success) {
      toast.success(
        <div>
          <p className="font-medium">Session ended successfully!</p>
          <p className="text-sm text-gray-500">
            {result.participantCount} participants • Report generated • {result.emailsSent} emails sent
          </p>
        </div>
      );
      // Reload sessions to update status
      const all = await sessionService.getAllSessions();
      setSessions(all);
      // Navigate to report
      navigate(`/dashboard/sessions/${sessionId}/report`);
    } else {
      toast.error(result.message || 'Failed to end session');
    }
    setEndingSessionId(null);
  };

  // ---------------------------------------------------
  // FILTER + SEARCH
  // ---------------------------------------------------
  let filtered = sessions.filter((session) => {
    const s = searchTerm.toLowerCase();

    const matches =
      session.title.toLowerCase().includes(s) ||
      session.course.toLowerCase().includes(s) ||
      session.instructor.toLowerCase().includes(s) ||
      session.courseCode.toLowerCase().includes(s);

    if (!matches) return false;
    if (statusFilter !== 'all' && session.status !== statusFilter) return false;

    // Backend already filters sessions based on enrollment
    // Students only see: course-based sessions they're enrolled in + standalone sessions they've enrolled in
    // No additional filtering needed here
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    const order = { live: 0, upcoming: 1, completed: 2 };
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // Separate meetings into standalone and course-based
  const standaloneMeetings = filtered.filter(session => session.isStandalone === true);
  const courseMeetings = filtered.filter(session => !session.isStandalone);

  // ---------------------------------------------------
  // Badges
  // ---------------------------------------------------
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'live':
        return <Badge variant="danger" className="bg-red-600 text-white">LIVE</Badge>;
      case 'upcoming':
        return <Badge variant="success">Upcoming</Badge>;
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      default:
        return null;
    }
  };

  // Note: Backend only returns sessions student is enrolled in
  // To show "available to enroll" sessions, we would need a separate endpoint
  // For now, students can use the "Enroll in Meeting" button to enter any valid key
  const unenrolledStandaloneSessions: any[] = [];

  return (
    <div className="py-6">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold dark:text-white">Live Meetings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Join ongoing and upcoming meetings</p>
        </div>

        {isInstructor ? (
          <Button
            variant="primary"
            leftIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => navigate('/dashboard/sessions/create')}
          >
            Create Meeting
          </Button>
        ) : (
          <Button
            variant="primary"
            leftIcon={<KeyIcon className="h-4 w-4" />}
            onClick={() => {
              setEnrollingSession(null);
              setEnrollmentKey('');
              setShowEnrollModal(true);
            }}
          >
            Enroll in Meeting
          </Button>
        )}
      </div>

      {/* Enrollment Key Modal for Students */}
      {showEnrollModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Enroll in Meeting</h2>
                  {enrollingSession ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{enrollingSession.title}</p>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Enter your enrollment key to access the meeting</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowEnrollModal(false);
                    setEnrollmentKey('');
                    setEnrollingSession(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Enter Enrollment Key
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={enrollmentKey}
                    onChange={(e) => setEnrollmentKey(e.target.value.toUpperCase())}
                    placeholder="e.g., ABC12XYZ"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-lg tracking-wider uppercase"
                    maxLength={8}
                    disabled={isEnrolling}
                  />
                  <KeyIcon className="absolute right-3 top-3.5 h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Ask your instructor for the meeting enrollment key
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEnrollModal(false);
                    setEnrollmentKey('');
                    setEnrollingSession(null);
                  }}
                  disabled={isEnrolling}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleEnrollInSession}
                  disabled={isEnrolling || !enrollmentKey.trim()}
                  leftIcon={isEnrolling ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                  className="flex-1"
                >
                  {isEnrolling ? 'Enrolling...' : 'Enroll'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Enroll with Key Section for Students */}
      {!isInstructor && unenrolledStandaloneSessions.length > 0 && (
        <Card className="mb-6 border-2 border-indigo-200 bg-indigo-50">
          <div className="p-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <KeyIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-semibold text-indigo-900 mb-2">
                  Standalone Meetings Available
                </h3>
                <p className="text-sm text-indigo-700 mb-4">
                  {unenrolledStandaloneSessions.length} meeting(s) require an enrollment key to access.
                  Ask your instructor for the key to join these meetings.
                </p>
                <div className="space-y-2">
                  {unenrolledStandaloneSessions.slice(0, 3).map(session => (
                    <div key={session.id} className="flex items-center justify-between bg-white dark:bg-gray-700 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <LockIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{session.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{session.date} • {session.time}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        leftIcon={<KeyIcon className="h-3 w-3" />}
                        onClick={() => handleOpenEnrollModal(session)}
                      >
                        Enter Key
                      </Button>
                    </div>
                  ))}
                  {unenrolledStandaloneSessions.length > 3 && (
                    <p className="text-sm text-indigo-600 text-center pt-2">
                      +{unenrolledStandaloneSessions.length - 3} more meeting(s)
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Search + Filter */}
      <Card className="mb-6">
        <div className="p-4 flex gap-4">

          <div className="relative flex-1">
            <input
              type="text"
              className="w-full p-2 pl-10 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
              placeholder="Search meetings…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <SearchIcon className="absolute left-3 top-2 h-5 w-5 text-gray-400 dark:text-gray-500" />
          </div>

          <button
            className="px-4 py-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            onClick={() => setFilterActive((v) => !v)}
          >
            <CalendarIcon className="inline h-5 w-5 mr-2" />
            Filters
          </button>
        </div>

        {filterActive && (
          <div className="p-4 border-t dark:border-gray-700">
            <label className="block text-sm mb-1 dark:text-gray-300">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border p-2 rounded w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="all">All</option>
              <option value="live">Live</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        )}
      </Card>

      {/* Meeting Results - Divided into Sections */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <h3 className="text-gray-400 dark:text-gray-500">No meetings found</h3>
        </Card>
      ) : (
        <div className="space-y-8">

          {/* Standalone Meetings Section */}
          {standaloneMeetings.length > 0 && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <KeyIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  Standalone Meetings
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Meetings you've enrolled in with an enrollment key
                </p>
              </div>
              <div className="space-y-4">
                {standaloneMeetings.map((session) => (
                  <Card key={session.id} className="p-6">
                    <div className="flex justify-between">
                      {/* Info */}
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-semibold dark:text-white">{session.title}</h3>
                          {getStatusBadge(session.status)}
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-2">
                          <BookOpenIcon className="h-4 w-4" />
                          {session.course} ({session.courseCode})
                        </p>

                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-2">
                          <UsersIcon className="h-4 w-4" />
                          {session.instructor}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-2">
                          <CalendarIcon className="h-4 w-4" />
                          {session.date}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-2">
                          <ClockIcon className="h-4 w-4" />
                          {session.time} ({session.duration})
                        </p>
                      </div>

                      {/* Buttons */}
                      <div className="flex flex-col gap-3">
                        {isInstructor && (
                          <Button
                            variant="outline"
                            leftIcon={<EditIcon className="h-4 w-4" />}
                            onClick={() => navigate(`/dashboard/sessions/${session.id}/edit`)}
                          >
                            Edit
                          </Button>
                        )}

                        {isInstructor && session.status === 'upcoming' && (
                          <Button
                            variant="primary"
                            leftIcon={
                              startingSessionId === session.id
                                ? <Loader2Icon className="h-4 w-4 animate-spin" />
                                : <PlayIcon className="h-4 w-4" />
                            }
                            onClick={() => handleStartSession(session)}
                            disabled={startingSessionId === session.id}
                          >
                            {startingSessionId === session.id ? 'Starting...' : 'Start Meeting'}
                          </Button>
                        )}

                        {/* JOIN/LEAVE BUTTON - For students (upcoming and live) */}
                        {!isInstructor && (session.status === 'upcoming' || session.status === 'live') && (() => {
                          const sessionKey = session.zoomMeetingId || session.id;
                          const isInThisMeeting = connectedSessionId === sessionKey;

                          return (
                            <>
                              {!isInThisMeeting ? (
                                <Button
                                  variant={session.status === 'live' ? 'primary' : 'outline'}
                                  leftIcon={<PlayIcon className="h-4 w-4" />}
                                  onClick={() => handleJoinSession(session)}
                                >
                                  {session.status === 'live' ? 'Join Live' : 'Join'}
                                </Button>
                              ) : (
                                <>
                                <Button
                                  variant="success"
                                  leftIcon={<CheckCircleIcon className="h-4 w-4" />}
                                >
                                  Live
                                </Button>
                                  <Button
                                    variant="outline"
                                    leftIcon={<XIcon className="h-4 w-4" />}
                                    onClick={() => handleLeaveSession(session)}
                                  >
                                    Leave
                                  </Button>
                                </>
                              )}
                            </>
                          );
                        })()}

                        {/* JOIN LIVE button for instructors when session is live */}
                        {isInstructor && session.status === 'live' && (
                          <>
                            <Button
                              variant="primary"
                              leftIcon={<VideoIcon className="h-4 w-4" />}
                              onClick={() => handleStartSession(session)}
                            >
                              Join Live
                            </Button>
                            <Button
                              variant="danger"
                              leftIcon={
                                endingSessionId === session.id
                                  ? <Loader2Icon className="h-4 w-4 animate-spin" />
                                  : <StopCircleIcon className="h-4 w-4" />
                              }
                              onClick={() => handleEndSession(session.id, session.title)}
                              disabled={endingSessionId === session.id}
                            >
                              {endingSessionId === session.id ? 'Ending...' : 'End Meeting'}
                            </Button>
                          </>
                        )}

                        {isInstructor && (
                          <Button
                            variant="outline"
                            leftIcon={<FileTextIcon className="h-4 w-4" />}
                            onClick={() => navigate(`/dashboard/sessions/${session.id}/report`)}
                          >
                            View Report
                          </Button>
                        )}

                        {isInstructor && session.status === 'completed' && (
                          <div className="flex items-center gap-2 text-blue-600 text-sm">
                            <CheckCircleIcon className="h-4 w-4" />
                            <span>Report Available</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Course-Based Meetings Section */}
          {courseMeetings.length > 0 && (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <BookOpenIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Course Meetings
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Meetings from your enrolled courses
                </p>
              </div>
              <div className="space-y-4">
                {courseMeetings.map((session) => (
                  <Card key={session.id} className="p-6">

                    <div className="flex justify-between">

                      {/* Info */}
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-semibold dark:text-white">{session.title}</h3>
                          {getStatusBadge(session.status)}
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-2">
                          <BookOpenIcon className="h-4 w-4" />
                          {session.course} ({session.courseCode})
                        </p>

                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-2">
                          <UsersIcon className="h-4 w-4" />
                          {session.instructor}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-2">
                          <CalendarIcon className="h-4 w-4" />
                          {session.date}
                        </p>

                        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-2">
                          <ClockIcon className="h-4 w-4" />
                          {session.time} ({session.duration})
                        </p>
                      </div>

                      {/* Buttons */}
                      <div className="flex flex-col gap-3">

                        {isInstructor && (
                          <Button
                            variant="outline"
                            leftIcon={<EditIcon className="h-4 w-4" />}
                            onClick={() => navigate(`/dashboard/sessions/${session.id}/edit`)}
                          >
                            Edit
                          </Button>
                        )}

                        {/* START MEETING (Instructor only - for upcoming meetings) */}
                        {isInstructor && session.status === 'upcoming' && (
                          <Button
                            variant="primary"
                            leftIcon={
                              startingSessionId === session.id
                                ? <Loader2Icon className="h-4 w-4 animate-spin" />
                                : <PlayIcon className="h-4 w-4" />
                            }
                            onClick={() => handleStartSession(session)}
                            disabled={startingSessionId === session.id}
                          >
                            {startingSessionId === session.id ? 'Starting...' : 'Start Meeting'}
                          </Button>
                        )}

                        {/* JOIN/LEAVE BUTTON - For students (upcoming and live) */}
                        {!isInstructor && (session.status === 'upcoming' || session.status === 'live') && (() => {
                          const sessionKey = session.zoomMeetingId || session.id;
                          const isInThisMeeting = connectedSessionId === sessionKey;

                          return (
                            <>
                              {!isInThisMeeting ? (
                                <Button
                                  variant={session.status === 'live' ? 'primary' : 'outline'}
                                  leftIcon={<PlayIcon className="h-4 w-4" />}
                                  onClick={() => handleJoinSession(session)}
                                >
                                  {session.status === 'live' ? 'Join Live' : 'Join'}
                                </Button>
                              ) : (
                                <>
                                <Button
                                  variant="success"
                                  leftIcon={<CheckCircleIcon className="h-4 w-4" />}
                                >
                                  Live
                                </Button>
                                  <Button
                                    variant="outline"
                                    leftIcon={<XIcon className="h-4 w-4" />}
                                    onClick={() => handleLeaveSession(session)}
                                  >
                                    Leave
                                  </Button>
                                </>
                              )}
                            </>
                          );
                        })()}

                        {/* JOIN LIVE button for instructors when session is live */}
                        {isInstructor && session.status === 'live' && (
                          <>
                            <Button
                              variant="primary"
                              leftIcon={<VideoIcon className="h-4 w-4" />}
                              onClick={() => handleStartSession(session)}
                            >
                              Join Live
                            </Button>
                            <Button
                              variant="danger"
                              leftIcon={
                                endingSessionId === session.id
                                  ? <Loader2Icon className="h-4 w-4 animate-spin" />
                                  : <StopCircleIcon className="h-4 w-4" />
                              }
                              onClick={() => handleEndSession(session.id, session.title)}
                              disabled={endingSessionId === session.id}
                            >
                              {endingSessionId === session.id ? 'Ending...' : 'End Meeting'}
                            </Button>
                          </>
                        )}

                        {/* VIEW REPORT - ONLY for instructors */}
                        {isInstructor && (
                          <Button
                            variant="outline"
                            leftIcon={<FileTextIcon className="h-4 w-4" />}
                            onClick={() => navigate(`/dashboard/sessions/${session.id}/report`)}
                          >
                            View Report
                          </Button>
                        )}

                        {/* Show completed indicator for instructors */}
                        {isInstructor && session.status === 'completed' && (
                          <div className="flex items-center gap-2 text-blue-600 text-sm">
                            <CheckCircleIcon className="h-4 w-4" />
                            <span>Report Available</span>
                          </div>
                        )}
                      </div>
                    </div>

                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🎯 QUIZ POPUP - Shows when student receives a quiz question */}
      {incomingQuiz && (
        <QuizPopup
          quiz={incomingQuiz}
          onClose={() => setIncomingQuiz(null)}
        />
      )}
    </div>
  );
};
