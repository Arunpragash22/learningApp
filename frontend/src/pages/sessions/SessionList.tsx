import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { useLatencyMonitor } from '../../hooks/useLatencyMonitor';

import {
  SearchIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  ActivityIcon,
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
    isMonitoring: isLatencyMonitoring,
    currentRtt,
    quality: connectionQuality,
    stats: latencyStats,
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
  // ⭐ JOIN LIVE BUTTON
  // ---------------------------------------------------
  const handleJoinSession = (session: Session) => {
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

    if (!session.join_url) {
      alert("❌ Zoom join URL missing");
      return;
    }
    
    // 🎯 For students: Open Zoom + Connect to WebSocket + Start network monitoring
    const sessionKey = session.zoomMeetingId || session.id;
    const studentId = user?.id || `STUDENT_${Date.now()}`;
    const studentName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown Student';
    const studentEmail = user?.email || '';
    const wsBase = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'ws://localhost:8000';
    
    // Open Zoom meeting in new tab
    const zoomWindow = window.open(session.join_url, '_blank');
    
    // 🎯 Connect to session-specific WebSocket
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
    };
    
    ws.onclose = () => {
      console.log(`🔌 [SessionList] Session ${sessionKey} WebSocket closed`);
      
      // 🎯 STOP NETWORK MONITORING when WebSocket closes (student left meeting)
      if (networkMonitoringEnabled) {
        stopMonitoring();
        setNetworkMonitoringEnabled(false);
        console.log('📶 [SessionList] Network monitoring stopped - student left meeting');
      }
      
      if (connectedSessionId === sessionKey) {
        setConnectedSessionId(null);
        localStorage.removeItem('connectedSessionId');
      }
    };
    
    ws.onerror = (err) => {
      console.error("[SessionList] Session WS ERROR:", err);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📬 [SessionList] Session WS message:", data);
        
        if (data.type === "quiz") {
          toast.success("📝 New Quiz Question!", {
            description: data.question || "Answer the quiz now!",
            duration: 10000,
          });
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
    
    // Store session ID in localStorage
    localStorage.setItem('connectedSessionId', sessionKey);
    setConnectedSessionId(sessionKey);
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

                        {/* JOIN BUTTON - For students (upcoming and live) */}
                        {!isInstructor && (session.status === 'upcoming' || session.status === 'live') && (() => {
                          const sessionKey = session.zoomMeetingId || session.id;
                          const isInThisMeeting = connectedSessionId === sessionKey;
                          
                          return (
                            <Button
                              variant={isInThisMeeting ? 'success' : session.status === 'live' ? 'primary' : 'outline'}
                              leftIcon={isInThisMeeting ? <CheckCircleIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                              onClick={() => handleJoinSession(session)}
                              disabled={isInThisMeeting}
                            >
                              {isInThisMeeting ? 'In Meeting' : session.status === 'live' ? 'Join Live' : 'Join Meeting'}
                            </Button>
                          );
                        })()}

                        {/* JOIN LIVE button removed - instructors should not see this when session is already live */}

                        {isInstructor && session.status === 'live' && (
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

                  {/* JOIN BUTTON - For students (upcoming and live) */}
                  {!isInstructor && (session.status === 'upcoming' || session.status === 'live') && (() => {
                    const sessionKey = session.zoomMeetingId || session.id;
                    const isInThisMeeting = connectedSessionId === sessionKey;
                    
                    return (
                      <Button
                        variant={isInThisMeeting ? 'success' : session.status === 'live' ? 'primary' : 'outline'}
                        leftIcon={isInThisMeeting ? <CheckCircleIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                        onClick={() => handleJoinSession(session)}
                        disabled={isInThisMeeting}
                      >
                        {isInThisMeeting ? 'In Meeting' : session.status === 'live' ? 'Join Live' : 'Join Meeting'}
                      </Button>
                    );
                  })()}

                  {/* JOIN LIVE button removed - instructors should not see this when session is already live */}

                  {/* END MEETING (Instructor only - for live meetings) */}
                  {isInstructor && session.status === 'live' && (
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
    </div>
  );
};
