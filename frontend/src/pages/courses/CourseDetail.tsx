import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { toast } from 'sonner';
import {
  courseService,
  type Course,
} from '../../services/courseService';
import { sessionService, type Session } from '../../services/sessionService';
import { 
  CalendarIcon, ClockIcon, 
  FileTextIcon, DownloadIcon,
  ActivityIcon, PlayIcon,
  PlusIcon, XIcon, EditIcon, Loader2Icon
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'sessions' | 'materials'>('sessions');
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

  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [newMaterial, setNewMaterial] = useState<{ title: string; description: string; file: File | null }>({ title: '', description: '', file: null });
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);

  const [course, setCourse] = useState<Course | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [courseError, setCourseError] = useState<string | null>(null);

  // VITE_API_URL already includes /api, so we check for that
  const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  const API_BASE = API_URL?.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;

  // Fetch course from API
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setCourseLoading(true);
    setCourseError(null);
    courseService
      .getCourseById(courseId)
      .then((res) => {
        if (!cancelled && res.success && res.course) {
          setCourse(res.course);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCourseError(err.message || 'Failed to load course');
          toast.error(err.message || 'Failed to load course');
        }
      })
      .finally(() => {
        if (!cancelled) setCourseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  // Handle URL parameters to auto-open session creation
  useEffect(() => {
    const tab = searchParams.get('tab');
    const action = searchParams.get('action');
    if (tab === 'sessions') {
      setActiveTab('sessions');
      if (action === 'create') {
        setShowCreateSession(true);
        searchParams.delete('action');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, setSearchParams]);

  const [courseSessions, setCourseSessions] = useState<{
    upcoming: CourseSession[];
    past: CourseSession[];
  }>({
    upcoming: [],
    past: [],
  });

  // Fetch sessions for this course from API
  useEffect(() => {
    if (!courseId) return;
    sessionService.getSessionsByCourse(courseId).then((sessions: Session[]) => {
      const toCourseSession = (s: Session): CourseSession => ({
        id: s.id,
        title: s.title,
        date: s.date,
        time: s.time,
        status: s.status === 'completed' ? 'completed' : 'upcoming',
        engagement: s.engagement,
      });
      const upcoming = sessions.filter(s => s.status !== 'completed').map(toCourseSession);
      const past = sessions.filter(s => s.status === 'completed').map(toCourseSession);
      setCourseSessions({ upcoming, past });
    });
  }, [courseId]);

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
    } catch {
      return iso;
    }
  };

  const downloadMaterialUrl = (url: string, filename?: string) => {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    const token = sessionStorage.getItem('access_token');
    fetch(fullUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || 'material.pdf';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error('Failed to download'));
  };

  const tabs = [
    { id: 'sessions', label: 'Lessons', icon: CalendarIcon },
    { id: 'materials', label: 'Learning Materials', icon: FileTextIcon },
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
        course: course?.title ?? '',
        courseCode: course?.id ?? courseId ?? '',
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
          Authorization: `Bearer ${sessionStorage.getItem("access_token")}`
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

      // Refresh session list from API so the new session appears
      if (courseId) {
        sessionService.getSessionsByCourse(courseId).then((sessions: Session[]) => {
          const toCourseSession = (s: Session): CourseSession => ({
            id: s.id,
            title: s.title,
            date: s.date,
            time: s.time,
            status: s.status === 'completed' ? 'completed' : 'upcoming',
            engagement: s.engagement,
          });
          const upcoming = sessions.filter(s => s.status !== 'completed').map(toCourseSession);
          const past = sessions.filter(s => s.status === 'completed').map(toCourseSession);
          setCourseSessions({ upcoming, past });
        });
      } else {
        setCourseSessions(prev => ({
          ...prev,
          upcoming: [...prev.upcoming, newSessionData]
        }));
      }

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
      toast.success("Lesson created successfully! Students enrolled in this course can access it directly.");

    } catch (err: any) {
      console.error("❌ Error creating session:", err);
      toast.error(err.message || "Failed to create lesson");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleAddMaterial = async () => {
    if (!newMaterial.title.trim()) {
      toast.error('Material title is required');
      return;
    }
    if (!newMaterial.file) {
      toast.error('Please select a PDF file');
      return;
    }
    if (!newMaterial.file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are allowed');
      return;
    }
    if (!courseId || !course) return;
    setIsAddingMaterial(true);
    try {
      const uploadRes = await courseService.uploadCourseMaterial(
        courseId,
        newMaterial.file,
        newMaterial.title.trim(),
        newMaterial.description.trim() || undefined,
      );
      if (!uploadRes.success || !uploadRes.url) {
        toast.error('Upload failed');
        return;
      }
      const fileUrl = uploadRes.url.startsWith('http') ? uploadRes.url : `${API_BASE}${uploadRes.url}`;
      const updatedSyllabus = [
        ...(course.syllabus || []),
        {
          title: newMaterial.title.trim(),
          ...(newMaterial.description.trim() && { description: newMaterial.description.trim() }),
          url: fileUrl,
        },
      ];
      const res = await courseService.updateCourse(courseId, { syllabus: updatedSyllabus });
      if (res.success && res.course) {
        setCourse(res.course);
        setNewMaterial({ title: '', description: '', file: null });
        setShowAddMaterial(false);
        toast.success('Material added. Students can download the PDF.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to add material');
    } finally {
      setIsAddingMaterial(false);
    }
  };

  if (courseLoading) {
    return (
      <div className="py-6 flex items-center justify-center min-h-[200px]">
        <Loader2Icon className="h-10 w-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="py-6">
        <Link
          to="/dashboard/courses"
          className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-4 inline-block"
        >
          ← Back to Courses
        </Link>
        <Card className="p-6">
          <p className="text-gray-600">{courseError ?? 'Course not found.'}</p>
        </Card>
      </div>
    );
  }

  const durationDisplay =
    course.duration ||
    (course.startDate && course.endDate
      ? `${formatDate(course.startDate)} – ${formatDate(course.endDate)}`
      : '—');

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
            {course.courseCode && <p className="mt-1 text-lg text-gray-600">Course Code: {course.courseCode}</p>}
            <p className="mt-2 text-sm text-gray-500">Instructor: {course.instructorName}</p>
          </div>
        </div>

        {/* Course details: instructor, description, duration from database */}
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Course details</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-600">Instructor</p>
              <p className="text-gray-900">{course.instructorName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Description</p>
              <p className="text-gray-700 leading-relaxed">{course.description || '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Duration</p>
              <p className="text-gray-900">{durationDisplay}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Number of enrolled students</p>
              <p className="text-gray-900">{course.enrolledStudents?.length ?? 0}</p>
            </div>
          </div>
        </Card>
      </div>

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
        {activeTab === 'sessions' && (
          <div className="space-y-6">
            {/* Create Session Button - Instructor Only */}
            {isInstructor && (
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Course Lessons</h3>
                  <p className="text-sm text-gray-500">
                    Lessons created here are accessible to all enrolled students without a separate enrollment key.
                  </p>
                </div>
                <Button
                  variant="primary"
                  leftIcon={<PlusIcon className="h-4 w-4" />}
                  onClick={() => setShowCreateSession(true)}
                >
                  Add Lesson
                </Button>
              </div>
            )}

            {/* Create Session Form */}
            {showCreateSession && isInstructor && (
              <Card className="border-2 border-indigo-200">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-gray-900">Create New Lesson</h4>
                    <button
                      onClick={() => setShowCreateSession(false)}
                      className="p-1 rounded-full hover:bg-gray-100"
                    >
                      <XIcon className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-green-800">
                      <strong>✓ No enrollment key needed:</strong> Students enrolled in "{course.title}" can access this lesson directly.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Lesson Title *
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
                      {isCreatingSession ? 'Creating...' : 'Create Lesson'}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Upcoming Sessions */}
            {courseSessions.upcoming.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Lessons</h3>
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Past Lessons</h3>
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
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Lessons Yet</h3>
                <p className="text-gray-500 mb-4">
                  {isInstructor
                    ? 'Create your first lesson for this course.'
                    : 'No lessons have been scheduled for this course yet.'}
                </p>
                {isInstructor && (
                  <Button
                    variant="primary"
                    leftIcon={<PlusIcon className="h-4 w-4" />}
                    onClick={() => setShowCreateSession(true)}
                  >
                    Create First Lesson
                  </Button>
                )}
              </Card>
            )}
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="space-y-6">
            {isInstructor && (
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Course Materials</h3>
                  <p className="text-sm text-gray-500">Add PDF materials that enrolled students can download.</p>
                </div>
                <Button
                  variant="primary"
                  leftIcon={<PlusIcon className="h-4 w-4" />}
                  onClick={() => setShowAddMaterial(true)}
                >
                  Add Material
                </Button>
              </div>
            )}
            {!isInstructor && (
              <h3 className="text-lg font-semibold text-gray-900">Course Materials</h3>
            )}

            {showAddMaterial && isInstructor && (
              <Card className="border-2 border-indigo-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-gray-900">Add New Material (PDF)</h4>
                  <button
                    onClick={() => { setShowAddMaterial(false); setNewMaterial({ title: '', description: '', file: null }); }}
                    className="p-1 rounded-full hover:bg-gray-100"
                  >
                    <XIcon className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                    <Input
                      value={newMaterial.title}
                      onChange={(e) => setNewMaterial({ ...newMaterial, title: e.target.value })}
                      placeholder="e.g., Week 1 Lecture Notes"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                    <textarea
                      value={newMaterial.description}
                      onChange={(e) => setNewMaterial({ ...newMaterial, description: e.target.value })}
                      placeholder="Brief description of the material"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PDF file *</label>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => setNewMaterial({ ...newMaterial, file: e.target.files?.[0] ?? null })}
                      className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    {newMaterial.file && (
                      <p className="mt-1 text-sm text-gray-500">{newMaterial.file.name}</p>
                    )}
                  </div>
                  <div className="flex justify-end space-x-3">
                    <Button variant="outline" onClick={() => { setShowAddMaterial(false); setNewMaterial({ title: '', description: '', file: null }); }}>
                      Cancel
                    </Button>
                    <Button variant="primary" onClick={handleAddMaterial} disabled={isAddingMaterial}>
                      {isAddingMaterial ? 'Uploading...' : 'Add Material'}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <div className="space-y-3">
              {course.syllabus && course.syllabus.length > 0 ? (
                course.syllabus.map((item, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4 flex-1">
                        <div className="p-3 rounded-lg bg-blue-100">
                          <FileTextIcon className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-semibold text-gray-900">{item.title}</h4>
                          {item.description && (
                            <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                          )}
                        </div>
                      </div>
                      {item.url && (
                        <button
                          type="button"
                          onClick={() => downloadMaterialUrl(item.url!, item.title + '.pdf')}
                          className="ml-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          Download PDF
                        </button>
                      )}
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="p-8 text-center">
                  <FileTextIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">
                    {isInstructor ? 'No materials yet. Click "Add Material" to add one.' : 'No materials have been added for this course yet.'}
                  </p>
                </Card>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
