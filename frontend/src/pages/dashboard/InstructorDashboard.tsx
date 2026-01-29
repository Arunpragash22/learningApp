import { Link } from "react-router-dom";
import axios from "axios";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/Button";
import { TargetIcon, PlayIcon, CalendarIcon, ClockIcon, WifiIcon, ActivityIcon, UsersIcon } from "lucide-react";
import { sessionService, Session } from "../../services/sessionService";
import { Badge } from "../../components/ui/Badge";
import { useLatencyMonitor, ConnectionQuality } from "../../hooks/useLatencyMonitor";
import { ConnectionQualityIndicator } from "../../components/engagement/ConnectionQualityIndicator";
import { StudentNetworkMonitor } from "../../components/engagement/StudentNetworkMonitor";

export const InstructorDashboard = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // ================================
  // 📶 WebRTC-aware Connection Latency Monitoring
  // ================================
  const handleConnectionQualityChange = useCallback((quality: ConnectionQuality) => {
    if (quality === 'poor' || quality === 'critical') {
      console.warn(`⚠️ Connection quality degraded: ${quality}`);
    }
  }, []);

  const {
    isMonitoring: isLatencyMonitoring,
    currentRtt,
    quality: connectionQuality,
    stats: latencyStats,
    shouldAdjustEngagement
  } = useLatencyMonitor({
    sessionId: selectedSession ? (selectedSession.zoomMeetingId || selectedSession.id) : 'instructor-view', // Use zoomMeetingId for consistency with students
    studentId: user?.id,
    studentName: `${user?.firstName} ${user?.lastName}`,
    userRole: 'instructor', // Instructor data is NOT stored in database (filtered by backend)
    enabled: true, // Always monitor so instructor can SEE their network quality
    pingInterval: 3000, // Ping every 3 seconds for near real-time updates
    reportInterval: 5000, // Report to server every 5 seconds for near real-time updates
    onQualityChange: handleConnectionQualityChange
  });

  // ================================
  // ⭐ LOAD REAL SESSIONS FROM BACKEND
  // ================================
  useEffect(() => {
    const loadSessions = async () => {
      const allSessions = await sessionService.getAllSessions();
      // Show only upcoming and live sessions
      const filtered = allSessions.filter(s => s.status === 'upcoming' || s.status === 'live');
      setSessions(filtered.slice(0, 5)); // Show max 5
      
      // Auto-select first live session for quick trigger
      const liveSession = filtered.find(s => s.status === 'live');
      if (liveSession && !selectedSession) {
        setSelectedSession(liveSession);
      }
    };
    // Initial load only
    loadSessions();
    
    // Sessions will be updated via WebSocket events (session_started, meeting_ended, participant_joined, etc.)
    // No polling interval - updates are event-driven for better performance
  }, []);

  // ================================
  // ⭐ REAL-TIME PARTICIPANT STATUS VIA WEBSOCKET
  // Listen for join/leave events and update session list immediately
  // ================================
  useEffect(() => {
    if (!selectedSession) return;

    const sessionKey = selectedSession.zoomMeetingId || selectedSession.id;
    if (!sessionKey) return;

    // Connect to WebSocket to receive real-time participant updates
    const wsBase = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'ws://localhost:8000';
    const wsUrl = `${wsBase}/ws/session/${sessionKey}/instructor_${user?.id || 'monitor'}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('✅ Instructor connected to session WebSocket for real-time updates');
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "participant_joined" || data.type === "participant_left") {
          console.log(`👥 Real-time update: ${data.studentName || data.studentId} ${data.type === 'participant_joined' ? 'joined' : 'left'}`);
          
          // Immediately refresh sessions to show updated participant count
          sessionService.getAllSessions().then(allSessions => {
            const filtered = allSessions.filter(s => s.status === 'upcoming' || s.status === 'live');
            setSessions(filtered.slice(0, 5));
            
            // Update selected session if it's the one being monitored
            const updatedSession = filtered.find(s => s.id === selectedSession.id);
            if (updatedSession) {
              setSelectedSession(updatedSession);
            }
          });
        } else if (data.type === "meeting_ended") {
          console.log("🔴 [InstructorDashboard] Meeting ended event received:", data);
          toast.info("🔴 Meeting has ended", {
            description: "The meeting has been ended",
            duration: 5000,
          });
          // Refresh sessions to show updated status
          sessionService.getAllSessions().then(allSessions => {
            const filtered = allSessions.filter(s => s.status === 'upcoming' || s.status === 'live');
            setSessions(filtered.slice(0, 5));
            // Clear selected session if it was the one that ended
            if (selectedSession && (selectedSession.id === data.sessionId || selectedSession.zoomMeetingId === data.zoomMeetingId)) {
              setSelectedSession(null);
            }
          });
        } else if (data.type === "session_started") {
          console.log("🟢 [InstructorDashboard] Session started event received:", data);
          // Update sessions list (event-driven, no API call needed)
          setSessions(prev => {
            const updated = prev.map(s => 
              (s.id === data.sessionId || s.zoomMeetingId === data.zoomMeetingId) 
                ? { ...s, status: 'live' as const }
                : s
            ).filter(s => s.status === 'upcoming' || s.status === 'live').slice(0, 5);
            
            // Auto-select the session that was just started
            if (data.sessionId || data.zoomMeetingId) {
              const startedSession = updated.find(s => 
                s.id === data.sessionId || 
                s.zoomMeetingId === data.zoomMeetingId ||
                s.zoomMeetingId === data.sessionId
              );
              if (startedSession && startedSession.status === 'live') {
                setSelectedSession(startedSession);
              }
            }
            
            return updated;
          });
        }
      } catch (e) {
        console.error("Instructor WS message error:", e);
      }
    };
    
    ws.onerror = (err) => {
      console.error("Instructor WS error:", err);
    };
    
    ws.onclose = () => {
      console.log('🔌 Instructor WebSocket closed');
    };
    
    return () => {
      ws.close();
    };
  }, [selectedSession, user?.id]);

  // ================================
  // ⭐ START/JOIN ZOOM MEETING (INSTRUCTOR)
  // Opens Zoom directly and starts network monitoring
  // ================================
  const handleJoinSession = (session: Session) => {
    if (!session.start_url) {
      toast.error("❌ Zoom host start URL missing");
      return;
    }
    
    // Open Zoom meeting directly
    window.open(session.start_url, '_blank');
    
    // Auto-select this session for triggering questions and network monitoring
    setSelectedSession(session);
    
    // Show notifications
    toast.success(`🚀 Opening Zoom meeting: ${session.title}`);
    toast.info(`📶 Network monitoring started for this session`);
    
    console.log('🎯 Instructor started meeting:', {
      sessionTitle: session.title,
      sessionId: session.id,
      zoomMeetingId: session.zoomMeetingId,
      status: session.status
    });
    
    // Network monitoring will automatically start via StudentNetworkMonitor component
    // which uses selectedSession.zoomMeetingId || selectedSession.id
    // Student network parameters will be retrieved as soon as students join
  };

  // ================================
  // 🎯 TRIGGER QUESTION TO SPECIFIC SESSION
  // Only students who clicked "Join" on this session will receive the quiz
  // ================================
  const handleTriggerQuestion = async (session?: Session) => {
    // Use provided session or the currently selected one
    const targetSession = session || selectedSession;
    
    if (!targetSession) {
      alert("❌ Please select a session first or click 'Trigger' on a specific session");
      return;
    }
    
    // 🎯 Use the real Zoom meeting ID as the session room key
    const meetingId = targetSession.zoomMeetingId || targetSession.id;
    
    if (!meetingId) {
      alert("❌ Session has no meeting ID");
      return;
    }
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL;

      console.log(` Triggering question to session: ${meetingId} (${targetSession.title})`);
      
      const res = await axios.post(
        `${apiUrl}/api/live/trigger/${meetingId}`
      );

      console.log("Trigger Response:", res.data);
      
      if (res.data.success) {
        const sentCount = res.data.websocketSent || 0;
        const participants = res.data.participants || [];
        alert(` Question sent to ${sentCount} students in "${targetSession.title}"!\n\nParticipants: ${participants.map((p: any) => p.studentId || p.studentName).join(', ') || 'None connected yet'}`);
      } else {
        alert(`⚠️ ${res.data.message || 'Failed to send question'}`);
      }
    } catch (error) {
      console.error("Trigger Error:", error);
      alert("❌ Failed to send question");
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Instructor Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back, {user?.firstName}! Here's an overview of your teaching activities.
          </p>
        </div>

        {/* BUTTON GROUP */}
        <div className="flex gap-3 items-center">
          {/* 🎯 Trigger Question Button (uses selected session) */}
          <div className="flex items-center gap-2">
            {selectedSession && (
              <span className="text-sm text-gray-500">
                Session: <span className="font-medium text-indigo-600">{selectedSession.title}</span>
              </span>
            )}
            <Button
              variant="secondary"
              leftIcon={<TargetIcon className="h-4 w-4" />}
              onClick={() => handleTriggerQuestion()}
              disabled={!selectedSession}
            >
              {selectedSession ? 'Trigger Quiz' : 'Select Session'}
            </Button>
          </div>
        </div>
      </div>

      {/* ================= CARDS SECTION ================= */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-1">
        {/* 📶 Connection Quality Card */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className={`flex-shrink-0 rounded-md p-3 ${
                  connectionQuality === 'excellent' || connectionQuality === 'good' 
                    ? 'bg-blue-500' 
                    : connectionQuality === 'fair' 
                    ? 'bg-yellow-500' 
                    : connectionQuality === 'poor' || connectionQuality === 'critical'
                    ? 'bg-red-500'
                    : 'bg-gray-400'
                }`}>
                  <WifiIcon className="h-5 w-5 text-white" />
                </div>
                <div className="ml-4">
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Connection Quality
                  </dt>
                  <dd className="flex items-center">
                    <div className="text-lg font-medium text-gray-900 capitalize">
                      {connectionQuality}
                    </div>
                    {isLatencyMonitoring && (
                      <span className="ml-2 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                    )}
                  </dd>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-center">
              <div className="bg-gray-50 rounded p-2">
                <div className="font-medium text-gray-900">{currentRtt ? `${Math.round(currentRtt)}ms` : '--'}</div>
                <div className="text-gray-500">RTT</div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="font-medium text-gray-900">{latencyStats.jitter.toFixed(0)}ms</div>
                <div className="text-gray-500">Jitter</div>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <div className="font-medium text-gray-900">{latencyStats.stabilityScore.toFixed(0)}%</div>
                <div className="text-gray-500">Stability</div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-xs text-gray-500 flex items-center">
              <ActivityIcon className="h-3 w-3 mr-1" />
              {isLatencyMonitoring ? 'WebRTC Monitoring Active' : 'Not Monitoring'}
            </div>
          </div>
        </div>
      </div>

      {/* ================= REAL UPCOMING SESSION LIST - TWO SECTIONS ================= */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Your Meetings</h2>
          <Link to="/dashboard/sessions">
            <Button variant="outline" size="sm">View All</Button>
          </Link>
        </div>
        
        {sessions.length === 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md px-4 py-8 text-center text-gray-500">
            <p>No upcoming meetings</p>
            <Link to="/dashboard/sessions/create">
              <Button variant="primary" className="mt-4">Create Your First Meeting</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* STANDALONE MEETINGS SECTION */}
            {sessions.filter(s => s.isStandalone === true).length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg"></span>
                  <div>
                    <h3 className="text-md font-semibold text-gray-900">Standalone Meetings</h3>
                    <p className="text-xs text-gray-500">Meetings with enrollment keys</p>
                  </div>
                </div>
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                  <ul className="divide-y divide-gray-200">
                    {sessions.filter(s => s.isStandalone === true).map((session) => (
                      <li key={session.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-indigo-600 truncate">
                                {session.title}
                              </p>
                              {session.status === 'live' && (
                                <Badge variant="danger" className="bg-red-600 text-white">LIVE</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-gray-500 flex items-center gap-3">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-4 w-4" />
                                {session.date}
                              </span>
                              <span className="flex items-center gap-1">
                                <ClockIcon className="h-4 w-4" />
                                {session.time}
                              </span>
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {session.course} ({session.courseCode})
                            </p>
                          </div>
                          
                          <div className="ml-4 flex gap-2">
                            {/* 🎯 Trigger Quiz Button - Only joined students receive */}
                            {session.status === 'live' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<TargetIcon className="h-4 w-4" />}
                                onClick={() => handleTriggerQuestion(session)}
                              >
                                Trigger Quiz
                              </Button>
                            )}
                            {/* Start Meeting button - Only show when meeting is NOT live */}
                            {session.status !== 'live' && (
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<PlayIcon className="h-4 w-4" />}
                                onClick={() => handleJoinSession(session)}
                              >
                                Start Meeting
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* COURSE MEETINGS SECTION */}
            {sessions.filter(s => !s.isStandalone).length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg"></span>
                  <div>
                    <h3 className="text-md font-semibold text-gray-900">Course Meetings</h3>
                    <p className="text-xs text-gray-500">Meetings from your courses</p>
                  </div>
                </div>
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                  <ul className="divide-y divide-gray-200">
                    {sessions.filter(s => !s.isStandalone).map((session) => (
                      <li key={session.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-indigo-600 truncate">
                                {session.title}
                              </p>
                              {session.status === 'live' && (
                                <Badge variant="danger" className="bg-red-600 text-white">LIVE</Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-gray-500 flex items-center gap-3">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-4 w-4" />
                                {session.date}
                              </span>
                              <span className="flex items-center gap-1">
                                <ClockIcon className="h-4 w-4" />
                                {session.time}
                              </span>
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {session.course} ({session.courseCode})
                            </p>
                          </div>
                          
                          <div className="ml-4 flex gap-2">
                            {/* 🎯 Trigger Quiz Button - Only joined students receive */}
                            {session.status === 'live' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<TargetIcon className="h-4 w-4" />}
                                onClick={() => handleTriggerQuestion(session)}
                              >
                                Trigger Quiz
                              </Button>
                            )}
                            {/* Start Meeting button - Only show when meeting is NOT live */}
                            {session.status !== 'live' && (
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<PlayIcon className="h-4 w-4" />}
                                onClick={() => handleJoinSession(session)}
                              >
                                Start Meeting
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= CONNECTION QUALITY DETAILED PANEL ================= */}
      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
          <WifiIcon className="h-5 w-5 mr-2 text-indigo-600" />
          Your Connection Status
        </h2>
        <ConnectionQualityIndicator
          quality={connectionQuality}
          stats={latencyStats}
          currentRtt={currentRtt}
          isMonitoring={isLatencyMonitoring}
          showDetails={true}
          className="bg-white shadow rounded-lg"
        />
        {shouldAdjustEngagement() && (
          <div className="mt-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <WifiIcon className="h-5 w-5 text-yellow-600" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Connection Quality Alert</h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Your connection quality is currently <strong>{connectionQuality}</strong>. 
                  Engagement analytics will be adjusted to account for potential network-related issues.
                  Students with similar connectivity problems will not be misclassified as disengaged.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= STUDENT NETWORK MONITOR ================= */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900 flex items-center">
            <UsersIcon className="h-5 w-5 mr-2 text-indigo-600" />
            Student Network Monitor
            {selectedSession?.status === 'live' && (
              <Badge variant="danger" className="ml-2">LIVE</Badge>
            )}
          </h2>
          
          {/* Session Selector Dropdown */}
          {sessions.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Select Session:</label>
              <select
                value={selectedSession?.id || ''}
                onChange={(e) => {
                  const session = sessions.find(s => s.id === e.target.value);
                  setSelectedSession(session || null);
                }}
                className="block w-64 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              >
                <option value="">-- Select a session --</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} {session.status === 'live' ? '🔴 LIVE' : `(${session.date})`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        {/* Show monitor for selected session */}
        {selectedSession ? (
          <StudentNetworkMonitor
            sessionId={selectedSession.zoomMeetingId || selectedSession.id}
            autoRefresh={true}
            refreshInterval={2000}
            className=""
          />
        ) : sessions.length > 0 ? (
          /* Has sessions but none selected */
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <div className="flex flex-col items-center">
              <div className="rounded-full bg-indigo-100 p-4 mb-4">
                <UsersIcon className="h-8 w-8 text-indigo-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a Session to View Student Network
              </h3>
              <p className="text-sm text-gray-500 max-w-md mb-4">
                Choose a session from the dropdown above to monitor your students' 
                network quality and connection status.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {sessions.slice(0, 3).map((session) => (
                  <Button
                    key={session.id}
                    variant={session.status === 'live' ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedSession(session)}
                  >
                    {session.title} {session.status === 'live' && '🔴'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* No sessions at all */
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <div className="flex flex-col items-center">
              <div className="rounded-full bg-gray-100 p-4 mb-4">
                <WifiIcon className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Sessions Available
              </h3>
              <p className="text-sm text-gray-500 max-w-md">
                Create a session to start monitoring your students' network quality.
              </p>
              <Link to="/dashboard/sessions/create">
                <Button variant="primary" className="mt-4">
                  Create Session
                </Button>
              </Link>
            </div>
          </div>
        )}
        
        {/* Connection Quality Legend */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Connection Quality Guide</h4>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            <div className="p-2 bg-white rounded border border-blue-200">
              <div className="w-3 h-3 rounded-full bg-blue-500 mx-auto mb-1"></div>
              <span className="text-blue-700 font-medium">Excellent</span>
              <div className="text-gray-500">&lt;50ms</div>
            </div>
            <div className="p-2 bg-white rounded border border-blue-200">
              <div className="w-3 h-3 rounded-full bg-blue-400 mx-auto mb-1"></div>
              <span className="text-blue-600 font-medium">Good</span>
              <div className="text-gray-500">&lt;100ms</div>
            </div>
            <div className="p-2 bg-white rounded border border-yellow-200">
              <div className="w-3 h-3 rounded-full bg-yellow-500 mx-auto mb-1"></div>
              <span className="text-yellow-700 font-medium">Fair</span>
              <div className="text-gray-500">&lt;200ms</div>
            </div>
            <div className="p-2 bg-white rounded border border-orange-200">
              <div className="w-3 h-3 rounded-full bg-orange-500 mx-auto mb-1"></div>
              <span className="text-orange-700 font-medium">Poor</span>
              <div className="text-gray-500">&lt;500ms</div>
            </div>
            <div className="p-2 bg-white rounded border border-red-200">
              <div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-1"></div>
              <span className="text-red-700 font-medium">Critical</span>
              <div className="text-gray-500">≥500ms</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
