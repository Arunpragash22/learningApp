import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSessionConnection } from '../../context/SessionConnectionContext';
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
  LockIcon,
  ZapIcon,
  ZapOffIcon,
  SettingsIcon,
  BarChart3Icon
} from 'lucide-react';

import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

import { sessionService, Session } from '../../services/sessionService';

// Quiz popup is rendered globally in DashboardLayout so students receive questions on any page.

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

  // Automation configuration modal state (for instructors)
  const [showStartModal, setShowStartModal] = useState(false);
  const [startingSession, setStartingSession] = useState<Session | null>(null);
  const [realTimeAnalyticsEnabled, setRealTimeAnalyticsEnabled] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [firstDelayMinutes, setFirstDelayMinutes] = useState(2);   // 2 minutes default
  const [intervalMinutes, setIntervalMinutes] = useState(10);       // 10 minutes default
  const [maxQuestions, setMaxQuestions] = useState<number | null>(null);

  const {
    connectedSessionId: contextConnectedSessionId,
    joinSession: contextJoinSession,
    leaveSession: contextLeaveSession,
    receiveQuizFromPoll,
  } = useSessionConnection();

  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';
  const [instructorSessionId, setInstructorSessionId] = useState<string | null>(null);
  const connectedSessionId = isInstructor ? instructorSessionId : contextConnectedSessionId;

  // 📶 Network monitoring - Initialize when connected to a session
  const studentDisplayName = user
    ? (user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`.trim()
      : user.firstName || user.lastName || user.email?.split('@')[0] || 'Student')
    : 'Student';

  const { stopMonitoring } = useLatencyMonitor({
    sessionId: connectedSessionId,
    studentId: user?.id,
    studentName: studentDisplayName,
    userRole: 'student',
    enabled: !!connectedSessionId && !!user?.id && !isInstructor,
    pingInterval: 3000,
    reportInterval: 5000,
  });

  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  // Note: Backend now handles enrollment tracking via enrolledStudents array
  // localStorage is no longer needed for tracking enrollments

  // ---------------------------------------------------
  // ⭐ Load sessions from BACKEND - Event-driven updates only
  // ---------------------------------------------------
  useEffect(() => {
    const loadSessions = async () => {
      const all = await sessionService.getAllSessions();
      setSessions(all);

      if (isInstructor) {
        setInstructorSessionId(prev => prev ?? localStorage.getItem('connectedSessionId'));
      }
      // Clear instructor session state if session ended
      if (isInstructor && instructorSessionId) {
        const connectedSession = all.find(s =>
          (s.zoomMeetingId === instructorSessionId || s.id === instructorSessionId)
        );
        if (!connectedSession || connectedSession.status === 'completed') {
          localStorage.removeItem('connectedSessionId');
          setInstructorSessionId(null);
        }
      }
    };

    // Initial load only - no polling
    loadSessions();

    // Sessions will be updated via WebSocket events (session_started, meeting_ended, etc.)
    // No polling interval - updates are event-driven
  }, [user?.id, isInstructor, instructorSessionId]);

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
          headers: { Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}` },
        });
        const data = await res.json();
        if (data.success && data.quiz) {
          receiveQuizFromPoll(data.quiz);
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
          headers: { Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}` },
        });
        const data = await res.json();
        if (data.success && data.quiz) {
          receiveQuizFromPoll(data.quiz);
        }
      } catch (e) {
        // ignore
      }
    };

    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [connectedSessionId, user?.id, isInstructor, receiveQuizFromPoll]);

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
  }, [user?.id]);

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
          'Authorization': `Bearer ${sessionStorage.getItem('access_token')}`
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

      const sessionKey = session.zoomMeetingId || session.id;
      localStorage.setItem('connectedSessionId', sessionKey);
      setInstructorSessionId(sessionKey);
      return;
    }

    contextJoinSession(session);
  };

  // ---------------------------------------------------
  // ⭐ LEAVE SESSION - Call backend and cleanup
  // ---------------------------------------------------
  const handleLeaveSession = async (session: Session) => {
    const sessionKey = session.zoomMeetingId || session.id;
    if (connectedSessionId !== sessionKey) return;

    try {
      await sessionService.leaveSession(session.id);
      toast.success("Left session successfully");
    } catch (error) {
      console.error("Error leaving session:", error);
      toast.error("Failed to leave session");
    }

    if (isInstructor) {
      localStorage.removeItem('connectedSessionId');
      setInstructorSessionId(null);
    } else {
      contextLeaveSession();
    }
  };

  // ---------------------------------------------------
  // ⭐ START SESSION (Instructor only) - Opens Zoom directly
  // ---------------------------------------------------
  const handleOpenStartModal = (session: Session) => {
    setStartingSession(session);
    setRealTimeAnalyticsEnabled(false);
    setAutomationEnabled(true);
    setFirstDelayMinutes(2);
    setIntervalMinutes(10);
    setMaxQuestions(null);
    setShowStartModal(true);
  };

  const handleStartSession = async () => {
    if (!startingSession) return;
    
    setStartingSessionId(startingSession.id);
    setShowStartModal(false);
    
    const result = await sessionService.startSession(startingSession.id, {
      enableRealTimeAnalytics: realTimeAnalyticsEnabled,
      enableAutomation: realTimeAnalyticsEnabled && automationEnabled,
      firstDelaySeconds: firstDelayMinutes * 60,
      intervalSeconds: intervalMinutes * 60,
      maxQuestions: maxQuestions || undefined
    });
    
    if (result.success) {
      if (realTimeAnalyticsEnabled && automationEnabled) {
        toast.success(
          <div>
            <p className="font-medium">Session started with real-time analytics!</p>
            <p className="text-sm text-gray-500">
              First question in {firstDelayMinutes} min, then every {intervalMinutes} min
            </p>
          </div>
        );
      } else if (realTimeAnalyticsEnabled) {
        toast.success(
          <div>
            <p className="font-medium">Session started with real-time analytics!</p>
            <p className="text-sm text-gray-500">Manual question triggering enabled</p>
          </div>
        );
      } else {
        toast.success('Session started successfully!');
      }

      // Reload sessions to update status
      const all = await sessionService.getAllSessions();
      setSessions(all);

      // 🎯 Open Zoom directly after starting session
      if (startingSession.start_url) {
        window.open(startingSession.start_url, '_blank');
        toast.info('Opening Zoom meeting...');
      } else {
        toast.warning('Zoom start URL not available');
      }
    } else {
      toast.error(result.message || 'Failed to start session');
    }
    
    setStartingSessionId(null);
    setStartingSession(null);
  };
  
  // Quick start without showing modal (for "Join Live" on already live sessions)
  const handleQuickJoin = async (session: Session) => {
    if (session.start_url) {
      window.open(session.start_url, '_blank');
      toast.info('Opening Zoom meeting...');
    } else {
      toast.warning('Zoom start URL not available');
    }
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

      {/* Start Session Modal with Automation Config (Instructors) */}
      {showStartModal && startingSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5">
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Start Meeting</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{startingSession.title}</p>
                </div>
                <button
                  onClick={() => {
                    setShowStartModal(false);
                    setStartingSession(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column - Toggles */}
                <div className="space-y-3">
                  {/* Real-Time Analytics Toggle */}
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <BarChart3Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="font-medium text-sm text-gray-900 dark:text-white">Real-Time Analytics</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRealTimeAnalyticsEnabled(!realTimeAnalyticsEnabled)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          realTimeAnalyticsEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            realTimeAnalyticsEnabled ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {realTimeAnalyticsEnabled 
                        ? 'Monitor engagement & send quiz questions'
                        : 'Session without real-time analytics'
                      }
                    </p>
                  </div>

                  {/* Auto-Trigger Questions Toggle */}
                  {realTimeAnalyticsEnabled && (
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <ZapIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          <span className="font-medium text-sm text-gray-900 dark:text-white">Auto-Trigger Questions</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAutomationEnabled(!automationEnabled)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            automationEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                              automationEnabled ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {automationEnabled 
                          ? 'Questions sent automatically'
                          : 'Manual triggering only'
                        }
                      </p>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-2">
                      <SettingsIcon className="h-3 w-3" />
                      <span className="font-medium">Summary:</span>
                    </div>
                    <ul className="space-y-0.5 text-gray-600 dark:text-gray-400 ml-4">
                      <li>• Session marked as LIVE</li>
                      <li>• Zoom opens automatically</li>
                      {realTimeAnalyticsEnabled ? (
                        <>
                          <li>• Real-time analytics ON</li>
                          {automationEnabled ? (
                            <>
                              <li>• First Q: {firstDelayMinutes} min</li>
                              <li>• Interval: {intervalMinutes} min</li>
                              <li>• {maxQuestions ? `Max ${maxQuestions} Q` : 'Unlimited'}</li>
                            </>
                          ) : (
                            <li>• Manual triggering</li>
                          )}
                        </>
                      ) : (
                        <li>• Analytics OFF</li>
                      )}
                    </ul>
                  </div>
                </div>

                {/* Right Column - Settings (only if automation enabled) */}
                <div className="space-y-3">
                  {realTimeAnalyticsEnabled && automationEnabled ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          First Question After (min)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={firstDelayMinutes}
                          onChange={(e) => setFirstDelayMinutes(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Question Interval (min)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="60"
                          value={intervalMinutes}
                          onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Max Questions (optional)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={maxQuestions || ''}
                          onChange={(e) => setMaxQuestions(e.target.value ? Number(e.target.value) : null)}
                          placeholder="Unlimited"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
                      {realTimeAnalyticsEnabled 
                        ? 'Enable Auto-Trigger for settings'
                        : 'Enable Real-Time Analytics first'
                      }
                    </div>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowStartModal(false);
                    setStartingSession(null);
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleStartSession}
                  leftIcon={startingSessionId ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <PlayIcon className="h-4 w-4" />}
                  disabled={!!startingSessionId}
                  className="flex-1"
                >
                  {startingSessionId ? 'Starting...' : 'Start Meeting'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Standalone Meetings Section */}
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <KeyIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                Standalone Meetings
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Meetings enrolled with enrollment key
              </p>
            </div>
            {standaloneMeetings.length > 0 ? (
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
                        {isInstructor && session.status !== 'completed' && (
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
                            onClick={() => handleOpenStartModal(session)}
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
                              onClick={() => handleQuickJoin(session)}
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

                        {isInstructor && session.status === 'completed' && (
                          <Button
                            variant="outline"
                            leftIcon={<FileTextIcon className="h-4 w-4" />}
                            onClick={() => navigate(`/dashboard/sessions/${session.id}/report`)}
                          >
                            View Report
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center text-gray-500">
                <KeyIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No standalone meetings</p>
              </Card>
            )}
          </div>

          {/* Course Lessons Section */}
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <BookOpenIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Course Lessons
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Lessons from enrolled courses
              </p>
            </div>
            {courseMeetings.length > 0 ? (
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

                        {isInstructor && session.status !== 'completed' && (
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
                            onClick={() => handleOpenStartModal(session)}
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
                              onClick={() => handleQuickJoin(session)}
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

                        {/* VIEW REPORT - ONLY for instructors and completed sessions */}
                        {isInstructor && session.status === 'completed' && (
                          <Button
                            variant="outline"
                            leftIcon={<FileTextIcon className="h-4 w-4" />}
                            onClick={() => navigate(`/dashboard/sessions/${session.id}/report`)}
                          >
                            View Report
                          </Button>
                        )}
                      </div>
                    </div>

                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center text-gray-500">
                <BookOpenIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No course lessons</p>
              </Card>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
