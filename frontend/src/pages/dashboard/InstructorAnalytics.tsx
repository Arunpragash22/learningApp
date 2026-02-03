import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { ClusterVisualization } from '../../components/clustering/ClusterVisualization';
import { Users, AlertCircle, Target, Radio } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';

interface EngagementData {
  averageEngagement: number;
  totalStudents: number;
  activeNow: number;
  questionsAnswered: number;
  averageResponseTime: number;
}

interface ClusterData {
  id: string;
  name: string;
  description: string;
  studentCount: number;
  engagementLevel: 'high' | 'medium' | 'low';
  color: string;
  prediction: 'stable' | 'improving' | 'declining';
}

interface Session {
  id: string;
  title: string;
  date: string;
  time: string;
  status: 'live' | 'upcoming' | 'completed';
  studentCount: number;
  averageEngagement: number;
}

export const InstructorAnalytics = () => {
  const { user } = useAuth();
  const [selectedTimeRange, setSelectedTimeRange] = useState<'live' | 'session' | 'week'>('live');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Mock sessions data
  const sessions: Session[] = [
    {
      id: '1',
      title: 'Machine Learning: Neural Networks',
      date: '2023-10-15',
      time: '14:00-15:30',
      status: 'live',
      studentCount: 32,
      averageEngagement: 78
    },
    {
      id: '2',
      title: 'Database Design: Normalization',
      date: '2023-10-14',
      time: '10:00-11:30',
      status: 'completed',
      studentCount: 28,
      averageEngagement: 72
    },
    {
      id: '3',
      title: 'Web Development: React Fundamentals',
      date: '2023-10-13',
      time: '14:00-15:30',
      status: 'completed',
      studentCount: 35,
      averageEngagement: 81
    },
    {
      id: '4',
      title: 'Data Structures: Trees and Graphs',
      date: '2023-10-12',
      time: '09:00-10:30',
      status: 'completed',
      studentCount: 30,
      averageEngagement: 69
    }
  ];

  // Live session (if any)
  const liveSession = sessions.find(s => s.status === 'live');
  
  // Initialize with live session if available
  useEffect(() => {
    if (liveSession && selectedTimeRange === 'live') {
      setSelectedSession(liveSession.id);
    } else if (selectedTimeRange === 'session' && !selectedSession) {
      setSelectedSession(sessions[0]?.id || null);
    }
  }, [liveSession]);

  // Real-time data updates (simulated)
  useEffect(() => {
    if (selectedTimeRange === 'live' && isLive) {
      const interval = setInterval(() => {
        setLastUpdate(new Date());
        // In real app, this would fetch new data from API
      }, 3000); // Update every 3 seconds for live view

      return () => clearInterval(interval);
    } else if (selectedTimeRange === 'session') {
      // Update every 3 seconds for near real-time updates
      const interval = setInterval(() => {
        setLastUpdate(new Date());
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [selectedTimeRange, isLive]);

  // Generate dynamic data based on time range
  const getEngagementData = (): EngagementData => {
    const baseData = {
      live: {
        averageEngagement: 72 + Math.floor(Math.random() * 10),
        totalStudents: 32,
        activeNow: 28 + Math.floor(Math.random() * 5),
        questionsAnswered: 45 + Math.floor(Math.random() * 10),
        averageResponseTime: 12.5 + (Math.random() * 3 - 1.5)
      },
      session: selectedSession ? {
        averageEngagement: sessions.find(s => s.id === selectedSession)?.averageEngagement || 75,
        totalStudents: sessions.find(s => s.id === selectedSession)?.studentCount || 30,
        activeNow: sessions.find(s => s.id === selectedSession)?.studentCount || 30,
        questionsAnswered: 52,
        averageResponseTime: 11.2
      } : {
        averageEngagement: 75,
        totalStudents: 30,
        activeNow: 30,
        questionsAnswered: 52,
        averageResponseTime: 11.2
      },
      week: {
        averageEngagement: 74,
        totalStudents: 125,
        activeNow: 98,
        questionsAnswered: 342,
        averageResponseTime: 10.8
      }
    };

    return baseData[selectedTimeRange];
  };

  const engagementMetrics = useMemo(() => getEngagementData(), [selectedTimeRange, selectedSession, lastUpdate]);

  // Generate clusters data based on time range
  const getClustersData = (): ClusterData[] => {
    const baseClusters = {
      live: [
        {
          id: '1',
          name: 'Active Participants',
          description: 'Highly engaged students',
          studentCount: 18 + Math.floor(Math.random() * 3),
          engagementLevel: 'high' as const,
          color: '#22c55e',
          prediction: 'stable' as const
        },
        {
          id: '2',
          name: 'Moderate Participants',
          description: 'Moderately engaged students',
          studentCount: 10 + Math.floor(Math.random() * 3),
          engagementLevel: 'medium' as const,
          color: '#f59e0b',
          prediction: 'improving' as const
        },
        {
          id: '3',
          name: 'At-Risk Students',
          description: 'Low engagement, need support',
          studentCount: 4 + Math.floor(Math.random() * 2),
          engagementLevel: 'low' as const,
          color: '#ef4444',
          prediction: 'declining' as const
        }
      ],
      session: [
        {
          id: '1',
          name: 'Active Participants',
          description: 'Highly engaged students',
          studentCount: 16,
          engagementLevel: 'high' as const,
          color: '#22c55e',
          prediction: 'stable' as const
        },
        {
          id: '2',
          name: 'Moderate Participants',
          description: 'Moderately engaged students',
          studentCount: 9,
          engagementLevel: 'medium' as const,
          color: '#f59e0b',
          prediction: 'improving' as const
        },
        {
          id: '3',
          name: 'At-Risk Students',
          description: 'Low engagement, need support',
          studentCount: 3,
          engagementLevel: 'low' as const,
          color: '#ef4444',
          prediction: 'declining' as const
        }
      ],
      week: [
        {
          id: '1',
          name: 'Active Participants',
          description: 'Highly engaged students',
          studentCount: 68,
          engagementLevel: 'high' as const,
          color: '#22c55e',
          prediction: 'stable' as const
        },
        {
          id: '2',
          name: 'Moderate Participants',
          description: 'Moderately engaged students',
          studentCount: 42,
          engagementLevel: 'medium' as const,
          color: '#f59e0b',
          prediction: 'improving' as const
        },
        {
          id: '3',
          name: 'At-Risk Students',
          description: 'Low engagement, need support',
          studentCount: 15,
          engagementLevel: 'low' as const,
          color: '#ef4444',
          prediction: 'declining' as const
        }
      ]
    };

    return baseClusters[selectedTimeRange];
  };

  const clusters = useMemo(() => getClustersData(), [selectedTimeRange, lastUpdate]);

  // Generate engagement trends data
  const getEngagementTrend = () => {
    if (selectedTimeRange === 'live') {
      // Last 10 minutes, updating every minute
      return Array.from({ length: 10 }, (_, i) => ({
        time: `${10 - i} min ago`,
        value: 70 + Math.floor(Math.random() * 10)
      }));
    } else if (selectedTimeRange === 'session') {
      // Throughout the session
      return Array.from({ length: 12 }, (_, i) => ({
        time: `${i * 5} min`,
        value: 65 + Math.floor(Math.random() * 15)
      }));
    } else {
      // Weekly data - last 7 days
      return Array.from({ length: 7 }, (_, i) => ({
        time: `${i + 1} days ago`,
        value: 68 + Math.floor(Math.random() * 12)
      }));
    }
  };

  const engagementTrend = useMemo(() => getEngagementTrend(), [selectedTimeRange, lastUpdate]);

  // Generate at-risk students based on time range
  const getAtRiskStudents = () => {
    const baseStudents = [
      { id: '1', name: 'John Doe', engagement: 35, cluster: 'At-Risk Students', lastActive: '2 min ago' },
      { id: '2', name: 'Jane Smith', engagement: 28, cluster: 'At-Risk Students', lastActive: '5 min ago' },
      { id: '3', name: 'Bob Wilson', engagement: 42, cluster: 'At-Risk Students', lastActive: '1 min ago' },
    ];

    if (selectedTimeRange === 'week') {
      return [
        ...baseStudents,
        { id: '4', name: 'Alice Brown', engagement: 38, cluster: 'At-Risk Students', lastActive: '3 days ago' },
        { id: '5', name: 'Charlie Davis', engagement: 31, cluster: 'At-Risk Students', lastActive: '2 days ago' },
      ];
    }

    return baseStudents;
  };

  const atRiskStudents = useMemo(() => getAtRiskStudents(), [selectedTimeRange]);

  // Moderate / Active students (for dropdown list)
  const moderateActiveStudents = useMemo(
    () => [
      { id: 'm1', name: 'Alice Johnson', engagement: 72, cluster: 'Active Participants', lastActive: '2 min ago' },
      { id: 'm2', name: 'Charlie Brown', engagement: 65, cluster: 'Moderate Participants', lastActive: '3 min ago' },
      { id: 'm3', name: 'David Lee', engagement: 88, cluster: 'Active Participants', lastActive: '4 min ago' },
      { id: 'm4', name: 'Emma Wilson', engagement: 91, cluster: 'Active Participants', lastActive: '5 min ago' },
      { id: 'm5', name: 'Frank Miller', engagement: 68, cluster: 'Moderate Participants', lastActive: '6 min ago' },
    ],
    [],
  );

  const [studentListView, setStudentListView] = useState<'at-risk' | 'moderate-active'>('at-risk');
  const displayedStudents = studentListView === 'at-risk' ? atRiskStudents : moderateActiveStudents;
  const isAtRiskView = studentListView === 'at-risk';

  // Format last update time
  const formatLastUpdate = () => {
    const seconds = Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return lastUpdate.toLocaleTimeString();
  };

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Real-Time Analytics Dashboard</h1>
            {selectedTimeRange === 'live' && isLive && (
              <Badge variant="danger" className="animate-pulse w-fit">
                <Radio className="h-3 w-3 mr-1" />
                LIVE
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            Monitor student engagement in real-time
          </p>
        </div>
      </div>

      {/* Key Metrics: Total Students in Session + Questions per Student (real-time) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Students in Session</p>
              <p className="text-2xl font-bold text-gray-900">{engagementMetrics.totalStudents}</p>
              <p className="text-xs text-gray-500 mt-1">
                {engagementMetrics.activeNow} active
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Questions per Student (real-time)</p>
              <p className="text-2xl font-bold text-gray-900">{engagementMetrics.questionsAnswered}</p>
              <p className="text-xs text-purple-600 mt-1">
                {engagementMetrics.totalStudents > 0
                  ? `${Math.floor(engagementMetrics.questionsAnswered / engagementMetrics.totalStudents)} sent per student`
                  : '0 per student'}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Target className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Clustering Visualization */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Student Clusters</h2>
        <ClusterVisualization clusters={clusters} showPredictions={true} />
      </div>

      {/* Student list: default At-Risk; dropdown to show Moderate Active */}
      <div className="mb-6">
        <Card>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                {isAtRiskView ? (
                  <>
                    <AlertCircle className="h-5 w-5 mr-2 text-red-600" />
                    At-Risk Students
                  </>
                ) : (
                  <>
                    <Target className="h-5 w-5 mr-2 text-green-600" />
                    Moderate Active Students
                  </>
                )}
              </h3>
              <div className="flex items-center gap-3">
                <label htmlFor="student-list-view" className="text-sm font-medium text-gray-700">Show:</label>
                <select
                  id="student-list-view"
                  value={studentListView}
                  onChange={(e) => setStudentListView(e.target.value as 'at-risk' | 'moderate-active')}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="at-risk">At-Risk Students</option>
                  <option value="moderate-active">Moderate Active Students</option>
                </select>
                <Badge variant={isAtRiskView ? 'danger' : 'success'}>{displayedStudents.length}</Badge>
              </div>
            </div>
            <div className="space-y-3">
              {displayedStudents.map((student) => (
                <div
                  key={student.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    isAtRiskView ? 'bg-red-50' : 'bg-green-50'
                  }`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{student.name}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-gray-500">Engagement: {student.engagement}%</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">{student.lastActive}</span>
                      {!isAtRiskView && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">{student.cluster}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {isAtRiskView && (
                    <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                      Intervene
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
