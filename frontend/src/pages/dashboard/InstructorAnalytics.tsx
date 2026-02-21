import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { ClusterVisualization } from '../../components/clustering/ClusterVisualization';
import { Users, AlertCircle, Target, Radio, Download, FileText, Loader2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { sessionService } from '../../services/sessionService';
import { clusteringService, StudentCluster, ClusterResponse } from '../../services/clusteringService';
import { toast } from 'sonner';

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
  engagementLevel: 'active' | 'moderate' | 'passive';
  color: string;
  prediction: 'stable' | 'improving' | 'declining';
  students: string[];  // Real student IDs from KMeans model
  studentNames?: Record<string, string>; // studentId -> "firstName lastName"
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

const POLL_INTERVAL_MS = 4000;

export const InstructorAnalytics = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedTimeRange, setSelectedTimeRange] = useState<'live' | 'session' | 'week'>('live');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [liveParticipantCount, setLiveParticipantCount] = useState<number | null>(null);
  const [realtimeStats, setRealtimeStats] = useState<{
    totalStudents: number;
    activeStudents: number;
    totalQuestions: number;
    totalAnswers: number;
  } | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [loadingClusters, setLoadingClusters] = useState(false);

  // Fetch sessions from API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSessions(true);
      const list = await sessionService.getAllSessions();
      if (cancelled) return;
      const mapped: Session[] = (list || []).map((s: { id: string; title: string; date: string; time: string; status: string; participants?: number }) => ({
        id: s.id,
        title: s.title,
        date: s.date,
        time: s.time,
        status: (s.status || 'upcoming') as 'live' | 'upcoming' | 'completed',
        studentCount: s.participants ?? 0,
        averageEngagement: 75
      }));
      setSessions(mapped);
      if (mapped.length && !cancelled) {
        // Prefer live session for real-time clustering, fallback to completed
        const live = mapped.find(s => s.status === 'live');
        const completed = mapped.find(s => s.status === 'completed');
        setSelectedSession(live?.id ?? completed?.id ?? mapped[0]?.id ?? null);
      }
      setLoadingSessions(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Initialize selected session: prefer live, then completed, then first
  useEffect(() => {
    if (!selectedSession && sessions.length) {
      const live = sessions.find(s => s.status === 'live');
      const completed = sessions.find(s => s.status === 'completed');
      setSelectedSession(live?.id ?? completed?.id ?? sessions[0]?.id ?? null);
    }
  }, [sessions, selectedSession]);

  // Real-time engagement data from the database (updated via cluster polling)
  const engagementMetrics: EngagementData = useMemo(() => {
    const totalStudents = realtimeStats?.totalStudents ?? liveParticipantCount ?? sessions.find(s => s.id === selectedSession)?.studentCount ?? 0;
    const activeNow = realtimeStats?.activeStudents ?? liveParticipantCount ?? 0;
    const totalQuestions = realtimeStats?.totalQuestions ?? 0;
    const totalAnswers = realtimeStats?.totalAnswers ?? 0;

    return {
      averageEngagement: 0,
      totalStudents,
      activeNow,
      questionsAnswered: totalQuestions,
      averageResponseTime: totalStudents > 0 && totalAnswers > 0
        ? +(totalAnswers / totalStudents).toFixed(1)
        : 0,
    };
  }, [realtimeStats, liveParticipantCount, selectedSession, sessions]);

  const selectedSessionObj = selectedSession ? sessions.find(s => s.id === selectedSession) : null;

  const handleDownloadReport = async () => {
    if (!selectedSession) return;
    setDownloadingReportId(selectedSession);
    try {
      const filename = `report_${selectedSessionObj?.title?.replace(/\s+/g, '_') || selectedSession}.pdf`;
      const result = await sessionService.downloadReport(selectedSession, filename);
      if (result.success) {
        if (result.error) {
          // Fallback case - downloaded but as HTML
          toast.success(result.error);
        } else {
          toast.success('Report downloaded as PDF');
        }
      } else {
        toast.error(result.error || 'Report not available yet');
      }
    } catch {
      toast.error('Failed to download report');
    }
    setDownloadingReportId(null);
  };

  // ── Fetch real cluster data + realtime stats from KMeans API ─────
  const fetchClusters = useCallback(async (sessionId: string) => {
    setLoadingClusters(true);
    try {
      const response = await clusteringService.getClusters(sessionId);
      const clusterList = response.clusters;

      // Update realtime stats from the same response
      if (response.realtimeStats) {
        setRealtimeStats(response.realtimeStats);
        setLiveParticipantCount(response.realtimeStats.activeStudents);
      }
      setLastUpdate(new Date());

      if (clusterList && clusterList.length > 0) {
        setClusters(clusterList.map((c: StudentCluster) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          studentCount: c.studentCount,
          engagementLevel: c.engagementLevel,
          color: c.color,
          prediction: c.prediction,
          students: c.students || [],
          studentNames: c.studentNames || {},
        })));
      } else {
        setClusters(clusteringService.getDefaultClusters().map(c => ({ ...c, students: [] })));
      }
    } catch (error) {
      console.error('Error fetching clusters:', error);
      setClusters(clusteringService.getDefaultClusters().map(c => ({ ...c, students: [] })));
    }
    setLoadingClusters(false);
  }, []);

  // Fetch clusters on session change + poll every 5s for real-time updates
  useEffect(() => {
    if (!selectedSession) return;

    // Fetch immediately
    fetchClusters(selectedSession);

    // Poll every 5 seconds so instructor sees live cluster updates
    const interval = setInterval(() => {
      fetchClusters(selectedSession);
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedSession, fetchClusters]);

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

  // ── Build a combined name map from all clusters ─────────────────
  const studentNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clusters) {
      if (c.studentNames) {
        Object.assign(map, c.studentNames);
      }
    }
    return map;
  }, [clusters]);

  const getStudentName = useCallback((sid: string) => {
    return studentNameMap[sid] || `Student ${sid.slice(0, 8)}`;
  }, [studentNameMap]);

  // ── Build student lists from REAL cluster data ──────────────────
  // At-Risk students = students in the "low" engagement cluster
  const atRiskStudents = useMemo(() => {
    const lowCluster = clusters.find(c => c.engagementLevel === 'passive');
    if (!lowCluster || !lowCluster.students || lowCluster.students.length === 0) {
      return [];
    }
    return lowCluster.students.map((studentId) => ({
      id: studentId,
      name: getStudentName(studentId),
      engagement: 0,
      cluster: 'At-Risk Students',
      lastActive: 'In session',
    }));
  }, [clusters, getStudentName]);

  // Active + Moderate students (from high and medium clusters)
  const moderateActiveStudents = useMemo(() => {
    const result: { id: string; name: string; engagement: number; cluster: string; lastActive: string }[] = [];

    const highCluster = clusters.find(c => c.engagementLevel === 'active');
    if (highCluster?.students) {
      highCluster.students.forEach(sid => {
        result.push({
          id: sid,
          name: getStudentName(sid),
          engagement: 0,
          cluster: 'Active Participants',
          lastActive: 'In session',
        });
      });
    }

    const medCluster = clusters.find(c => c.engagementLevel === 'moderate');
    if (medCluster?.students) {
      medCluster.students.forEach(sid => {
        result.push({
          id: sid,
          name: getStudentName(sid),
          engagement: 0,
          cluster: 'Moderate Participants',
          lastActive: 'In session',
        });
      });
    }

    return result;
  }, [clusters, getStudentName]);

  // Active-only students (from high cluster)
  const activeStudents = useMemo(() => {
    const activeCluster = clusters.find(c => c.engagementLevel === 'active');
    if (!activeCluster?.students) return [];
    return activeCluster.students.map(sid => ({
      id: sid,
      name: getStudentName(sid),
      engagement: 0,
      cluster: 'Active Participants',
      lastActive: 'In session',
    }));
  }, [clusters, getStudentName]);

  // Moderate-only students (from medium cluster)
  const moderateStudents = useMemo(() => {
    const medCluster = clusters.find(c => c.engagementLevel === 'moderate');
    if (!medCluster?.students) return [];
    return medCluster.students.map(sid => ({
      id: sid,
      name: getStudentName(sid),
      engagement: 0,
      cluster: 'Moderate Participants',
      lastActive: 'In session',
    }));
  }, [clusters, getStudentName]);

  const [studentListView, setStudentListView] = useState<'at-risk' | 'moderate' | 'active'>('at-risk');
  const displayedStudents = studentListView === 'at-risk'
    ? atRiskStudents
    : studentListView === 'moderate'
      ? moderateStudents
      : activeStudents;
  const isAtRiskView = studentListView === 'at-risk';

  // Format last update time
  const formatLastUpdate = () => {
    const seconds = Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return lastUpdate.toLocaleTimeString();
  };

  return (
    <div className="py-6">
      {/* Title and subtitle at top */}
      <div className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">Real-Time Analytics Dashboard</h1>
          {selectedTimeRange === 'live' && isLive && (
            <Badge variant="danger" className="animate-pulse w-fit">
              <Radio className="h-3 w-3 mr-1" />
              LIVE
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          Monitor student engagement in real-time
        </p>
      </div>

      {loadingSessions && (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading sessions...</div>
      )}

      {/* Key Metrics: Total Students in Session + Questions per Student (real-time) */}
      {!loadingSessions && (
      <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Students in Session</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{engagementMetrics.totalStudents}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {engagementMetrics.activeNow} active
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Questions Sent (real-time)</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{engagementMetrics.questionsAnswered}</p>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                {engagementMetrics.totalStudents > 0 && engagementMetrics.questionsAnswered > 0
                  ? `${(engagementMetrics.questionsAnswered / engagementMetrics.totalStudents).toFixed(1)} per student`
                  : '0 per student'}
              </p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Target className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Clustering Visualization */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Student Clusters</h2>
        <ClusterVisualization clusters={clusters} showPredictions={true} />
      </div>

      {/* Student list: default At-Risk; dropdown to show Moderate Active */}
      <div className="mb-6">
        <Card>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                {studentListView === 'at-risk' ? (
                  <>
                    <AlertCircle className="h-5 w-5 mr-2 text-red-600 dark:text-red-400" />
                    At-Risk Students (Passive)
                  </>
                ) : studentListView === 'moderate' ? (
                  <>
                    <Target className="h-5 w-5 mr-2 text-yellow-500 dark:text-yellow-400" />
                    Moderate Students
                  </>
                ) : (
                  <>
                    <Target className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
                    Active Students
                  </>
                )}
              </h3>
              <div className="flex items-center gap-3">
                <label htmlFor="student-list-view" className="text-sm font-medium text-gray-700 dark:text-gray-300">Show:</label>
                <select
                  id="student-list-view"
                  value={studentListView}
                  onChange={(e) => setStudentListView(e.target.value as 'at-risk' | 'moderate' | 'active')}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="at-risk">At-Risk / Passive</option>
                  <option value="moderate">Moderate</option>
                  <option value="active">Active</option>
                </select>
                <Badge variant={studentListView === 'at-risk' ? 'danger' : studentListView === 'moderate' ? 'warning' : 'success'}>
                  {displayedStudents.length}
                </Badge>
              </div>
            </div>
            <div className="space-y-3">
              {displayedStudents.length === 0 && (
                <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                  <p className="text-sm">No students clustered yet.</p>
                  <p className="text-xs mt-1">Clusters will appear after students submit quiz answers.</p>
                </div>
              )}
              {displayedStudents.map((student) => (
                <div
                  key={student.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    studentListView === 'at-risk' ? 'bg-red-50 dark:bg-red-900/20' :
                    studentListView === 'moderate' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-green-50 dark:bg-green-900/20'
                  }`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{student.name}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">ID: {student.id.slice(0, 12)}...</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">•</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{student.lastActive}</span>
                      {!isAtRiskView && (
                        <>
                          <span className="text-xs text-gray-400 dark:text-gray-500">•</span>
                          <span className={`text-xs font-medium ${
                            student.cluster === 'Active Participants' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
                          }`}>{student.cluster}</span>
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

      {/* Session Reports Section — at the bottom, completed sessions only */}
      {sessions.filter(s => s.status === 'completed').length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Session Reports</h2>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center gap-2">
              <label htmlFor="analytics-session" className="text-sm font-medium text-gray-700 dark:text-gray-300">Session:</label>
              <select
                id="analytics-session"
                value={selectedSession || ''}
                onChange={(e) => setSelectedSession(e.target.value || null)}
                className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 max-w-md"
              >
                {sessions.filter(s => s.status === 'completed').map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} — {s.date}
                  </option>
                ))}
              </select>
            </div>
            {selectedSession && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<FileText className="h-4 w-4" />}
                  onClick={() => navigate(`/dashboard/sessions/${selectedSession}/report`)}
                >
                  View report
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={downloadingReportId === selectedSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  onClick={handleDownloadReport}
                  disabled={downloadingReportId === selectedSession}
                >
                  {downloadingReportId === selectedSession ? 'Downloading...' : 'Download report'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};
