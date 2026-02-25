import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CalendarIcon, ClockIcon, FileTextIcon, PlusIcon, XIcon, UploadIcon, BookOpenIcon, HelpCircleIcon } from 'lucide-react';

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
  clusterQuestionSource?: string | null;  // null/none = only current session questions, or a previous session ID
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
    isStandalone: mode === 'standalone',
    clusterQuestionSource: initialData?.clusterQuestionSource || null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Cluster question source: previous sessions
  const [previousSessions, setPreviousSessions] = useState<{sessionId: string; title: string; date: string; course: string; clusterQuestionCount: number}[]>([]);
  const [loadingPrevSessions, setLoadingPrevSessions] = useState(false);
  const [useClusterFromPrevious, setUseClusterFromPrevious] = useState(!!initialData?.clusterQuestionSource);

  const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  const API_BASE = API_URL?.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;

  useEffect(() => {
    const fetchPreviousSessions = async () => {
      setLoadingPrevSessions(true);
      try {
        const res = await fetch(`${API_BASE}/api/sessions/previous-with-cluster-questions`, {
          headers: { Authorization: `Bearer ${sessionStorage.getItem('access_token') || ''}` }
        });
        if (res.ok) {
          const data = await res.json();
          setPreviousSessions(data.sessions || []);
        }
      } catch (err) {
        console.error('Failed to fetch previous sessions:', err);
      } finally {
        setLoadingPrevSessions(false);
      }
    };
    fetchPreviousSessions();
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
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
        isStandalone: mode === 'standalone',
        clusterQuestionSource: useClusterFromPrevious ? (formData.clusterQuestionSource || null) : null,
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'course' ? 'Add Lesson to Course' : 'Meeting Information'}
          </h2>
          {mode === 'course' && courseData && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Creating lesson for: <span className="font-medium text-indigo-600 dark:text-indigo-400">{courseData.title}</span>
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Course Info Display - For Course Mode */}
          {mode === 'course' && courseData && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center">
                <BookOpenIcon className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
                <div>
                  <p className="text-sm font-medium text-green-900 dark:text-green-100">{courseData.title}</p>
                  <p className="text-xs text-green-700 dark:text-green-300">Course Code: {courseData.code}</p>
                </div>
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                ✓ Students enrolled in this course can access this lesson without a separate enrollment key.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Meeting Title *
            </label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Machine Learning: Neural Networks"
              error={errors.title}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Session description and objectives..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date *
              </label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Time *
              </label>
              <div className="relative">
                <ClockIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                End Time *
              </label>
              <div className="relative">
                <ClockIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
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

        </CardContent>
      </Card>

      {/* Question Handling Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Question Handling</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Generic questions are always sent first. Configure how cluster-wise questions should be handled.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Default behaviour info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Default:</strong> Generic questions are sent to all students first (no previous session needed).
              After clustering runs, cluster-wise questions target students by their engagement level.
            </p>
          </div>

          {/* Cluster question source toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Where should cluster-wise questions come from?
            </label>
            <div className="space-y-3">
              <label
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                  !useClusterFromPrevious
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500'
                    : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <input
                  type="radio"
                  name="clusterSource"
                  checked={!useClusterFromPrevious}
                  onChange={() => {
                    setUseClusterFromPrevious(false);
                    setFormData({ ...formData, clusterQuestionSource: null });
                  }}
                  className="mt-1 h-4 w-4 text-blue-600"
                />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white text-sm">Current session only</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Only questions created for this session will be used. Create cluster-wise questions in the Question Bank after creating this session.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                  useClusterFromPrevious
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500'
                    : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <input
                  type="radio"
                  name="clusterSource"
                  checked={useClusterFromPrevious}
                  onChange={() => setUseClusterFromPrevious(true)}
                  className="mt-1 h-4 w-4 text-blue-600"
                />
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">Copy from a previous session</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Cluster-wise questions from a previous session will be automatically copied and used in this session.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Previous session selector */}
          {useClusterFromPrevious && (
            <div className="ml-7">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Select Previous Session
              </label>
              {loadingPrevSessions ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading previous sessions...</p>
              ) : previousSessions.length === 0 ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    No previous sessions with cluster questions found. Create cluster-wise questions in the Question Bank first.
                  </p>
                </div>
              ) : (
                <select
                  value={formData.clusterQuestionSource || ''}
                  onChange={(e) => setFormData({ ...formData, clusterQuestionSource: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="">-- Select a session --</option>
                  {previousSessions.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.title} — {s.date} ({s.clusterQuestionCount} cluster questions)
                    </option>
                  ))}
                </select>
              )}
              {formData.clusterQuestionSource && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  Cluster questions from the selected session will be copied when the quiz is triggered.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Meeting Resources</h2>
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
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <FileTextIcon className="h-12 w-12 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
              <p>No materials added yet</p>
              <p className="text-sm">Click "Add Material" to upload files or add links</p>
            </div>
          ) : (
            <div className="space-y-4">
              {formData.materials.map((material) => (
                <div key={material.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                              className="flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                              <UploadIcon className="h-4 w-4 mr-2" />
                              {material.file ? material.file.name : 'Choose File'}
                            </label>
                          </div>
                        </div>
                      )}

                      {material.type === 'link' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Content
                          </label>
                          <textarea
                            value={material.content || ''}
                            onChange={(e) => handleMaterialChange(material.id, 'content', e.target.value)}
                            placeholder="Enter material content..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveMaterial(material.id)}
                      className="ml-4 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
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
