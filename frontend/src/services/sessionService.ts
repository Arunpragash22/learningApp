// Session service communicating with BACKEND API
export interface Session {
  id: string;
  title: string;
  course: string;
  courseCode: string;
  instructor: string;
  date: string;
  time: string;
  duration: string;
  status: 'live' | 'upcoming' | 'completed';
  participants?: number;
  expectedParticipants?: number;
  engagement?: number;
  zoomMeetingId?: string;
  join_url?: string;
  start_url?: string;
  recordingAvailable?: boolean;
  isStandalone?: boolean;        // True for standalone sessions, false for course-based
  enrollmentKey?: string;        // Enrollment key for standalone sessions
  courseId?: string;             // Link to course for course-based sessions
}

const API_BASE_URL = import.meta.env.VITE_API_URL;

export const sessionService = {
  async getAllSessions(): Promise<Session[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch sessions:", await res.text());
        return [];
      }

      return await res.json();
    } catch (err) {
      console.error("Session fetch error:", err);
      return [];
    }
  },

  async getSession(id: string): Promise<Session | null> {
    const res = await fetch(`${API_BASE_URL}/api/sessions/${id}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
      },
    });

    if (!res.ok) return null;

    return await res.json();
  },

  async createSession(payload: {
    title: string;
    course: string;
    courseCode: string;
    date: string;          // yyyy-mm-dd
    time: string;          // HH:MM (24hr)
    durationMinutes: number;
    timezone?: string;
  }): Promise<Session> {
    const res = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Failed to create session: ${txt}`);
    }

    return await res.json();
  },

  // Session Report APIs
  async getSessionReport(sessionId: string): Promise<SessionReport | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/report`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch report:", await res.text());
        return null;
      }

      return await res.json();
    } catch (err) {
      console.error("Report fetch error:", err);
      return null;
    }
  },

  async downloadReport(sessionId: string): Promise<Blob | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/report/download`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        console.error("Failed to download report:", await res.text());
        return null;
      }

      return await res.blob();
    } catch (err) {
      console.error("Report download error:", err);
      return null;
    }
  },

  async sendReportEmails(sessionId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/report/send-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        return { success: false, message: "Failed to send report emails" };
      }

      return await res.json();
    } catch (err) {
      console.error("Send report email error:", err);
      return { success: false, message: "Failed to send report emails" };
    }
  },

  // Get all stored reports from MongoDB
  async getAllReports(): Promise<{ reports: SessionReport[]; total: number }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch reports:", await res.text());
        return { reports: [], total: 0 };
      }

      return await res.json();
    } catch (err) {
      console.error("Reports fetch error:", err);
      return { reports: [], total: 0 };
    }
  },

  // Get a specific stored report by ID
  async getReportById(reportId: string): Promise<SessionReport | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports/${reportId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        console.error("Failed to fetch report:", await res.text());
        return null;
      }

      return await res.json();
    } catch (err) {
      console.error("Report fetch error:", err);
      return null;
    }
  },

  // Get stored report for a session from MongoDB
  async getStoredReportForSession(sessionId: string): Promise<StoredReportResponse | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports/session/${sessionId}/stored`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        // 404 means no stored report yet - not an error
        if (res.status === 404) {
          return null;
        }
        console.error("Failed to fetch stored report:", await res.text());
        return null;
      }

      return await res.json();
    } catch (err) {
      console.error("Stored report fetch error:", err);
      return null;
    }
  },

  // End a session (instructor only) - automatically generates report
  async endSession(sessionId: string): Promise<EndSessionResponse> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/end`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { 
          success: false, 
          message: errorText || "Failed to end session",
          sessionId,
          status: "error",
          participantCount: 0,
          reportGenerated: false,
          emailsSent: 0
        };
      }

      return await res.json();
    } catch (err) {
      console.error("End session error:", err);
      return { 
        success: false, 
        message: "Failed to end session",
        sessionId,
        status: "error",
        participantCount: 0,
        reportGenerated: false,
        emailsSent: 0
      };
    }
  },

  // Start a session (instructor only)
  async startSession(sessionId: string): Promise<{ success: boolean; message: string; status?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        return { success: false, message: "Failed to start session" };
      }

      return await res.json();
    } catch (err) {
      console.error("Start session error:", err);
      return { success: false, message: "Failed to start session" };
    }
  },
};

// Types for end session response
export interface EndSessionResponse {
  success: boolean;
  message: string;
  sessionId: string;
  status: string;
  participantCount: number;
  reportGenerated: boolean;
  reportId?: string;
  emailsSent: number;
}

// Types for session reports
export interface StudentReportData {
  studentId: string;
  studentName: string;
  studentEmail?: string;
  joinedAt?: string;
  leftAt?: string;
  attendanceDuration?: number;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  averageResponseTime?: number;
  quizScore?: number;
  quizDetails: QuizSummary[];
  averageConnectionQuality?: string;
  connectionIssuesDetected: boolean;
  latencyMetrics?: {
    avgLatency?: number;
    minLatency?: number;
    maxLatency?: number;
    packetLoss?: number;
  };
}

export interface QuizSummary {
  questionId: string;
  question: string;
  options?: string[];
  correctAnswer: number;
  studentAnswer?: number;
  isCorrect?: boolean;
  timeTaken?: number;
  answeredAt?: string;
}

export interface SessionReport {
  id?: string;
  sessionId: string;
  sessionTitle: string;
  courseName: string;
  courseCode: string;
  instructorName: string;
  instructorId: string;
  sessionDate: string;
  sessionTime: string;
  sessionDuration: string;
  actualStartTime?: string;
  actualEndTime?: string;
  sessionStatus?: string;
  totalParticipants: number;
  totalQuestionsAsked: number;
  averageQuizScore?: number;
  averageAttendance?: number;
  engagementSummary: Record<string, number>;
  connectionQualitySummary: Record<string, number>;
  students: StudentReportData[];
  generatedAt: string;
  savedAt?: string;
  updatedAt?: string;
  reportType: string;
  message?: string; // For preview reports
  // Raw data (instructor only)
  allQuestions?: Question[];
  rawAssignments?: QuizAssignment[];
  rawQuizAnswers?: QuizAnswer[];
}

// Stored report response from MongoDB
export interface StoredReportResponse {
  stored: boolean;
  storedAt: string;
  report: SessionReport;
}

// Additional types for raw data
export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
}

export interface QuizAssignment {
  id: string;
  sessionId: string;
  questionId: string;
  studentId: string;
  answerIndex?: number;
  isCorrect?: boolean;
  timeTaken?: number;
  answeredAt?: string;
}

export interface QuizAnswer {
  id: string;
  sessionId: string;
  studentId: string;
  questionId: string;
  answerIndex: number;
  timeTaken?: number;
}
