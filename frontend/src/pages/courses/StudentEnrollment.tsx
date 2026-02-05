import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { courseService, Course } from '../../services/courseService';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { toast } from 'sonner';
import {
  BookOpenIcon,
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon,
  UsersIcon,
  CalendarIcon,
  ClockIcon,
  LogOutIcon,
  RefreshCwIcon,
  ArrowRightIcon,
} from 'lucide-react';

export const StudentEnrollment = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentlyEnrolled, setRecentlyEnrolled] = useState<Course | null>(null);

  useEffect(() => {
    fetchEnrolledCourses();
  }, []);

  const fetchEnrolledCourses = async () => {
    try {
      setLoading(true);
      const response = await courseService.getMyEnrolledCourses();
      setEnrolledCourses(response.courses || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch enrolled courses');
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!enrollmentKey.trim()) {
      toast.error('Please enter an enrollment key');
      return;
    }

    try {
      setEnrolling(true);
      const response = await courseService.enrollWithKey(enrollmentKey.trim().toUpperCase());
      
      toast.success(response.message || 'Successfully enrolled!');
      setRecentlyEnrolled(response.course);
      setEnrollmentKey('');
      
      // Refresh enrolled courses
      fetchEnrolledCourses();
    } catch (error: any) {
      toast.error(error.message || 'Failed to enroll. Please check your key.');
    } finally {
      setEnrolling(false);
    }
  };

  const handleUnenroll = async (courseId: string, courseTitle: string) => {
    if (!window.confirm(`Are you sure you want to unenroll from "${courseTitle}"?`)) {
      return;
    }

    try {
      await courseService.unenrollFromCourse(courseId);
      toast.success('Successfully unenrolled from the course');
      setEnrolledCourses(prev => prev.filter(c => c.id !== courseId));
    } catch (error: any) {
      toast.error(error.message || 'Failed to unenroll');
    }
  };


  return (
    <div className="py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Course Enrollment</h1>
        <p className="text-gray-500">
          Enter the enrollment key provided by your instructor to join a course
        </p>
      </div>

      {/* Enrollment Form */}
      <Card className="mb-8 border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
        <CardContent className="p-8">
          <form onSubmit={handleEnroll} className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
                <KeyIcon className="h-8 w-8 text-indigo-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Enter Enrollment Key
              </h2>
              <p className="text-sm text-gray-500">
                Get this key from your instructor
              </p>
            </div>

            <div className="max-w-md mx-auto">
              <input
                type="text"
                value={enrollmentKey}
                onChange={(e) => setEnrollmentKey(e.target.value.toUpperCase())}
                placeholder="Enter key (e.g., ABC12345)"
                className="block w-full px-6 py-4 text-center text-2xl font-mono font-bold tracking-widest border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase placeholder:text-gray-400 placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
                maxLength={10}
              />
            </div>

            <div className="text-center">
              <Button
                type="submit"
                size="lg"
                disabled={enrolling || !enrollmentKey.trim()}
                leftIcon={enrolling ? <RefreshCwIcon className="h-5 w-5 animate-spin" /> : <CheckCircleIcon className="h-5 w-5" />}
              >
                {enrolling ? 'Enrolling...' : 'Enroll in Course'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recently Enrolled Success */}
      {recentlyEnrolled && (
        <Card className="mb-8 border-2 border-blue-200 bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-start">
              <CheckCircleIcon className="h-8 w-8 text-blue-500 mr-4 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-blue-800 mb-1">
                  Successfully Enrolled!
                </h3>
                <p className="text-blue-700 mb-3">
                  You are now enrolled in <strong>{recentlyEnrolled.title}</strong>
                </p>
                <p className="text-sm text-blue-600 mb-4">
                  Instructor: {recentlyEnrolled.instructorName}
                </p>
                <div className="flex gap-3">
                  <Button
                    size="sm"
                    onClick={() => navigate('/dashboard/sessions')}
                    rightIcon={<ArrowRightIcon className="h-4 w-4" />}
                  >
                    View Sessions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRecentlyEnrolled(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enrolled Courses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center">
            <BookOpenIcon className="h-5 w-5 mr-2 text-indigo-600" />
            My Enrolled Courses ({enrolledCourses.length})
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEnrolledCourses}
            leftIcon={<RefreshCwIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <RefreshCwIcon className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
              <p className="text-gray-500">Loading your courses...</p>
            </div>
          ) : enrolledCourses.length === 0 ? (
            <div className="text-center py-12">
              <BookOpenIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No courses yet</h3>
              <p className="text-gray-500 mb-4">
                Enter an enrollment key above to join your first course
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {enrolledCourses.map(course => (
                <div
                  key={course.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{course.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{course.instructorName}</p>
                    </div>
                    {course.courseCode && (
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                        {course.courseCode}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {course.description}
                  </p>

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    {course.duration && (
                      <span className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-1" />
                        {course.duration}
                      </span>
                    )}
                    <span className="flex items-center">
                      <UsersIcon className="h-4 w-4 mr-1" />
                      {course.enrolledStudents?.length || 0} students
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => navigate('/dashboard/sessions')}
                    >
                      View Sessions
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnenroll(course.id, course.title)}
                      leftIcon={<LogOutIcon className="h-4 w-4" />}
                      className="text-red-600 hover:bg-red-50"
                    >
                      Leave
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="mt-8 bg-gray-50">
        <CardContent className="p-6">
          <h3 className="font-semibold text-gray-900 mb-3">How to Enroll</h3>
          <ol className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-medium mr-3">1</span>
              <span>Get the enrollment key from your instructor (looks like: ABC12345)</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-medium mr-3">2</span>
              <span>Enter the key in the box above and click "Enroll in Course"</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-medium mr-3">3</span>
              <span>Once enrolled, you can access course lessons and materials</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentEnrollment;

