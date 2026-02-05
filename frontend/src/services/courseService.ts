/**
 * Course Service
 * ==============
 * 
 * Handles all course-related API calls including:
 * - Course CRUD operations
 * - Enrollment key management
 * - Student enrollment
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ============================================================
// INTERFACES
// ============================================================

export interface Course {
  id: string;
  title: string;
  description: string;
  instructorId: string;
  instructorName: string;
  instructorEmail: string;
  category?: string;
  duration?: string;
  courseCode?: string;
  thumbnail?: string;
  syllabus?: Array<{ title: string; description?: string; url?: string }>;
  enrolledStudents?: string[];
  enrolledStudentDetails?: EnrolledStudent[];
  enrollmentKey?: string;
  enrollmentKeyActive?: boolean;
  maxStudents?: number;
  status: 'draft' | 'published' | 'archived';
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EnrolledStudent {
  id: string;
  name: string;
  email: string;
  enrolledAt: string;
}

export interface CreateCourseData {
  title: string;
  description: string;
  category?: string;
  duration?: string;
  courseCode?: string;
  thumbnail?: string;
  syllabus?: Array<{ title: string; description?: string; url?: string }>;
  maxStudents?: number;
  status?: 'draft' | 'published' | 'archived';
  startDate?: string;
  endDate?: string;
}

export interface UpdateCourseData extends Partial<CreateCourseData> {}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const getAuthHeaders = (): HeadersInit => {
  const token = sessionStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// ============================================================
// COURSE CRUD OPERATIONS
// ============================================================

export const courseService = {
  /**
   * Create a new course (instructor only)
   */
  async createCourse(data: CreateCourseData): Promise<{ success: boolean; course: Course }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  /**
   * Get all published courses (public)
   */
  async getAllPublishedCourses(): Promise<{ success: boolean; courses: Course[] }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  /**
   * Get instructor's own courses
   */
  async getMyCourses(): Promise<{ success: boolean; courses: Course[] }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/my-courses`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  /**
   * Get a specific course by ID
   */
  async getCourseById(courseId: string): Promise<{ success: boolean; course: Course }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  /**
   * Upload a PDF material for a course (instructor only). Returns URL to store in syllabus.
   */
  async uploadCourseMaterial(
    courseId: string,
    file: File,
    title: string,
    description?: string,
  ): Promise<{ success: boolean; url: string; filename: string; title: string; description: string }> {
    const token = sessionStorage.getItem('access_token');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    if (description) formData.append('description', description);
    const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/materials/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    return handleResponse(response);
  },

  /**
   * Update a course (instructor only)
   */
  async updateCourse(courseId: string, data: UpdateCourseData): Promise<{ success: boolean; course: Course }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  /**
   * Delete a course (instructor only)
   */
  async deleteCourse(courseId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================================
  // ENROLLMENT KEY OPERATIONS
  // ============================================================

  /**
   * Enroll in a course using enrollment key (students only)
   */
  async enrollWithKey(enrollmentKey: string): Promise<{ success: boolean; message: string; course: Course }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/enroll-with-key`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enrollment_key: enrollmentKey }),
    });
    return handleResponse(response);
  },

  /**
   * Get courses student is enrolled in
   */
  async getMyEnrolledCourses(): Promise<{ success: boolean; courses: Course[] }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/my-enrolled-courses`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  /**
   * Regenerate enrollment key for a course (instructor only)
   */
  async regenerateEnrollmentKey(courseId: string): Promise<{ success: boolean; enrollmentKey: string }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/regenerate-key`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  /**
   * Enable or disable enrollment for a course (instructor only)
   */
  async toggleEnrollment(courseId: string, active: boolean): Promise<{ success: boolean; enrollmentKeyActive: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/toggle-enrollment?active=${active}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================================
  // STUDENT MANAGEMENT
  // ============================================================

  /**
   * Get all students enrolled in a course (instructor only)
   */
  async getCourseStudents(courseId: string): Promise<{
    success: boolean;
    courseId: string;
    courseTitle: string;
    enrollmentKey: string;
    enrollmentKeyActive: boolean;
    totalStudents: number;
    students: EnrolledStudent[];
  }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/students`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  /**
   * Remove a student from a course (instructor only)
   */
  async removeStudentFromCourse(courseId: string, studentId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/students/${studentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  /**
   * Unenroll self from a course (students)
   */
  async unenrollFromCourse(courseId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}/unenroll`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },
};

export default courseService;

