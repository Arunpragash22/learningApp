import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from 'sonner';
import {
  BookOpenIcon,
  ArrowLeftIcon,
  SaveIcon,
  TagIcon,
  CalendarIcon,
  UsersIcon,
  HashIcon,
} from 'lucide-react';

export const CourseEdit = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { courseId } = useParams();
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    duration: '',
    courseCode: '',
    maxStudents: 50,
    status: 'draft' as 'draft' | 'published',
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // VITE_API_URL already includes /api, so we check for that
  const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  const API_BASE = API_URL?.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  // Load existing course data
  useEffect(() => {
    const loadCourse = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/courses/${courseId}`, {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('access_token')}`,
          },
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          toast.error('Failed to load course');
          navigate('/dashboard/courses');
          return;
        }

        const course = data.course;
        setFormData({
          title: course.title || '',
          description: course.description || '',
          category: course.category || '',
          duration: course.duration || '',
          courseCode: course.courseCode || '',
          maxStudents: course.maxStudents || 50,
          status: course.status || 'draft',
        });
      } catch (err) {
        console.error(err);
        toast.error('Error fetching course');
        navigate('/dashboard/courses');
      } finally {
        setLoading(false);
      }
    };

    loadCourse();
  }, [courseId, API_BASE, navigate]);

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

    setSaving(true);
    
    try {
      const res = await fetch(`${API_BASE}/api/courses/${courseId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          category: formData.category || undefined,
          duration: formData.duration || undefined,
          courseCode: formData.courseCode || undefined,
          maxStudents: formData.maxStudents || undefined,
          status: formData.status,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        toast.error(result.detail || result.message || 'Update failed');
        return;
      }

      toast.success('Course updated successfully!');
      navigate('/dashboard/courses');
    } catch (err) {
      console.error(err);
      toast.error('Error updating course');
    } finally {
      setSaving(false);
    }
  };

  if (!isInstructor) {
    return (
      <div className="py-6">
        <Card className="p-6 text-center">
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p>Only instructors can edit courses.</p>
          <Button onClick={() => navigate('/dashboard/courses')}>
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-6">
        <Card className="p-6 text-center">
          <div className="animate-spin h-12 w-12 rounded-full border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading course...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="py-6 max-w-4xl mx-auto">
      <Button
        variant="outline"
        leftIcon={<ArrowLeftIcon className="h-4 w-4" />}
        onClick={() => navigate('/dashboard/courses')}
        className="mb-4"
      >
        Back to Courses
      </Button>

      <h1 className="text-2xl font-bold mb-6">Edit Course</h1>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <BookOpenIcon className="h-5 w-5" />
              Course Information
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title */}
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

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe what students will learn in this course..."
                rows={4}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <TagIcon className="h-4 w-4" />
                  Category
                </label>
                <Input
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="e.g., Computer Science"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Duration
                </label>
                <Input
                  name="duration"
                  value={formData.duration}
                  onChange={handleChange}
                  placeholder="e.g., 8 weeks"
                />
              </div>

              {/* Course Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <HashIcon className="h-4 w-4" />
                  Course Code
                </label>
                <Input
                  name="courseCode"
                  value={formData.courseCode}
                  onChange={handleChange}
                  placeholder="e.g., CS101, WEB201"
                />
              </div>

              {/* Max Students */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <UsersIcon className="h-4 w-4" />
                  Max Students
                </label>
                <Input
                  type="number"
                  name="maxStudents"
                  value={formData.maxStudents}
                  onChange={handleChange}
                  min="1"
                  placeholder="50"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.status === 'draft' 
                    ? 'Draft courses are not visible to students'
                    : 'Published courses are visible to all students'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/dashboard/courses')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            leftIcon={<SaveIcon className="h-4 w-4" />}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};
