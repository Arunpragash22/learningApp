import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { courseService, Course, EnrolledStudent } from '../../services/courseService';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { toast } from 'sonner';
import {
  BookOpenIcon,
  PlusIcon,
  UsersIcon,
  KeyIcon,
  RefreshCwIcon,
  CopyIcon,
  TrashIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserMinusIcon,
  CalendarIcon,
  ClockIcon,
} from 'lucide-react';

export const CourseManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);

  // Fetch instructor's courses
  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const response = await courseService.getMyCourses();
      setCourses(response.courses || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch courses');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async (courseId: string) => {
    try {
      setLoadingStudents(true);
      const response = await courseService.getCourseStudents(courseId);
      setStudents(response.students || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch students');
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
    fetchStudents(course.id);
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('Enrollment key copied to clipboard!');
  };

  const handleRegenerateKey = async (courseId: string) => {
    try {
      setRegeneratingKey(courseId);
      const response = await courseService.regenerateEnrollmentKey(courseId);
      toast.success('New enrollment key generated!');
      
      // Update the course in state
      setCourses(prev => prev.map(c => 
        c.id === courseId ? { ...c, enrollmentKey: response.enrollmentKey } : c
      ));
      
      if (selectedCourse?.id === courseId) {
        setSelectedCourse(prev => prev ? { ...prev, enrollmentKey: response.enrollmentKey } : null);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to regenerate key');
    } finally {
      setRegeneratingKey(null);
    }
  };

  const handleToggleEnrollment = async (courseId: string, currentActive: boolean) => {
    try {
      await courseService.toggleEnrollment(courseId, !currentActive);
      toast.success(`Enrollment ${!currentActive ? 'enabled' : 'disabled'}!`);
      
      // Update the course in state
      setCourses(prev => prev.map(c => 
        c.id === courseId ? { ...c, enrollmentKeyActive: !currentActive } : c
      ));
      
      if (selectedCourse?.id === courseId) {
        setSelectedCourse(prev => prev ? { ...prev, enrollmentKeyActive: !currentActive } : null);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle enrollment');
    }
  };

  const handleRemoveStudent = async (courseId: string, studentId: string, studentName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${studentName} from this course?`)) {
      return;
    }
    
    try {
      await courseService.removeStudentFromCourse(courseId, studentId);
      toast.success(`${studentName} has been removed from the course`);
      
      // Update students list
      setStudents(prev => prev.filter(s => s.id !== studentId));
      
      // Update course enrolled count
      setCourses(prev => prev.map(c => 
        c.id === courseId 
          ? { ...c, enrolledStudents: c.enrolledStudents?.filter(id => id !== studentId) }
          : c
      ));
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove student');
    }
  };

  const handleDeleteCourse = async (courseId: string, courseTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete "${courseTitle}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await courseService.deleteCourse(courseId);
      toast.success('Course deleted successfully');
      setCourses(prev => prev.filter(c => c.id !== courseId));
      if (selectedCourse?.id === courseId) {
        setSelectedCourse(null);
        setStudents([]);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete course');
    }
  };

  const handlePublish = async (courseId: string) => {
    try {
      await courseService.updateCourse(courseId, { status: 'published' });
      toast.success('Course published! Students can now enroll.');
      setCourses(prev => prev.map(c => 
        c.id === courseId ? { ...c, status: 'published' } : c
      ));
      if (selectedCourse?.id === courseId) {
        setSelectedCourse(prev => prev ? { ...prev, status: 'published' } : null);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to publish course');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'success';
      case 'draft': return 'warning';
      case 'archived': return 'default';
      default: return 'default';
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCwIcon className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading your courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Course Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create courses, manage enrollment keys, and view enrolled students
          </p>
        </div>
        <Button
          onClick={() => navigate('/dashboard/courses/create')}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Create Course
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Course List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold flex items-center">
                <BookOpenIcon className="h-5 w-5 mr-2 text-indigo-600" />
                My Courses ({courses.length})
              </h2>
            </CardHeader>
            <CardContent className="p-0">
              {courses.length === 0 ? (
                <div className="p-6 text-center">
                  <BookOpenIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No courses yet</p>
                  <Button
                    size="sm"
                    onClick={() => navigate('/dashboard/courses/create')}
                    leftIcon={<PlusIcon className="h-4 w-4" />}
                  >
                    Create Your First Course
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {courses.map(course => (
                    <div
                      key={course.id}
                      onClick={() => handleSelectCourse(course)}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedCourse?.id === course.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">{course.title}</h3>
                          <p className="text-sm text-gray-500 mt-1">{course.category || 'No category'}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant={getStatusColor(course.status) as any} size="sm">
                              {course.status.toUpperCase()}
                            </Badge>
                            {course.courseCode && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                {course.courseCode}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-2">
                          <div className="flex items-center text-sm text-gray-500">
                            <UsersIcon className="h-4 w-4 mr-1" />
                            {course.enrolledStudents?.length || 0}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Course Details & Enrollment Key */}
        <div className="lg:col-span-2 space-y-6">
          {selectedCourse ? (
            <>
              {/* Course Info Card */}
              <Card>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedCourse.title}</h2>
                    <p className="text-sm text-gray-500 mt-1">{selectedCourse.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedCourse.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => handlePublish(selectedCourse.id)}
                        leftIcon={<CheckCircleIcon className="h-4 w-4" />}
                      >
                        Publish
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/courses/${selectedCourse.id}/edit`)}
                      leftIcon={<EditIcon className="h-4 w-4" />}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteCourse(selectedCourse.id, selectedCourse.title)}
                      leftIcon={<TrashIcon className="h-4 w-4" />}
                    >
                      Delete
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500 uppercase">Status</p>
                      <Badge variant={getStatusColor(selectedCourse.status) as any} className="mt-1">
                        {selectedCourse.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500 uppercase">Course Code</p>
                      <p className="font-medium text-gray-900 mt-1">{selectedCourse.courseCode || 'Not set'}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500 uppercase">Duration</p>
                      <p className="font-medium text-gray-900 mt-1">{selectedCourse.duration || 'Not set'}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-xs text-gray-500 uppercase">Enrolled</p>
                      <p className="font-medium text-gray-900 mt-1">
                        {selectedCourse.enrolledStudents?.length || 0}
                        {selectedCourse.maxStudents && ` / ${selectedCourse.maxStudents}`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Enrollment Key Card */}
              <Card className="border-2 border-indigo-200 bg-indigo-50/30">
                <CardHeader>
                  <h3 className="text-lg font-semibold flex items-center">
                    <KeyIcon className="h-5 w-5 mr-2 text-indigo-600" />
                    Enrollment Key
                  </h3>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 mb-2">
                        Share this key with students to let them enroll in your course:
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-4 py-3 bg-white border-2 border-indigo-300 rounded-lg font-mono text-xl font-bold text-indigo-700 tracking-widest text-center">
                          {selectedCourse.enrollmentKey || 'Generating...'}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyKey(selectedCourse.enrollmentKey || '')}
                          title="Copy to clipboard"
                        >
                          <CopyIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRegenerateKey(selectedCourse.id)}
                        disabled={regeneratingKey === selectedCourse.id}
                        leftIcon={<RefreshCwIcon className={`h-4 w-4 ${regeneratingKey === selectedCourse.id ? 'animate-spin' : ''}`} />}
                      >
                        New Key
                      </Button>
                      <Button
                        variant={selectedCourse.enrollmentKeyActive ? 'danger' : 'primary'}
                        size="sm"
                        onClick={() => handleToggleEnrollment(selectedCourse.id, selectedCourse.enrollmentKeyActive || false)}
                        leftIcon={selectedCourse.enrollmentKeyActive ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      >
                        {selectedCourse.enrollmentKeyActive ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center">
                    {selectedCourse.enrollmentKeyActive ? (
                      <span className="flex items-center text-sm text-blue-600">
                        <CheckCircleIcon className="h-4 w-4 mr-1" />
                        Enrollment is open - students can use this key to join
                      </span>
                    ) : (
                      <span className="flex items-center text-sm text-red-600">
                        <XCircleIcon className="h-4 w-4 mr-1" />
                        Enrollment is closed - key is currently disabled
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Enrolled Students Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center">
                    <UsersIcon className="h-5 w-5 mr-2 text-indigo-600" />
                    Enrolled Students ({students.length})
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchStudents(selectedCourse.id)}
                    leftIcon={<RefreshCwIcon className={`h-4 w-4 ${loadingStudents ? 'animate-spin' : ''}`} />}
                  >
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {loadingStudents ? (
                    <div className="text-center py-8">
                      <RefreshCwIcon className="h-6 w-6 animate-spin text-indigo-600 mx-auto mb-2" />
                      <p className="text-gray-500">Loading students...</p>
                    </div>
                  ) : students.length === 0 ? (
                    <div className="text-center py-8">
                      <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No students enrolled yet</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Share your enrollment key with students to get started
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enrolled</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {students.map(student => (
                            <tr key={student.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                                    <span className="text-sm font-medium text-indigo-600">
                                      {student.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <span className="ml-3 font-medium text-gray-900">{student.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {student.email}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {new Date(student.enrolledAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleRemoveStudent(selectedCourse.id, student.id, student.name)}
                                  leftIcon={<UserMinusIcon className="h-4 w-4" />}
                                >
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="p-12 text-center">
              <BookOpenIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Course</h3>
              <p className="text-gray-500">
                Click on a course from the list to view details, manage enrollment keys, and see enrolled students.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseManagement;

