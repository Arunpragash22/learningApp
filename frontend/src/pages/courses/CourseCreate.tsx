import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { courseService } from '../../services/courseService';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from 'sonner';
import {
  BookOpenIcon,
  ArrowLeftIcon,
  SaveIcon,
  KeyIcon,
  UsersIcon,
  CalendarIcon,
  TagIcon,
  HashIcon,
} from 'lucide-react';

export const CourseCreate = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    duration: '',
    courseCode: '',
    maxStudents: 50,
    status: 'draft' as 'draft' | 'published',
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [createdCourse, setCreatedCourse] = useState<any>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'maxStudents' ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error('Course title is required');
      return;
    }
    
    if (!formData.description.trim()) {
      toast.error('Course description is required');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await courseService.createCourse({
        title: formData.title,
        description: formData.description,
        category: formData.category || undefined,
        duration: formData.duration || undefined,
        courseCode: formData.courseCode || undefined,
        maxStudents: formData.maxStudents || undefined,
        status: formData.status,
      });
      
      toast.success('Course created successfully!');
      setCreatedCourse(response.course);
      
    } catch (error: any) {
      toast.error(error.message || 'Failed to create course');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (createdCourse?.enrollmentKey) {
      navigator.clipboard.writeText(createdCourse.enrollmentKey);
      toast.success('Enrollment key copied!');
    }
  };

  // Show success screen with enrollment key after creation
  if (createdCourse) {
    return (
      <div className="py-6 max-w-2xl mx-auto">
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpenIcon className="h-8 w-8 text-blue-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-blue-800 mb-2">
              Course Created Successfully!
            </h2>
            
            <p className="text-blue-700 mb-6">
              "{createdCourse.title}" has been created.
            </p>

            {/* Enrollment Key Display */}
            <div className="bg-white rounded-lg p-6 mb-6 border-2 border-blue-300">
              <div className="flex items-center justify-center mb-3">
                <KeyIcon className="h-6 w-6 text-indigo-600 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">Enrollment Key</h3>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Share this key with your students so they can enroll:
              </p>
              
              <div className="flex items-center justify-center gap-3">
                <code className="px-6 py-3 bg-indigo-50 border-2 border-indigo-300 rounded-lg font-mono text-2xl font-bold text-indigo-700 tracking-widest">
                  {createdCourse.enrollmentKey}
                </code>
                <Button variant="outline" onClick={handleCopyKey}>
                  Copy
                </Button>
              </div>
              
              <p className="text-xs text-gray-500 mt-4">
                {createdCourse.status === 'draft' 
                  ? '⚠️ Note: Publish the course to allow students to enroll.'
                  : '✅ Course is published and ready for enrollment.'}
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => navigate('/dashboard/instructor/courses')}
              >
                View All Courses
              </Button>
              <Button
                onClick={() => {
                  setCreatedCourse(null);
                  setFormData({
                    title: '',
                    description: '',
                    category: '',
                    duration: '',
                    courseCode: '',
                    maxStudents: 50,
                    status: 'draft',
                  });
                }}
              >
                Create Another Course
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="py-6">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="outline"
          leftIcon={<ArrowLeftIcon className="h-4 w-4" />}
          onClick={() => navigate('/dashboard/instructor/courses')}
          className="mb-4"
        >
          Back to Courses
        </Button>

        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <BookOpenIcon className="h-7 w-7 mr-3 text-indigo-600" />
          Create New Course
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Fill in the details to create a new course. An enrollment key will be automatically generated.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Course Information</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Course Title *
                  </label>
                  <Input
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="e.g., Introduction to Machine Learning"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Describe what students will learn in this course..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <TagIcon className="h-4 w-4 inline mr-1" />
                      Category
                    </label>
                    <Input
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      placeholder="e.g., Computer Science, AI, Web Dev"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <CalendarIcon className="h-4 w-4 inline mr-1" />
                      Duration
                    </label>
                    <Input
                      name="duration"
                      value={formData.duration}
                      onChange={handleChange}
                      placeholder="e.g., 8 weeks, 3 months"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <HashIcon className="h-4 w-4 inline mr-1" />
                      Course Code
                    </label>
                    <Input
                      name="courseCode"
                      value={formData.courseCode}
                      onChange={handleChange}
                      placeholder="e.g., CS101, WEB201"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <UsersIcon className="h-4 w-4 inline mr-1" />
                      Max Students
                    </label>
                    <Input
                      type="number"
                      name="maxStudents"
                      value={formData.maxStudents}
                      onChange={handleChange}
                      min="1"
                      placeholder="Maximum enrollment"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Publish Settings</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Status
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="status"
                        value="draft"
                        checked={formData.status === 'draft'}
                        onChange={handleChange}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        Draft - Not visible to students
                      </span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="status"
                        value="published"
                        checked={formData.status === 'published'}
                        onChange={handleChange}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        Published - Students can enroll
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    leftIcon={<SaveIcon className="h-4 w-4" />}
                  >
                    {isLoading ? 'Creating...' : 'Create Course'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-indigo-50 border-indigo-200">
              <CardContent className="p-4">
                <div className="flex items-start">
                  <KeyIcon className="h-5 w-5 text-indigo-600 mr-3 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-indigo-900">Enrollment Key</h3>
                    <p className="text-sm text-indigo-700 mt-1">
                      A unique enrollment key (e.g., ABC12345) will be automatically generated when you create the course.
                    </p>
                    <p className="text-sm text-indigo-700 mt-2">
                      Share this key with your students so they can enroll.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
};
