const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getAuthToken = (): string =>
  sessionStorage.getItem('access_token') || '';

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getAuthToken()}`,
});

export interface StudentFeedback {
  type: 'achievement' | 'encouragement' | 'improvement' | 'warning';
  message: string;
  clusterContext: string;
  suggestions: string[];
  cluster_label: string;
  studentId?: string;
  studentName?: string;
  accuracy?: number | null;
  totalAttempts?: number;
  correctAnswers?: number;
  medianResponseTime?: number | null;
}

export const feedbackService = {
  async getStudentFeedback(
    studentId: string,
    sessionId: string,
  ): Promise<StudentFeedback | null> {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/feedback/student/${studentId}?sessionId=${encodeURIComponent(sessionId)}`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.feedback ?? null;
    } catch (e) {
      console.error('Error fetching student feedback:', e);
      return null;
    }
  },

  async getSessionFeedback(sessionId: string): Promise<StudentFeedback[]> {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/feedback/session/${encodeURIComponent(sessionId)}`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.feedback ?? [];
    } catch (e) {
      console.error('Error fetching session feedback:', e);
      return [];
    }
  },

  async downloadFeedbackCsv(sessionId: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/feedback/session/${encodeURIComponent(sessionId)}/download`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) return false;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students_with_feedback_${sessionId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      console.error('Error downloading feedback CSV:', e);
      return false;
    }
  },
};
