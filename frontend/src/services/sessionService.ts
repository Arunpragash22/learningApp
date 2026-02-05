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
  enrolledStudents?: string[];   // Array of enrolled student IDs
  courseId?: string;             // Link to course for course-based sessions
}

const API_BASE_URL = import.meta.env.VITE_API_URL;

export const sessionService = {
  async getAllSessions(): Promise<Session[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions`, {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
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
        Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
      },
    });

    if (!res.ok) return null;

    return await res.json();
  },

  async getSessionsByCourse(courseId: string): Promise<Session[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/course/${courseId}`, {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
        },
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error("Sessions by course fetch error:", err);
      return [];
    }
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
        Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
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
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
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

  async downloadReport(sessionId: string, filename?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/report/download`, {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to download report:", errorText);
        // Try to parse error message from JSON response
        try {
          const errorJson = JSON.parse(errorText);
          return { success: false, error: errorJson.detail || 'Failed to download report' };
        } catch {
          return { success: false, error: errorText || 'Failed to download report' };
        }
      }

      const htmlContent = await res.text();
      const pdfFilename = filename || `session_report_${sessionId}.pdf`;
      
      try {
        // Create an iframe to render and print the HTML
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
        
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
          throw new Error('Could not access iframe document');
        }
        
        // Write the HTML content to the iframe
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();
        
        // Wait for content to fully render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Trigger print dialog (user can save as PDF)
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        
        // Clean up after a delay
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
        
        return { success: true, error: 'Use "Save as PDF" in the print dialog' };
      } catch (pdfError) {
        console.error("PDF generation error:", pdfError);
        // Fallback to HTML download if print fails
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pdfFilename.replace('.pdf', '.html');
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return { success: true, error: 'Downloaded as HTML' };
      }
    } catch (err) {
      console.error("Report download error:", err);
      return { success: false, error: 'Failed to download report' };
    }
  },

  async sendReportEmails(sessionId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/report/send-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
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

  // Get live session stats (participant count) for real-time analytics
  async getLiveSessionStats(sessionId: string): Promise<{ participantCount: number } | null> {
    try {
      const base = (import.meta.env.VITE_API_URL || "").replace(/\/api\/?$/, "");
      const res = await fetch(`${base}/api/live/stats/${sessionId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.stats ? { participantCount: data.stats.participantCount ?? 0 } : null;
    } catch {
      return null;
    }
  },

  // Get all stored reports from MongoDB
  async getAllReports(): Promise<{ reports: SessionReport[]; total: number }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/reports`, {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
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
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
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
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
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
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
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
  // Supports optional quiz automation configuration
  async startSession(
    sessionId: string, 
    automationConfig?: {
      enableRealTimeAnalytics?: boolean; // Default: false - enable real-time analytics
      enableAutomation?: boolean;        // Default: true - auto-trigger questions (only if analytics enabled)
      firstDelaySeconds?: number;        // Default: 120 (2 minutes) - delay before first question
      intervalSeconds?: number;          // Default: 600 (10 minutes) - interval between questions
      maxQuestions?: number;             // Default: null (unlimited)
    }
  ): Promise<StartSessionResponse> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
        },
        body: automationConfig ? JSON.stringify(automationConfig) : undefined,
      });

      if (!res.ok) {
        return { success: false, message: "Failed to start session" };
      }

      return await res.json();
    } catch (error) {
      console.error('Error starting session:', error);
      return { success: false, message: "Failed to start session" };
    }
  },

  // Get automation status for a session
  async getAutomationStatus(sessionId: string): Promise<AutomationStatus | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/live/automation/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.automation;
    } catch (error) {
      console.error('Error fetching automation status:', error);
      return null;
    }
  },

  // Start automation for a session
  async startAutomation(
    sessionId: string,
    config?: {
      first_delay_seconds?: number;
      interval_seconds?: number;
      max_questions?: number;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const params = new URLSearchParams();
      if (config?.first_delay_seconds) params.set('first_delay_seconds', config.first_delay_seconds.toString());
      if (config?.interval_seconds) params.set('interval_seconds', config.interval_seconds.toString());
      if (config?.max_questions) params.set('max_questions', config.max_questions.toString());

      const res = await fetch(`${API_BASE_URL}/api/live/automation/${sessionId}/start?${params}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        return { success: false, message: "Failed to start automation" };
      }

      return await res.json();
    } catch (error) {
      console.error('Error starting automation:', error);
      return { success: false, message: "Failed to start automation" };
    }
  },

  // Stop automation for a session
  async stopAutomation(sessionId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/live/automation/${sessionId}/stop`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        return { success: false, message: "Failed to stop automation" };
      }

      return await res.json();
    } catch (error) {
      console.error('Error stopping automation:', error);
      return { success: false, message: "Failed to stop automation" };
    }
  },

  // Join a session (student) - tracks participation
  async joinSession(sessionId: string): Promise<{ 
    success: boolean; 
    message: string; 
    sessionId?: string;
    sessionKey?: string;
    sessionTitle?: string;
    status?: string;
    join_url?: string;
  }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { success: false, message: errorText || "Failed to join session" };
      }

      return await res.json();
    } catch (err) {
      console.error("Join session error:", err);
      return { success: false, message: "Failed to join session" };
    }
  },

  // Leave a session (student) - updates participation status
  async leaveSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/leave`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
        },
      });

      if (!res.ok) {
        return { success: false, message: "Failed to leave session" };
      }

      return await res.json();
    } catch (err) {
      console.error("Leave session error:", err);
      return { success: false, message: "Failed to leave session" };
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

// Types for session start with automation
export interface StartSessionResponse {
  success: boolean;
  message: string;
  status?: string;
  automationEnabled?: boolean;
  automation?: {
    success: boolean;
    message: string;
    session_id: string;
    first_trigger_in_seconds?: number;
    interval_seconds?: number;
  };
}

// Types for automation status
export interface AutomationStatus {
  active: boolean;
  session_id: string;
  started_at?: string;
  questions_sent?: number;
  first_delay_seconds?: number;
  interval_seconds?: number;
  max_questions?: number;
  sent_question_ids?: string[];
}
