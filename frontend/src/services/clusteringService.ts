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

  // Get current clusters
  async getClusters(sessionId: string): Promise<StudentCluster[]> {
    if (!sessionId) {
      console.warn('No sessionId provided, using default clusters');
      return this.getDefaultClusters();
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
      return data;
    } catch (error) {
      console.error('Error getting clusters:', error);
      console.warn('Using fallback mock data - backend may not be running');
      // Return default clusters on error
      return this.getDefaultClusters();
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
};

