import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { courseService, Course } from '../../services/courseService';
import { 
  SearchIcon, 
  FilterIcon, 
  BookOpenIcon, 
  UsersIcon, 
  CalendarIcon, 
  PlusIcon,
  KeyIcon,
  RefreshCwIcon,
  CopyIcon,
  SettingsIcon,
  VideoIcon,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { toast } from 'sonner';

export const CourseList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  // Fetch courses from backend
  useEffect(() => {
    fetchCourses();
  }, [user]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let response;
      if (isInstructor) {
        // Instructors see their own courses
        response = await courseService.getMyCourses();
      } else {
        // Students see their enrolled courses
        response = await courseService.getMyEnrolledCourses();
      }
      
      setCourses(response.courses || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch courses');
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyKey = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(key);
    toast.success('Enrollment key copied!');
  };

  // Filter and sort courses
  let filteredCourses = courses.filter(course => {
    const matchesSearch = 
      course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (course.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.instructorName.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (statusFilter === 'published') {
      return course.status === 'published';
    } else if (statusFilter === 'draft') {
      return course.status === 'draft';
    }
    
    return true;
  });

  // Sort courses
  filteredCourses = [...filteredCourses].sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'students':
        return (b.enrolledStudents?.length || 0) - (a.enrolledStudents?.length || 0);
      case 'recent':
      default:
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge variant="success">Published</Badge>;
      case 'draft':
        return <Badge variant="warning">Draft</Badge>;
      case 'archived':
        return <Badge variant="default">Archived</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };


  const getCourseGradient = (index: number) => {
    const gradients = [
      'bg-gradient-to-br from-indigo-500 to-purple-600',
      'bg-gradient-to-br from-blue-500 to-blue-600',
      'bg-gradient-to-br from-blue-500 to-blue-600',
      'bg-gradient-to-br from-orange-500 to-red-600',
      'bg-gradient-to-br from-pink-500 to-rose-600',
      'bg-gradient-to-br from-violet-500 to-purple-600',
    ];
    return gradients[index % gradients.length];
  };

  if (loading) {
    return (
      <div className="py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <RefreshCwIcon className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
            <p className="text-gray-500">Loading courses...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My Courses</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isInstructor ? 'Courses you are teaching' : 'Courses you are enrolled in'}
          </p>
        </div>
        <div className="flex gap-2 mt-4 sm:mt-0">
          {isInstructor && (
            <>
              <Button
                onClick={() => navigate('/dashboard/courses/create')}
                leftIcon={<PlusIcon className="h-4 w-4" />}
              >
                Create New Course
              </Button>
            </>
          )}
          {!isInstructor && (
            <Button
              onClick={() => navigate('/dashboard/student/enrollment')}
              leftIcon={<KeyIcon className="h-4 w-4" />}
            >
              Enroll with Key
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filter */}
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search courses..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFilterActive(!filterActive)}
                className={`inline-flex items-center px-4 py-2 border rounded-md text-sm font-medium ${
                  filterActive
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
              >
                <FilterIcon className="-ml-1 mr-2 h-5 w-5" />
                Filters
              </button>
            </div>
          </div>

          {/* Filter Options */}
          {filterActive && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="max-w-xs">
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  <option value="all">All Courses</option>
                  <option value="published">Published</option>
                  {isInstructor && <option value="draft">Draft</option>}
                </select>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Error Message */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <div className="p-4 text-red-700">
            {error}
            <Button variant="outline" size="sm" onClick={fetchCourses} className="ml-4">
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Course Grid */}
      {filteredCourses.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpenIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-gray-900">
            {courses.length === 0 
              ? (isInstructor ? 'No courses created yet' : 'No courses enrolled')
              : 'No courses found'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {courses.length === 0 
              ? (isInstructor 
                  ? 'Create your first course to get started.'
                  : 'Use an enrollment key to join a course.')
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {courses.length === 0 && (
            <div className="mt-6">
              {isInstructor ? (
                <Button onClick={() => navigate('/dashboard/courses/create')} leftIcon={<PlusIcon className="h-4 w-4" />}>
                  Create Your First Course
                </Button>
              ) : (
                <Button onClick={() => navigate('/dashboard/student/enrollment')} leftIcon={<KeyIcon className="h-4 w-4" />}>
                  Enroll with Key
                </Button>
              )}
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course, index) => (
            <Card key={course.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className={`${getCourseGradient(index)} p-6 text-white`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-1 line-clamp-2">{course.title}</h3>
                    <p className="text-white/80 text-sm">{course.category || 'General'}</p>
                  </div>
                  {isInstructor && (
                    <div className="ml-2">
                      {getStatusBadge(course.status)}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <UsersIcon className="h-4 w-4 mr-1" />
                    <span>{course.instructorName}</span>
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

                {/* Enrollment Key for Instructors */}
                {isInstructor && course.enrollmentKey && (
                  <div className="mb-4 p-3 bg-indigo-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-sm">
                        <KeyIcon className="h-4 w-4 text-indigo-600 mr-2" />
                        <span className="font-mono font-bold text-indigo-700">{course.enrollmentKey}</span>
                      </div>
                      <button
                        onClick={(e) => handleCopyKey(course.enrollmentKey!, e)}
                        className="p-1 hover:bg-indigo-100 rounded"
                        title="Copy key"
                      >
                        <CopyIcon className="h-4 w-4 text-indigo-600" />
                      </button>
                    </div>
                    <p className="text-xs text-indigo-600 mt-1">
                      {course.enrollmentKeyActive ? '✅ Enrollment open' : '❌ Enrollment closed'}
                    </p>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-gray-200">
                  <div>
                    <div className="flex items-center text-sm text-gray-600 mb-1">
                      <UsersIcon className="h-4 w-4 mr-1" />
                      <span>Students</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900">
                      {course.enrolledStudents?.length || 0}
                      {course.maxStudents && <span className="text-sm text-gray-500">/{course.maxStudents}</span>}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center text-sm text-gray-600 mb-1">
                      <CalendarIcon className="h-4 w-4 mr-1" />
                      <span>Duration</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900">
                      {course.duration || 'Ongoing'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col space-y-2">
                  <Link
                    to={`/dashboard/courses/${course.id}`}
                    className="text-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
                  >
                    View Details
                  </Link>
                  {isInstructor && (
                    <div className="flex space-x-2">
                      <Link
                        to={`/dashboard/courses/${course.id}?tab=sessions&action=create`}
                        className="flex-1 text-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors flex items-center justify-center"
                      >
                        <VideoIcon className="h-4 w-4 mr-1" />
                        Create Lesson
                      </Link>
                      <Link
                        to={`/dashboard/courses/${course.id}/edit`}
                        className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
                      >
                        Edit
                      </Link>
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
