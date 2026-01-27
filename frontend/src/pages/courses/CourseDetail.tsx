import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { EngagementIndicator } from '../../components/engagement/EngagementIndicator';
import { toast } from 'sonner';
import { 
  BookOpenIcon, UsersIcon, CalendarIcon, ClockIcon, 
  FileTextIcon, VideoIcon, DownloadIcon, TrendingUpIcon,
  ActivityIcon, BarChart3Icon, PlayIcon, CheckCircleIcon,
  PlusIcon, XIcon, EditIcon
} from 'lucide-react';

interface CourseSession {
  id: string;
  title: string;
  date: string;
  time: string;
  status: 'upcoming' | 'live' | 'completed';
  engagement?: number;
}

export const CourseDetail = () => {
  const { courseId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'overview' | 'sessions' | 'materials' | 'analytics'>('overview');
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [newSession, setNewSession] = useState({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    duration: '90 min',
    description: ''
  });
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({});

  // VITE_API_URL already includes /api, so we check for that
  const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  const API_BASE = API_URL?.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;

  // Handle URL parameters to auto-open session creation
  useEffect(() => {
    const tab = searchParams.get('tab');
    const action = searchParams.get('action');
    
    if (tab === 'sessions') {
      setActiveTab('sessions');
      if (action === 'create') {
        setShowCreateSession(true);
        // Clear the action parameter from URL
        searchParams.delete('action');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, setSearchParams]);

  // Mock course data with detailed analytics
  const course = {
    id: courseId,
    title: 'Machine Learning Fundamentals',
    code: 'CS301',
    instructor: 'Dr. Jane Smith',
    description: 'An introduction to machine learning concepts and algorithms. This course covers supervised and unsupervised learning, neural networks, and practical applications.',
    startDate: '2023-09-01',
    endDate: '2023-12-15',
    totalSessions: 12,
    completedSessions: 8,
    students: 45,
    progress: 67,
    engagement: 85,
    engagementLevel: 'high' as const,
    averageScore: 88,
    attendanceRate: 92,
    materials: [
      { id: 1, title: 'Introduction to ML', type: 'pdf', size: '2.4 MB', downloads: 42 },
      { id: 2, title: 'Supervised Learning', type: 'pdf', size: '3.1 MB', downloads: 38 },
      { id: 3, title: 'Neural Networks Overview', type: 'video', size: '125 MB', views: 35 },
      { id: 4, title: 'Assignment 1: Linear Regression', type: 'pdf', size: '1.2 MB', downloads: 40 }
    ],
    upcomingSessions: [
      { id: '1', title: 'Neural Networks', date: '2023-10-15', time: '14:00-15:30', status: 'upcoming' as const },
      { id: '2', title: 'Reinforcement Learning', date: '2023-10-22', time: '14:00-15:30', status: 'upcoming' as const }
    ],
    pastSessions: [
      { id: '3', title: 'Deep Learning Basics', date: '2023-10-08', time: '14:00-15:30', status: 'completed' as const, engagement: 88 },
      { id: '4', title: 'CNN Architectures', date: '2023-10-01', time: '14:00-15:30', status: 'completed' as const, engagement: 82 }
    ],
    analytics: {
      totalQuestions: 45,
      averageResponseTime: 8.5,
      participationRate: 85,
      quizAverage: 88
    }
  };

  const [courseSessions, setCourseSessions] = useState<{
    upcoming: CourseSession[];
    past: CourseSession[];
  }>({
    upcoming: course.upcomingSessions,
    past: course.pastSessions
  });

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BookOpenIcon },
    { id: 'sessions', label: 'Sessions', icon: CalendarIcon },
    { id: 'materials', label: 'Materials', icon: FileTextIcon },
    { id: 'analytics', label: 'Analytics', icon: BarChart3Icon }
  ];

  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  const validateSession = (): boolean => {
    const errors: Record<string, string> = {};

    if (!newSession.title.trim()) {
      errors.title = 'Session title is required';
    }
    if (!newSession.date) {
      errors.date = 'Date is required';
    }
    if (!newSession.startTime) {
      errors.startTime = 'Start time is required';
    }
    if (!newSession.endTime) {
      errors.endTime = 'End time is required';
    }
    if (newSession.startTime && newSession.endTime && newSession.startTime >= newSession.endTime) {
      errors.endTime = 'End time must be after start time';
    }

    setSessionErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSession = async () => {
    if (!validateSession()) return;

    setIsCreatingSession(true);

    try {
      const durationMatch = newSession.duration.match(/\d+/);
      const durationMinutes = durationMatch ? parseInt(durationMatch[0]) : 90;

      const payload = {
        title: newSession.title,
        course: course.title,
        courseCode: course.code,
        courseId: courseId,
        date: newSession.date,
        time: newSession.startTime,
        startTime: newSession.startTime,
        endTime: newSession.endTime,
        durationMinutes: durationMinutes,
        timezone: "Asia/Colombo",
        description: newSession.description,
        materials: [],
        isStandalone: false  // Course session - no enrollment key needed
      };

      console.log("📤 Creating course session:", payload);

      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({ detail: "Unknown error" }));
        console.error("❌ Backend error:", result);
        toast.error(result.detail || "Failed to create session");
        return;
      }

      const result = await res.json();
      console.log("✅ Session created:", result);

      // Add to upcoming sessions list
      const newSessionData: CourseSession = {
        id: result.id || Date.now().toString(),
        title: newSession.title,
        date: newSession.date,
        time: `${newSession.startTime}-${newSession.endTime}`,
        status: 'upcoming'
      };

      setCourseSessions(prev => ({
        ...prev,
        upcoming: [...prev.upcoming, newSessionData]
      }));

      // Reset form
      setNewSession({
        title: '',
        date: '',
        startTime: '',
        endTime: '',
        duration: '90 min',
        description: ''
      });
      setShowCreateSession(false);
      toast.success("Session created successfully! Students enrolled in this course can access it directly.");

    } catch (err: any) {
      console.error("❌ Error creating session:", err);
      toast.error(err.message || "Failed to create session");
    } finally {
      setIsCreatingSession(false);
    }
  };

  return (
    <div className="py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <Link
                to="/dashboard/courses"
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                ← Back to Courses
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{course.title}</h1>
            <p className="mt-1 text-lg text-gray-600">Course Code: {course.code}</p>
            <p className="mt-2 text-sm text-gray-500">Instructor: {course.instructor}</p>
          </div>
          <div className="flex space-x-3">
            {courseSessions.upcoming.length > 0 && (
              <Button
                variant="primary"
                leftIcon={<PlayIcon className="h-4 w-4" />}
                onClick={() => navigate(`/dashboard/sessions/${courseSessions.upcoming[0].id}`)}
              >
                Join Next Session
              </Button>
            )}
            {isInstructor && (
              <Button
                variant="outline"
                leftIcon={<BarChart3Icon className="h-4 w-4" />}
                onClick={() => navigate(`/dashboard/instructor/analytics`)}
              >
                View Analytics
              </Button>
            )}
        </div>
        </div>

        {/* Progress and Engagement */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Course Progress</p>
                <p className="text-2xl font-bold text-gray-900">{course.progress}%</p>
      </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <TrendingUpIcon className="h-6 w-6 text-blue-600" />
        </div>
            </div>
            <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${course.progress}%` }}
              />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-gray-600">Your Engagement</p>
              </div>
            </div>
            <EngagementIndicator
              engagementLevel={course.engagementLevel}
              engagementScore={course.engagement}
              showCluster={false}
            />
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Average Score</p>
                <p className="text-2xl font-bold text-gray-900">{course.averageScore}%</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <CheckCircleIcon className="h-6 w-6 text-blue-600" />
            </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Course Description</h3>
                <p className="text-gray-700 leading-relaxed">{course.description}</p>
                
                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Start Date</p>
                    <p className="text-sm font-medium text-gray-900">{course.startDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">End Date</p>
                    <p className="text-sm font-medium text-gray-900">{course.endDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Sessions</p>
                    <p className="text-sm font-medium text-gray-900">{course.totalSessions}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Enrolled Students</p>
                    <p className="text-sm font-medium text-gray-900">{course.students}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg mr-3">
                    <ActivityIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Attendance</p>
                    <p className="text-lg font-bold text-gray-900">{course.attendanceRate}%</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg mr-3">
                    <CheckCircleIcon className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Quiz Average</p>
                    <p className="text-lg font-bold text-gray-900">{course.analytics.quizAverage}%</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg mr-3">
                    <ClockIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Response Time</p>
                    <p className="text-lg font-bold text-gray-900">{course.analytics.averageResponseTime}s</p>
          </div>
                    </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center">
                  <div className="p-2 bg-orange-100 rounded-lg mr-3">
                    <UsersIcon className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Participation</p>
                    <p className="text-lg font-bold text-gray-900">{course.analytics.participationRate}%</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="space-y-6">
            {/* Create Session Button - Instructor Only */}
            {isInstructor && (
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Course Sessions</h3>
                  <p className="text-sm text-gray-500">
                    Sessions created here are accessible to all enrolled students without a separate enrollment key.
                  </p>
                </div>
                <Button
                  variant="primary"
                  leftIcon={<PlusIcon className="h-4 w-4" />}
                  onClick={() => setShowCreateSession(true)}
                >
                  Add Session
                </Button>
              </div>
            )}

            {/* Create Session Form */}
            {showCreateSession && isInstructor && (
              <Card className="border-2 border-indigo-200">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-gray-900">Create New Session</h4>
                    <button
                      onClick={() => setShowCreateSession(false)}
                      className="p-1 rounded-full hover:bg-gray-100"
                    >
                      <XIcon className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-green-800">
                      <strong>✓ No enrollment key needed:</strong> Students enrolled in "{course.title}" can access this session directly.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Session Title *
                      </label>
                      <Input
                        value={newSession.title}
                        onChange={(e) => setNewSession({ ...newSession, title: e.target.value })}
                        placeholder="e.g., Introduction to Neural Networks"
                        error={sessionErrors.title}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date *
                      </label>
                      <div className="relative">
                        <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          type="date"
                          value={newSession.date}
                          onChange={(e) => setNewSession({ ...newSession, date: e.target.value })}
                          className="pl-10"
                          error={sessionErrors.date}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Time *
                      </label>
                      <div className="relative">
                        <ClockIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          type="time"
                          value={newSession.startTime}
                          onChange={(e) => setNewSession({ ...newSession, startTime: e.target.value })}
                          className="pl-10"
                          error={sessionErrors.startTime}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Time *
                      </label>
                      <div className="relative">
                        <ClockIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <Input
                          type="time"
                          value={newSession.endTime}
                          onChange={(e) => setNewSession({ ...newSession, endTime: e.target.value })}
                          className="pl-10"
                          error={sessionErrors.endTime}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Duration
                      </label>
                      <Select
                        value={newSession.duration}
                        onChange={(e) => setNewSession({ ...newSession, duration: e.target.value })}
                        options={[
                          { value: '30 min', label: '30 minutes' },
                          { value: '60 min', label: '1 hour' },
                          { value: '90 min', label: '1.5 hours' },
                          { value: '120 min', label: '2 hours' },
                          { value: '180 min', label: '3 hours' }
                        ]}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description (optional)
                      </label>
                      <textarea
                        value={newSession.description}
                        onChange={(e) => setNewSession({ ...newSession, description: e.target.value })}
                        placeholder="Brief description of what will be covered..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3">
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateSession(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleCreateSession}
                      disabled={isCreatingSession}
                    >
                      {isCreatingSession ? 'Creating...' : 'Create Session'}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Upcoming Sessions */}
            {courseSessions.upcoming.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Sessions</h3>
                <div className="space-y-3">
                  {courseSessions.upcoming.map(session => (
                    <Card key={session.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h4 className="text-lg font-semibold text-gray-900">{session.title}</h4>
                            <Badge variant="success">Upcoming</Badge>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <div className="flex items-center">
                              <CalendarIcon className="h-4 w-4 mr-1" />
                              {session.date}
                            </div>
                            <div className="flex items-center">
                              <ClockIcon className="h-4 w-4 mr-1" />
                              {session.time}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {isInstructor && (
                            <Link to={`/dashboard/sessions/${session.id}/edit`}>
                              <Button variant="outline" leftIcon={<EditIcon className="h-4 w-4" />}>
                                Edit
                              </Button>
                            </Link>
                          )}
                          <Link to={`/dashboard/sessions/${session.id}`}>
                            <Button variant="primary" leftIcon={<PlayIcon className="h-4 w-4" />}>
                              Join
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Past Sessions */}
            {courseSessions.past.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Past Sessions</h3>
                <div className="space-y-3">
                  {courseSessions.past.map(session => (
                    <Card key={session.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h4 className="text-lg font-semibold text-gray-900">{session.title}</h4>
                            <Badge variant="default">Completed</Badge>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                            <div className="flex items-center">
                              <CalendarIcon className="h-4 w-4 mr-1" />
                              {session.date}
                            </div>
                            <div className="flex items-center">
                              <ClockIcon className="h-4 w-4 mr-1" />
                              {session.time}
                            </div>
                            {session.engagement && (
                              <div className="flex items-center">
                                <ActivityIcon className="h-4 w-4 mr-1" />
                                Engagement: {session.engagement}%
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {isInstructor && (
                            <Link to={`/dashboard/sessions/${session.id}/edit`}>
                              <Button variant="outline" leftIcon={<EditIcon className="h-4 w-4" />}>
                                Edit
                              </Button>
                            </Link>
                          )}
                          <Link to={`/dashboard/sessions/${session.id}`}>
                            <Button variant="outline">View Recording</Button>
                          </Link>
                        </div>
                      </div>
                    </Card>
                  ))}
          </div>
        </div>
            )}

            {/* Empty State */}
            {courseSessions.upcoming.length === 0 && courseSessions.past.length === 0 && (
              <Card className="p-8 text-center">
                <CalendarIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Sessions Yet</h3>
                <p className="text-gray-500 mb-4">
                  {isInstructor
                    ? 'Create your first session for this course.'
                    : 'No sessions have been scheduled for this course yet.'}
                </p>
                {isInstructor && (
                  <Button
                    variant="primary"
                    leftIcon={<PlusIcon className="h-4 w-4" />}
                    onClick={() => setShowCreateSession(true)}
                  >
                    Create First Session
                  </Button>
                )}
              </Card>
            )}
          </div>
        )}

        {activeTab === 'materials' && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Course Materials</h3>
            <div className="space-y-3">
              {course.materials.map(material => (
                <Card key={material.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <div className={`p-3 rounded-lg ${
                        material.type === 'pdf' ? 'bg-red-100' : 'bg-blue-100'
                      }`}>
                        {material.type === 'pdf' ? (
                          <FileTextIcon className={`h-6 w-6 ${
                            material.type === 'pdf' ? 'text-red-600' : 'text-blue-600'
                          }`} />
                        ) : (
                          <VideoIcon className="h-6 w-6 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-gray-900">{material.title}</h4>
                        <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                          <span>{material.size}</span>
                          <span>•</span>
                          <span>
                            {material.type === 'pdf' 
                              ? `${material.downloads} downloads`
                              : `${material.views} views`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button className="ml-4 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <DownloadIcon className="h-5 w-5" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Analytics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Engagement Metrics</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Overall Engagement</span>
                      <span className="text-sm font-semibold text-gray-900">{course.engagement}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${course.engagement}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Participation Stats</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Questions Answered</span>
                      <span className="font-semibold text-gray-900">{course.analytics.totalQuestions}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Participation Rate</span>
                      <span className="font-semibold text-gray-900">{course.analytics.participationRate}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Avg Response Time</span>
                      <span className="font-semibold text-gray-900">{course.analytics.averageResponseTime}s</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
