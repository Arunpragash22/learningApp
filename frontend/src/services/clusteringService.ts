// Clustering service for handling clustering-related API calls

export interface StudentCluster {
  id: string;
  name: string;
  description: string;
  studentCount: number;
  engagementLevel: 'high' | 'medium' | 'low';
  color: string;
  prediction: 'stable' | 'improving' | 'declining';
  students: string[]; // Student IDs
  studentNames?: Record<string, string>; // studentId -> "firstName lastName"
}

export interface RealtimeStats {
  totalStudents: number;
  activeStudents: number;
  totalQuestions: number;
  totalAnswers: number;
}

export interface ClusterResponse {
  clusters: StudentCluster[];
  realtimeStats: RealtimeStats;
}

export interface StudentEngagementData {
  engagementScore: number;
  engagementLevel: 'high' | 'medium' | 'low';
  cluster: string;
  questionsAnswered: number;
  correctAnswers: number;
  averageResponseTime: number;
}

export interface ClusterUpdate {
  sessionId: string;
  quizPerformance?: {
    questionId: string;
    correctPercentage: number;
  };
}

// ✔ Correct API root — no slash, no /api suffix
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getAuthToken = (): string => {
  const token = sessionStorage.getItem('access_token') || '';
  return token;
};

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getAuthToken()}`,
});

export const clusteringService = {
  // Get default clusters (shown before any real data exists)
  getDefaultClusters(): StudentCluster[] {
    return [
      {
        id: '1',
        name: 'Active Participants',
        description: 'Highly engaged students',
        studentCount: 0,
        engagementLevel: 'high',
        color: '#22c55e',
        prediction: 'stable',
        students: [],
      },
      {
        id: '2',
        name: 'Moderate Participants',
        description: 'Moderately engaged students',
        studentCount: 0,
        engagementLevel: 'medium',
        color: '#f59e0b',
        prediction: 'improving',
        students: [],
      },
      {
        id: '3',
        name: 'At-Risk Students',
        description: 'Low engagement, need support',
        studentCount: 0,
        engagementLevel: 'low',
        color: '#ef4444',
        prediction: 'declining',
        students: [],
      },
    ];
  },

  // Get current clusters + real-time stats (combined response)
  async getClusters(sessionId: string): Promise<ClusterResponse> {
    const defaultResponse: ClusterResponse = {
      clusters: this.getDefaultClusters(),
      realtimeStats: { totalStudents: 0, activeStudents: 0, totalQuestions: 0, totalAnswers: 0 },
    };

    if (!sessionId) {
      console.warn('No sessionId provided, using default clusters');
      return defaultResponse;
    }

    try {
      const encodedSessionId = encodeURIComponent(sessionId);
      const response = await fetch(`${API_BASE_URL}/api/clustering/session/${encodedSessionId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`Failed to get clusters: ${response.status}`);
      }

      const data = await response.json();

      // Handle both old format (array) and new format ({ clusters, realtimeStats })
      if (Array.isArray(data)) {
        return { clusters: data, realtimeStats: defaultResponse.realtimeStats };
      }
      return {
        clusters: data.clusters || [],
        realtimeStats: data.realtimeStats || defaultResponse.realtimeStats,
      };
    } catch (error) {
      console.error('Error getting clusters:', error);
      console.warn('Using fallback mock data - backend may not be running');
      return defaultResponse;
    }
  },

  // Update clusters based on quiz performance
  async updateClusters(update: ClusterUpdate): Promise<StudentCluster[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/clustering/update`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(update),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`Failed to update clusters: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error updating clusters:', error);
      console.warn('Using fallback - backend may not be running');
      // Return current clusters if update fails
      if (update.sessionId) {
        return this.getClusters(update.sessionId);
      }
      return this.getDefaultClusters();
    }
  },

  // Get real-time session stats (participant count + question count)
  async getRealtimeStats(sessionId: string): Promise<{
    totalStudents: number;
    activeStudents: number;
    totalQuestions: number;
    totalAnswers: number;
  } | null> {
    if (!sessionId) return null;
    try {
      const encodedSessionId = encodeURIComponent(sessionId);
      const response = await fetch(`${API_BASE_URL}/api/clustering/session/${encodedSessionId}/realtime-stats`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error getting realtime stats:', error);
      return null;
    }
  },

  // Get student cluster assignment
  async getStudentCluster(studentId: string, sessionId: string): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/clustering/student/${studentId}?sessionId=${sessionId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to get student cluster');
      }

      const data = await response.json();
      return data.clusterId;
    } catch (error) {
      console.error('Error getting student cluster:', error);
      return null;
    }
  },

  // Get student engagement data (score, cluster, quiz stats) for the student dashboard
  async getStudentEngagement(studentId: string, sessionId: string): Promise<StudentEngagementData | null> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/clustering/student/${studentId}/engagement?sessionId=${sessionId}`,
        { method: 'GET', headers: getAuthHeaders() }
      );
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error getting student engagement:', error);
      return null;
    }
  },
};

