import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CalendarIcon, ClockIcon, FileTextIcon, PlusIcon, XIcon, UploadIcon, BookOpenIcon, AlertCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { courseService, Course } from '../../services/courseService';

export interface SessionMaterial {
  id: string;
  name: string;
  type: 'file' | 'link' | 'text';
  url?: string;
  content?: string;
  file?: File;
}

export interface SessionFormData {
  title: string;
  course: string;
  courseCode: string;
  courseId?: string;  // Link to Course document for access control
  date: string;
  startTime: string;
  endTime: string;
  duration: string;
  description: string;
  materials: SessionMaterial[];
  isStandalone?: boolean;  // True for standalone sessions, false for course sessions
}

interface SessionFormProps {
  initialData?: Partial<SessionFormData>;
  onSubmit: (data: SessionFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  mode?: 'standalone' | 'course';  // Mode determines if enrollment key is needed
  courseData?: {
    id: string;
    title: string;
    code: string;
  };
}

export const SessionForm: React.FC<SessionFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  mode = 'standalone',
  courseData
}) => {
  const [formData, setFormData] = useState<SessionFormData>({
    title: initialData?.title || '',
    course: initialData?.course || courseData?.title || '',
    courseCode: initialData?.courseCode || courseData?.code || '',
    courseId: initialData?.courseId || courseData?.id || '',
    date: initialData?.date || '',
    startTime: initialData?.startTime || '',
    endTime: initialData?.endTime || '',
    duration: initialData?.duration || '90 min',
    description: initialData?.description || '',
    materials: initialData?.materials || [],
    isStandalone: mode === 'standalone'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(mode === 'standalone');

  // Fetch instructor's courses (only for standalone mode)
  useEffect(() => {
    if (mode === 'course') {
      setLoadingCourses(false);
      return;
    }

    const fetchCourses = async () => {
      try {
        setLoadingCourses(true);
        const response = await courseService.getMyCourses();
        // Only show published courses
        const publishedCourses = (response.courses || []).filter(c => c.status === 'published');
        setCourses(publishedCourses);
      } catch (error) {
        console.error('Failed to fetch courses:', error);
      } finally {
        setLoadingCourses(false);
      }
    };
    fetchCourses();
  }, [mode]);

  // Handle course selection (standalone mode only)
  const handleCourseSelect = (courseId: string) => {
    const selectedCourse = courses.find(c => c.id === courseId);
    if (selectedCourse) {
      setFormData({
        ...formData,
        courseId: selectedCourse.id,
        course: selectedCourse.title,
        courseCode: selectedCourse.category || selectedCourse.title.substring(0, 6).toUpperCase()
      });
    } else {
      setFormData({
        ...formData,
        courseId: '',
        course: '',
        courseCode: ''
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }
    if (mode === 'standalone' && !formData.course.trim()) {
      newErrors.course = 'Course is required';
    }
    if (mode === 'standalone' && !formData.courseCode.trim()) {
      newErrors.courseCode = 'Course code is required';
    }
    if (!formData.date) {
      newErrors.date = 'Date is required';
    }
    if (!formData.startTime) {
      newErrors.startTime = 'Start time is required';
    }
    if (!formData.endTime) {
      newErrors.endTime = 'End time is required';
    }
    if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
      newErrors.endTime = 'End time must be after start time';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit({
        ...formData,
        isStandalone: mode === 'standalone'
      });
    }
  };

  const handleAddMaterial = () => {
    const newMaterial: SessionMaterial = {
      id: Date.now().toString(),
      name: '',
      type: 'file'
    };
    setFormData({
      ...formData,
      materials: [...formData.materials, newMaterial]
    });
  };

  const handleRemoveMaterial = (id: string) => {
    setFormData({
      ...formData,
      materials: formData.materials.filter(m => m.id !== id)
    });
  };

  const handleMaterialChange = (id: string, field: keyof SessionMaterial, value: any) => {
    setFormData({
      ...formData,
      materials: formData.materials.map(m =>
        m.id === id ? { ...m, [field]: value } : m
      )
    });
  };

  const handleFileUpload = (id: string, file: File | null) => {
    if (file) {
      handleMaterialChange(id, 'file', file);
      handleMaterialChange(id, 'name', file.name);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">
            {mode === 'course' ? 'Add Session to Course' : 'Session Information'}
          </h2>
          {mode === 'course' && courseData && (
            <p className="text-sm text-gray-500 mt-1">
              Creating session for: <span className="font-medium text-indigo-600">{courseData.title}</span>
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Course Selection - Only for Standalone Mode */}
          {mode === 'standalone' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-indigo-900 mb-2 flex items-center">
                <BookOpenIcon className="h-4 w-4 mr-2" />
                Select Course *
              </label>
              {loadingCourses ? (
                <p className="text-sm text-indigo-600">Loading your courses...</p>
              ) : courses.length === 0 ? (
                <div className="flex items-start p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <AlertCircleIcon className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">No published courses found</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      You need to create and publish a course first. Only enrolled students will be able to see sessions for that course.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    value={formData.courseId || ''}
                    onChange={(e) => handleCourseSelect(e.target.value)}
                    className="block w-full px-3 py-2 border border-indigo-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  >
                    <option value="">-- Select a course --</option>
                    {courses.map(course => (
                      <option key={course.id} value={course.id}>
                        {course.title} ({course.enrolledStudents?.length || 0} students enrolled)
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-indigo-600 mt-2">
                    ℹ️ Only students enrolled in this course will be able to see and join this session.
                  </p>
                </>
              )}
              {errors.courseId && <p className="text-sm text-red-600 mt-1">{errors.courseId}</p>}
            </div>
          )}

          {/* Course Info Display - For Course Mode */}
          {mode === 'course' && courseData && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <BookOpenIcon className="h-5 w-5 text-green-600 mr-2" />
                <div>
                  <p className="text-sm font-medium text-green-900">{courseData.title}</p>
                  <p className="text-xs text-green-700">Course Code: {courseData.code}</p>
                </div>
              </div>
              <p className="text-xs text-green-600 mt-2">
                ✓ Students enrolled in this course can access this session without a separate enrollment key.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session Title *
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Machine Learning: Neural Networks"
                error={errors.title}
              />
            </div>

            {mode === 'standalone' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Course Code
                </label>
                <Input
                  value={formData.courseCode}
                  onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                  placeholder="Auto-filled from course"
                  disabled={!!formData.courseId}
                />
              </div>
            )}
          </div>

          {mode === 'standalone' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Course Name
              </label>
              <Input
                value={formData.course}
                onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                placeholder="Auto-filled from course"
                disabled={!!formData.courseId}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Session description and objectives..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="pl-10"
                  error={errors.date}
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
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="pl-10"
                  error={errors.startTime}
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
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="pl-10"
                  error={errors.endTime}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duration
            </label>
            <Select
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              options={[
                { value: '30 min', label: '30 minutes' },
                { value: '60 min', label: '1 hour' },
                { value: '90 min', label: '1.5 hours' },
                { value: '120 min', label: '2 hours' },
                { value: '180 min', label: '3 hours' }
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Session Materials</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<PlusIcon className="h-4 w-4" />}
              onClick={handleAddMaterial}
            >
              Add Material
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {formData.materials.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileTextIcon className="h-12 w-12 mx-auto mb-2 text-gray-400" />
              <p>No materials added yet</p>
              <p className="text-sm">Click "Add Material" to upload files or add links</p>
            </div>
          ) : (
            <div className="space-y-4">
              {formData.materials.map((material) => (
                <div key={material.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Material Type
                        </label>
                        <Select
                          value={material.type}
                          onChange={(e) => handleMaterialChange(material.id, 'type', e.target.value)}
                          options={[
                            { value: 'file', label: 'File Upload' },
                            { value: 'link', label: 'External Link' },
                            { value: 'text', label: 'Text Content' }
                          ]}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Name / Title
                        </label>
                        <Input
                          value={material.name}
                          onChange={(e) => handleMaterialChange(material.id, 'name', e.target.value)}
                          placeholder="Material name"
                        />
                      </div>

                      {material.type === 'file' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Upload File
                          </label>
                          <div className="relative">
                            <input
                              type="file"
                              onChange={(e) => handleFileUpload(material.id, e.target.files?.[0] || null)}
                              className="hidden"
                              id={`file-${material.id}`}
                            />
                            <label
                              htmlFor={`file-${material.id}`}
                              className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50"
                            >
                              <UploadIcon className="h-4 w-4 mr-2" />
                              {material.file ? material.file.name : 'Choose File'}
                            </label>
                          </div>
                        </div>
                      )}

                      {material.type === 'link' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            URL
                          </label>
                          <Input
                            type="url"
                            value={material.url || ''}
                            onChange={(e) => handleMaterialChange(material.id, 'url', e.target.value)}
                            placeholder="https://example.com"
                          />
                        </div>
                      )}

                      {material.type === 'text' && (
                        <div className="md:col-span-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Content
                          </label>
                          <textarea
                            value={material.content || ''}
                            onChange={(e) => handleMaterialChange(material.id, 'content', e.target.value)}
                            placeholder="Enter material content..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveMaterial(material.id)}
                      className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      aria-label="Remove material"
                    >
                      <XIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end space-x-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isLoading}>
          {isLoading ? 'Saving...' : initialData ? 'Update Session' : 'Create Session'}
        </Button>
      </div>
    </form>
  );
};
