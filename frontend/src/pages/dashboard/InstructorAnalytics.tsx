import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { ClusterVisualization } from '../../components/clustering/ClusterVisualization';
import { BarChart2, Users, TrendingUp, AlertCircle, Clock, Target, Radio, Calendar, Play, Pause, RefreshCw, Activity } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';

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

  // Generate recent activity
  const getRecentActivity = () => {
    const activities = [
      { time: '2 min ago', student: 'Alice Johnson', action: 'Answered quiz question', cluster: 'Active Participants' },
      { time: '3 min ago', student: 'Charlie Brown', action: 'Raised hand', cluster: 'Moderate Participants' },
      { time: '4 min ago', student: 'David Lee', action: 'Submitted feedback', cluster: 'Active Participants' },
      { time: '5 min ago', student: 'Emma Wilson', action: 'Asked a question', cluster: 'Active Participants' },
      { time: '6 min ago', student: 'Frank Miller', action: 'Completed quiz', cluster: 'Moderate Participants' },
    ];

    if (selectedTimeRange === 'week') {
      return [
        ...activities,
        { time: '1 day ago', student: 'Grace Taylor', action: 'Completed assignment', cluster: 'Active Participants' },
        { time: '2 days ago', student: 'Henry Adams', action: 'Submitted project', cluster: 'Active Participants' },
      ];
    }

    return activities;
  };

  const recentActivity = useMemo(() => getRecentActivity(), [selectedTimeRange]);

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
            {selectedTimeRange === 'live' && 'Monitor student engagement in real-time'}
            {selectedTimeRange === 'session' && 'View analytics for a specific session'}
            {selectedTimeRange === 'week' && 'View weekly engagement trends and statistics'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedTimeRange === 'live' && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={isLive ? <Pause className="h-3 w-3 sm:h-4 sm:w-4" /> : <Play className="h-3 w-3 sm:h-4 sm:w-4" />}
              onClick={() => setIsLive(!isLive)}
              className="text-xs sm:text-sm"
            >
              {isLive ? 'Pause' : 'Resume'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-3 w-3 sm:h-4 sm:w-4" />}
            onClick={() => setLastUpdate(new Date())}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">↻</span>
          </Button>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            Updated {formatLastUpdate()}
          </span>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex flex-wrap gap-2">
          {(['live', 'session', 'week'] as const).map((range) => (
            <button
              key={range}
              onClick={() => {
                setSelectedTimeRange(range);
                if (range === 'live' && liveSession) {
                  setSelectedSession(liveSession.id);
                } else if (range === 'session' && !selectedSession) {
                  setSelectedSession(sessions[0]?.id || null);
                }
              }}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                selectedTimeRange === range
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }`}
            >
              {range === 'live' && <Radio className="h-3 w-3 sm:h-4 sm:w-4 inline mr-1" />}
              {range === 'session' && <Calendar className="h-3 w-3 sm:h-4 sm:w-4 inline mr-1" />}
              {range === 'week' && <Activity className="h-3 w-3 sm:h-4 sm:w-4 inline mr-1" />}
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>

        {/* Session Selector (for session view) */}
        {selectedTimeRange === 'session' && (
          <select
            value={selectedSession || ''}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-xs sm:text-sm w-full sm:w-auto"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} - {session.date} ({session.status})
              </option>
            ))}
          </select>
        )}

        {/* Week Selector (for week view) */}
        {selectedTimeRange === 'week' && (
          <div className="text-xs sm:text-sm text-gray-600">
            Week of {new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString()} - {new Date().toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Engagement</p>
              <p className="text-2xl font-bold text-gray-900">{engagementMetrics.averageEngagement}%</p>
              {selectedTimeRange === 'live' && (
                <p className="text-xs text-blue-600 mt-1 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +2.5%
                </p>
              )}
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Students</p>
              <p className="text-2xl font-bold text-gray-900">{engagementMetrics.totalStudents}</p>
              {selectedTimeRange === 'live' && (
                <p className="text-xs text-gray-500 mt-1">
                  {engagementMetrics.activeNow} active
                </p>
              )}
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                {selectedTimeRange === 'live' ? 'Active Now' : 'Participants'}
              </p>
              <p className="text-2xl font-bold text-gray-900">{engagementMetrics.activeNow}</p>
              {selectedTimeRange === 'live' && (
                <p className="text-xs text-blue-600 mt-1 flex items-center">
                  <Activity className="h-3 w-3 mr-1" />
                  Real-time
                </p>
              )}
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Questions</p>
              <p className="text-2xl font-bold text-gray-900">{engagementMetrics.questionsAnswered}</p>
              {selectedTimeRange === 'live' && (
                <p className="text-xs text-purple-600 mt-1">
                  {Math.floor(engagementMetrics.questionsAnswered / engagementMetrics.totalStudents)} per student
                </p>
              )}
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <Target className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Response</p>
              <p className="text-2xl font-bold text-gray-900">{engagementMetrics.averageResponseTime.toFixed(1)}s</p>
              {selectedTimeRange === 'live' && (
                <p className="text-xs text-gray-500 mt-1">
                  Response time
                </p>
              )}
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <BarChart2 className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Engagement Trend Chart */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900">
            Engagement Trend
            <span className="block sm:inline sm:ml-1 text-xs sm:text-base text-gray-600 font-normal">
              {selectedTimeRange === 'live' && '(Last 10 Minutes)'}
              {selectedTimeRange === 'session' && '(Throughout Session)'}
              {selectedTimeRange === 'week' && '(Last 7 Days)'}
            </span>
          </h2>
        </CardHeader>
        <CardContent>
          <div className="h-48 sm:h-64 flex items-end justify-between space-x-1 sm:space-x-2 overflow-x-auto">
            {engagementTrend.map((point, index) => {
              const maxValue = Math.max(...engagementTrend.map(p => p.value));
              const height = (point.value / maxValue) * 100;
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="w-full relative">
                    <div
                      className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                      style={{ height: `${height}%`, minHeight: '20px' }}
                      title={`${point.value}% - ${point.time}`}
                    >
                      <div className="absolute -top-5 sm:-top-6 left-1/2 transform -translate-x-1/2 text-xs text-gray-600 whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity">
                        {point.value}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 text-center transform -rotate-45 origin-left whitespace-nowrap hidden sm:block">
                    {point.time}
                  </div>
                  <div className="mt-1 text-[10px] text-gray-500 text-center sm:hidden">
                    {point.time.split(' ')[0]}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Clustering Visualization */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Student Clusters</h2>
        <ClusterVisualization clusters={clusters} showPredictions={true} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* At-Risk Students */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-red-600" />
                At-Risk Students
              </h3>
              <Badge variant="danger">{atRiskStudents.length}</Badge>
            </div>
            <div className="space-y-3">
              {atRiskStudents.map((student) => (
                <div key={student.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{student.name}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-gray-500">Engagement: {student.engagement}%</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">{student.lastActive}</span>
                    </div>
                  </div>
                  <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                    Intervene
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-blue-600" />
              Recent Activity
            </h3>
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-2 animate-pulse"></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{activity.student}</span> {activity.action}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant="default" size="sm">{activity.cluster}</Badge>
                      <span className="text-xs text-gray-500">{activity.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
