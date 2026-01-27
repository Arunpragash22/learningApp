import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

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
  const [enrolledSessions, setEnrolledSessions] = useState<Set<string>>(new Set());

  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  // ---------------------------------------------------
  // ⭐ Load enrolled sessions from localStorage (for students)
  // ---------------------------------------------------
  useEffect(() => {
    if (!isInstructor) {
      const storedEnrolled = localStorage.getItem('enrolledSessions');
      if (storedEnrolled) {
        setEnrolledSessions(new Set(JSON.parse(storedEnrolled)));
      }
    }
  }, [isInstructor]);

  // ---------------------------------------------------
  // ⭐ Load sessions from BACKEND
  // ---------------------------------------------------
  useEffect(() => {
    const loadSessions = async () => {
      const all = await sessionService.getAllSessions();  // FIXED
      setSessions(all);
    };

    loadSessions();

    const interval = setInterval(loadSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------
  // ⭐ ENROLL IN SESSION (Students only - for standalone sessions)
  // ---------------------------------------------------
  const handleOpenEnrollModal = (session: Session) => {
    setEnrollingSession(session);
    setEnrollmentKey('');
    setShowEnrollModal(true);
  };

  const handleEnrollInSession = async () => {
    if (!enrollingSession || !enrollmentKey.trim()) {
      toast.error('Please enter an enrollment key');
      return;
    }

    setIsEnrolling(true);

    try {
      // Check if enrollment key matches the session
      // In a real app, this would be an API call
      // For now, we'll simulate it
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions/${enrollingSession.id}/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ enrollmentKey: enrollmentKey.trim() })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Add to enrolled sessions
        const newEnrolled = new Set(enrolledSessions);
        newEnrolled.add(enrollingSession.id);
        setEnrolledSessions(newEnrolled);
        
        // Save to localStorage
        localStorage.setItem('enrolledSessions', JSON.stringify(Array.from(newEnrolled)));
        
        toast.success(`Successfully enrolled in meeting "${enrollingSession.title}"!`);
        setShowEnrollModal(false);
        setEnrollmentKey('');
        setEnrollingSession(null);
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
      window.location.href = session.start_url;
      return;
    }

    if (!session.join_url) {
      alert("❌ Zoom join URL missing");
      return;
    }

    window.location.href = session.join_url;
  };

  // ---------------------------------------------------
  // ⭐ START SESSION (Instructor only)
  // ---------------------------------------------------
  const handleStartSession = async (sessionId: string) => {
    setStartingSessionId(sessionId);
    const result = await sessionService.startSession(sessionId);
    if (result.success) {
      toast.success('Session started successfully!');
      // Reload sessions to update status
      const all = await sessionService.getAllSessions();
      setSessions(all);
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

    // For students: only show enrolled sessions if it's a standalone session
    // Course-based sessions (isStandalone = false) are visible to all enrolled course students
    if (!isInstructor) {
      const isStandaloneSession = session.isStandalone === true;
      const hasEnrollmentKey = session.enrollmentKey && session.enrollmentKey.length > 0;
      
      if (isStandaloneSession && hasEnrollmentKey) {
        // Only show if student has enrolled
        if (!enrolledSessions.has(session.id)) {
          return false;
        }
      }
      // Course-based sessions are shown to all students
    }

    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    const order = { live: 0, upcoming: 1, completed: 2 };
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

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

  // Get unenrolled standalone sessions for students
  const unenrolledStandaloneSessions = !isInstructor 
    ? sessions.filter(session => {
        const isStandaloneSession = session.isStandalone === true;
        const hasEnrollmentKey = session.enrollmentKey && session.enrollmentKey.length > 0;
        return isStandaloneSession && hasEnrollmentKey && !enrolledSessions.has(session.id);
      })
    : [];

  return (
    <div className="py-6">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Live Meetings</h1>
          <p className="text-sm text-gray-500">Join ongoing and upcoming meetings</p>
        </div>

        {isInstructor && (
          <Button
            variant="primary"
            leftIcon={<PlusIcon className="h-4 w-4" />}
            onClick={() => navigate('/dashboard/sessions/create')}
          >
            Create Meeting
          </Button>
        )}
      </div>

      {/* Enrollment Key Modal for Students */}
      {showEnrollModal && enrollingSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Enroll in Meeting</h2>
                  <p className="text-sm text-gray-600 mt-1">{enrollingSession.title}</p>
                </div>
                <button
                  onClick={() => {
                    setShowEnrollModal(false);
                    setEnrollmentKey('');
                    setEnrollingSession(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Enrollment Key
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={enrollmentKey}
                    onChange={(e) => setEnrollmentKey(e.target.value.toUpperCase())}
                    placeholder="e.g., ABC12XYZ"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-lg tracking-wider uppercase"
                    maxLength={8}
                    disabled={isEnrolling}
                  />
                  <KeyIcon className="absolute right-3 top-3.5 h-5 w-5 text-gray-400" />
                </div>
                <p className="text-xs text-gray-500 mt-2">
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
                    <div key={session.id} className="flex items-center justify-between bg-white rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <LockIcon className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900">{session.title}</p>
                          <p className="text-xs text-gray-500">{session.date} • {session.time}</p>
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
              className="w-full p-2 pl-10 border rounded"
              placeholder="Search meetings…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <SearchIcon className="absolute left-3 top-2 h-5 w-5 text-gray-400" />
          </div>

          <button
            className="px-4 py-2 border rounded bg-white"
            onClick={() => setFilterActive((v) => !v)}
          >
            <CalendarIcon className="inline h-5 w-5 mr-2" />
            Filters
          </button>
        </div>

        {filterActive && (
          <div className="p-4 border-t">
            <label className="block text-sm mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border p-2 rounded w-full"
            >
              <option value="all">All</option>
              <option value="live">Live</option>
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        )}
      </Card>

      {/* Meeting Results */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <h3 className="text-gray-400">No meetings found</h3>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((session) => (
            <Card key={session.id} className="p-6">

              <div className="flex justify-between">

                {/* Info */}
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-semibold">{session.title}</h3>
                    {getStatusBadge(session.status)}
                  </div>

                  <p className="text-sm text-gray-600 flex items-center gap-2 mt-2">
                    <BookOpenIcon className="h-4 w-4" />
                    {session.course} ({session.courseCode})
                  </p>

                  <p className="text-sm text-gray-600 flex items-center gap-2 mt-2">
                    <UsersIcon className="h-4 w-4" />
                    {session.instructor}
                  </p>

                  <p className="text-sm text-gray-600 flex items-center gap-2 mt-2">
                    <CalendarIcon className="h-4 w-4" />
                    {session.date}
                  </p>

                  <p className="text-sm text-gray-600 flex items-center gap-2 mt-2">
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
                      onClick={() => handleStartSession(session.id)}
                      disabled={startingSessionId === session.id}
                    >
                      {startingSessionId === session.id ? 'Starting...' : 'Start Meeting'}
                    </Button>
                  )}

                  {/* JOIN LIVE */}
                  {session.status === 'live' && (
                    <Button
                      variant="primary"
                      leftIcon={<PlayIcon className="h-4 w-4" />}
                      onClick={() => handleJoinSession(session)}
                    >
                      Join Live
                    </Button>
                  )}

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
      )}
    </div>
  );
};
