// Quiz service for handling quiz-related API calls
import type { Question } from '../components/questions/QuestionBank';

export interface QuizAnswer {
  questionId: string;
  answerIndex: number;
  timeTaken: number;
  studentId: string;
  sessionId: string;
}

export interface QuizPerformance {
  totalStudents: number;
  answeredStudents: number;
  correctAnswers: number;
  averageTime: number;
  correctPercentage: number;
  performanceByCluster: {
    clusterName: string;
    answered: number;
    correct: number;
    percentage: number;
  }[];
  topPerformers: {
    studentName: string;
    isCorrect: boolean;
    timeTaken: number;
  }[];
}

export interface AssignedQuestionResponse {
  active: boolean;
  assignmentId?: string;
  question?: Question;
  completed?: boolean;
  notParticipant?: boolean;  // True if student hasn't joined session before trigger
  message?: string;
}

export interface JoinSessionResponse {
  success: boolean;
  message: string;
  participant?: {
    id: string;
    sessionId: string;
    studentId: string;
    studentName: string;
    joinedAt: string;
    status: string;
  };
}

export interface ParticipantStatusResponse {
  isParticipant: boolean;
  sessionId: string;
  studentId: string;
}

export interface SessionStatsResponse {
  questionsAnswered: number;
  correctAnswers: number;
  questionsReceived: number;
  /** Question IDs this student has already answered in this session (for idempotent delivery). */
  answeredQuestionIds?: string[];
}

// ✔ Correct API root — no slash, no /api suffix
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getAuthToken = (): string => {
  try {
    // Token is stored separately in localStorage as 'access_token'
    const token = sessionStorage.getItem('access_token');
    if (!token) {
      console.error('❌ No authentication token found in localStorage');
      throw new Error('Not authenticated. Please log in again.');
    }
    return token;
  } catch (error) {
    console.error('Error getting auth token:', error);
    throw error;
  }
};

const getUserRole = (): string => {
  try {
    const user = sessionStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      return userData.role || 'student';
    }
  } catch (error) {
    console.error('Error getting user role:', error);
  }
  return 'student';
};

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getAuthToken()}`,
  'x-user-role': getUserRole(),
});

export const quizService = {
  // Submit quiz answer
  async submitAnswer(answer: QuizAnswer): Promise<{ success: boolean; isCorrect: boolean }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/quiz/submit`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(answer),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to submit answer: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error submitting answer:', error);
      // Fallback for development if backend is not running
      console.warn('Using fallback mock data - backend may not be running');
      return {
        success: true,
        isCorrect: Math.random() > 0.3, // Mock: 70% correct
      };
    }
  },

  // Get default performance data
  getDefaultPerformance(): QuizPerformance {
    return {
      totalStudents: 32,
      answeredStudents: 28,
      correctAnswers: 20,
      averageTime: 12.5,
      correctPercentage: 71.4,
      performanceByCluster: [
        {
          clusterName: 'Active Participants',
          answered: 18,
          correct: 15,
          percentage: 83.3,
        },
        {
          clusterName: 'Moderate Participants',
          answered: 8,
          correct: 5,
          percentage: 62.5,
        },
        {
          clusterName: 'At-Risk Students',
          answered: 2,
          correct: 0,
          percentage: 0,
        },
      ],
      topPerformers: [
        { studentName: 'Alice Johnson', isCorrect: true, timeTaken: 8.2 },
        { studentName: 'Bob Williams', isCorrect: true, timeTaken: 9.5 },
        { studentName: 'Charlie Brown', isCorrect: false, timeTaken: 15.3 },
      ],
    };
  },

  // Get quiz performance
  async getQuizPerformance(questionId: string, sessionId: string): Promise<QuizPerformance> {
    if (!questionId || !sessionId) {
      console.warn('Missing questionId or sessionId for performance query');
      return this.getDefaultPerformance();
    }

    try {
      const encodedQuestionId = encodeURIComponent(questionId);
      const encodedSessionId = encodeURIComponent(sessionId);
      const response = await fetch(`${API_BASE_URL}/api/quiz/performance/${encodedQuestionId}?sessionId=${encodedSessionId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`Failed to get quiz performance: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting quiz performance:', error);
      console.warn('Using fallback mock data - backend may not be running');
      // Return default performance data
      return this.getDefaultPerformance();
    }
  },

  // Trigger question (instructor only)
  // This triggers via HTTP API - the backend will then broadcast via WebSocket to session room
  async triggerQuestion(questionId: string, sessionId: string): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/quiz/trigger`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ questionId, sessionId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to trigger question: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error triggering question:', error);
      console.warn('Using fallback - backend may not be running');
      return { success: true };
    }
  },

  /** Trigger one random question to all joined students (Instructor Dashboard one-click). */
  async triggerSameQuestionToSession(meetingId: string): Promise<{ success: boolean; sentTo?: number; message?: string }> {
    try {
      const encoded = encodeURIComponent(meetingId);
      const response = await fetch(`${API_BASE_URL}/api/live/trigger-same/${encoded}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { success: false, sentTo: 0, message: data.message || `Failed: ${response.status}` };
      }
      return { success: true, sentTo: data.sentTo ?? 0, message: data.message };
    } catch (error) {
      console.error('Error trigger-same:', error);
      return { success: false, sentTo: 0, message: 'Network error' };
    }
  },

  // 🎯 Trigger question to session room via WebSocket endpoint
  // Only students who joined the session will receive this
  async triggerQuestionToSession(sessionId: string, question: any): Promise<{ success: boolean; sentTo?: number }> {
    try {
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/ws/trigger-session/${sessionId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to trigger question to session: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error triggering question to session:', error);
      return { success: false };
    }
  },

  // Trigger personalized questions (unique per student)
  async triggerIndividualQuestions(sessionId: string): Promise<{ success: boolean; mode?: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/quiz/trigger/individual`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to trigger personalized questions: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error triggering personalized questions:', error);
      throw error;
    }
  },

  // Get personalized assignment for a student
  async getAssignedQuestion(sessionId: string, studentId: string): Promise<AssignedQuestionResponse> {
    if (!sessionId || !studentId) {
      return { active: false };
    }

    try {
      const encodedSessionId = encodeURIComponent(sessionId);
      const encodedStudentId = encodeURIComponent(studentId);
      const response = await fetch(`${API_BASE_URL}/api/quiz/assignment?sessionId=${encodedSessionId}&studentId=${encodedStudentId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { active: false };
        }
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to get assignment: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting personalized assignment:', error);
      return { active: false };
    }
  },

  // ============ Session Participant Methods ============

  // Join a session - must be called before quiz is triggered to receive questions
  async joinSession(sessionId: string, studentName?: string, studentEmail?: string): Promise<JoinSessionResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/quiz/session/join`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sessionId, studentName, studentEmail }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to join session: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error joining session:', error);
      return { success: false, message: 'Failed to join session' };
    }
  },

  // Leave a session
  async leaveSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/quiz/session/leave`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to leave session: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error leaving session:', error);
      return { success: false, message: 'Failed to leave session' };
    }
  },

  // Check if current user is a participant in the session
  async checkParticipantStatus(sessionId: string): Promise<ParticipantStatusResponse> {
    try {
      const encodedSessionId = encodeURIComponent(sessionId);
      const response = await fetch(`${API_BASE_URL}/api/quiz/session/participant-status?sessionId=${encodedSessionId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to check participant status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking participant status:', error);
      return { isParticipant: false, sessionId, studentId: '' };
    }
  },

  // Get all participants in a session (instructor only)
  async getSessionParticipants(sessionId: string): Promise<{ success: boolean; count: number; participants: any[] }> {
    try {
      const encodedSessionId = encodeURIComponent(sessionId);
      const response = await fetch(`${API_BASE_URL}/api/quiz/session/participants?sessionId=${encodedSessionId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to get participants: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting participants:', error);
      return { success: false, count: 0, participants: [] };
    }
  },

  /** Get cumulative session stats for current student (dashboard rehydration after refresh) */
  async getSessionStats(sessionId: string): Promise<SessionStatsResponse> {
    try {
      const encoded = encodeURIComponent(sessionId);
      const response = await fetch(`${API_BASE_URL}/api/quiz/session-stats?sessionId=${encoded}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      if (!response.ok) return { questionsAnswered: 0, correctAnswers: 0, questionsReceived: 0 };
      return await response.json();
    } catch (error) {
      console.error('Error fetching session stats:', error);
      return { questionsAnswered: 0, correctAnswers: 0, questionsReceived: 0 };
    }
  },
};

