import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSessionConnection } from '../../context/SessionConnectionContext';
import { Card } from '../../components/ui/Card';
import { PersonalizedFeedback } from '../../components/feedback/PersonalizedFeedback';
import { FeedbackGraphs } from '../../components/feedback/FeedbackGraphs';
import { Activity, Target, Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { sessionService } from '../../services/sessionService';
import { clusteringService, StudentEngagementData } from '../../services/clusteringService';
import { feedbackService, StudentFeedback } from '../../services/feedbackService';
import { toast } from 'sonner';

interface Session {
  id: string;
  title: string;
  date: string;
  status: string;
}

const POLL_INTERVAL_MS = 8000;
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const StudentEngagement = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { connectedSessionId, latestFeedback } = useSessionConnection();
  const sessionIdFromStorage = typeof window !== 'undefined' ? localStorage.getItem('connectedSessionId') : null;
  const activeSessionId = connectedSessionId || sessionIdFromStorage;

  const [engagementData, setEngagementData] = useState<StudentEngagementData | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadingFeedback, setDownloadingFeedback] = useState(false);
  const [realFeedback, setRealFeedback] = useState<StudentFeedback | null>(null);
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null);
  
  // Session reports section state
  const [completedSessions, setCompletedSessions] = useState<Session[]>([]);
  const [selectedReportSession, setSelectedReportSession] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  // Resolve Zoom meeting ID → MongoDB session ID for report operations
  useEffect(() => {
    if (!activeSessionId) {
      setResolvedSessionId(null);
      return;
    }
    const resolve = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/sessions/resolve/${activeSessionId}`, {
          headers: { Authorization: `Bearer ${sessionStorage.getItem('access_token') || ''}` },
        });
        if (res.ok) {
          const data = await res.json();
          setResolvedSessionId(data.sessionId);
        } else {
          setResolvedSessionId(activeSessionId);
        }
      } catch {
        setResolvedSessionId(activeSessionId);
      }
    };
    resolve();
  }, [activeSessionId]);

  // Real-time: poll engagement data from the clustering API
  useEffect(() => {
    if (!activeSessionId || !user?.id) {
      setEngagementData(null);
      return;
    }
    const fetchEngagement = async () => {
      const data = await clusteringService.getStudentEngagement(user.id, activeSessionId);
      if (data) {
        setEngagementData(data);
      }
    };
    fetchEngagement();
    const interval = setInterval(fetchEngagement, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeSessionId, user?.id]);

  // Fetch personalized feedback from the API (Model-2)
  useEffect(() => {
    if (!activeSessionId || !user?.id) {
      setRealFeedback(null);
      return;
    }
    const fetchFeedback = async () => {
      const fb = await feedbackService.getStudentFeedback(user.id, activeSessionId);
      if (fb) setRealFeedback(fb);
    };
    fetchFeedback();
    const interval = setInterval(fetchFeedback, POLL_INTERVAL_MS * 2);
    return () => clearInterval(interval);
  }, [activeSessionId, user?.id]);

  const handleDownloadFeedbackCsv = async () => {
    if (!activeSessionId) return;
    setDownloadingFeedback(true);
    try {
      const ok = await feedbackService.downloadFeedbackCsv(activeSessionId);
      if (ok) toast.success('Feedback CSV downloaded');
      else toast.error('No feedback data available yet');
    } catch {
      toast.error('Failed to download feedback');
    }
    setDownloadingFeedback(false);
  };

  // Fetch sessions the student participated in (from reports API)
  useEffect(() => {
    const fetchParticipatedSessions = async () => {
      try {
        const { reports } = await sessionService.getAllReports();
        const participated = (reports || []).map((r: { sessionId: string; sessionTitle: string; sessionDate: string }) => ({
          id: r.sessionId,
          title: r.sessionTitle || 'Session',
          date: r.sessionDate || '',
          status: 'completed'
        }));
        setCompletedSessions(participated);
        if (participated.length > 0 && !selectedReportSession) {
          setSelectedReportSession(participated[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch participated sessions:', err);
      }
    };
    fetchParticipatedSessions();
  }, []);

  const reportSessionId = resolvedSessionId || activeSessionId;

  const handleDownloadReport = async () => {
    if (!reportSessionId) return;
    setDownloadingReport(true);
    try {
      const filename = `report_${reportSessionId}.pdf`;
      const result = await sessionService.downloadReport(reportSessionId, filename);
      if (result.success) {
        toast.success(result.error || 'Report downloaded as PDF');
      } else {
        toast.error(result.error || 'Report not available yet');
      }
    } catch {
      toast.error('Failed to download report');
    }
    setDownloadingReport(false);
  };

  // Download report for selected session in bottom section
  const handleDownloadSessionReport = async () => {
    if (!selectedReportSession) return;
    setDownloadingReportId(selectedReportSession);
    try {
      const session = completedSessions.find(s => s.id === selectedReportSession);
      const filename = `report_${session?.title?.replace(/\s+/g, '_') || selectedReportSession}.pdf`;
      const result = await sessionService.downloadReport(selectedReportSession, filename);
      if (result.success) {
        toast.success(result.error || 'Report downloaded as PDF');
      } else {
        toast.error(result.error || 'Report not available yet');
      }
    } catch {
      toast.error('Failed to download report');
    }
    setDownloadingReportId(null);
  };

  // Merge WebSocket real-time stats with polled engagement data.
  // WS sends cluster_label ("Active"/"Moderate"/"Passive"), map to display names.
  const studentData = useMemo(() => {
    const CLUSTER_DISPLAY: Record<string, { name: string; level: 'active' | 'moderate' | 'passive' }> = {
      active:   { name: 'Active Participants',   level: 'active' },
      moderate: { name: 'Moderate Participants',  level: 'moderate' },
      passive:  { name: 'At-Risk Students',       level: 'passive' },
    };

    const ws = latestFeedback?.stats;
    if (ws && ws.totalAttempts > 0) {
      const rawLabel = (ws.cluster || 'moderate').toLowerCase();
      const mapped = CLUSTER_DISPLAY[rawLabel] ?? CLUSTER_DISPLAY['moderate'];
      // If polled data has a more specific cluster name, prefer it
      const clusterName = engagementData?.cluster && engagementData.cluster !== 'Not Assigned'
        ? engagementData.cluster
        : mapped.name;
      const clusterLevel = engagementData?.engagementLevel || mapped.level;

      return {
        engagementLevel: clusterLevel as 'active' | 'moderate' | 'passive',
        engagementScore: engagementData?.engagementScore ?? 0,
        cluster: clusterName,
        questionsAnswered: ws.totalAttempts,
        correctAnswers: ws.correctAnswers,
        averageResponseTime: ws.responseTime ?? engagementData?.averageResponseTime ?? 0,
      };
    }
    if (engagementData) {
      return {
        engagementLevel: engagementData.engagementLevel as 'active' | 'moderate' | 'passive',
        engagementScore: engagementData.engagementScore,
        cluster: engagementData.cluster,
        questionsAnswered: engagementData.questionsAnswered,
        correctAnswers: engagementData.correctAnswers,
        averageResponseTime: engagementData.averageResponseTime,
      };
    }
    return {
      engagementLevel: 'moderate' as const,
      engagementScore: 0,
      cluster: 'Not Assigned',
      questionsAnswered: 0,
      correctAnswers: 0,
      averageResponseTime: 0,
    };
  }, [engagementData, latestFeedback]);

  // Graph history from WebSocket (primary) or polled feedback (fallback)
  const feedbackHistory = useMemo(() => {
    if (latestFeedback?.stats?.history?.length) return latestFeedback.stats.history;
    return [];
  }, [latestFeedback]);

  // Prefer WebSocket feedback, fall back to polled feedback
  const activeFeedback = latestFeedback?.feedback ?? realFeedback;
  const feedback = activeFeedback
    ? [
        {
          id: '1',
          type: activeFeedback.type,
          message: activeFeedback.message,
          clusterContext: activeFeedback.clusterContext,
          suggestions: activeFeedback.suggestions,
          timestamp: 'Live',
        },
      ]
    : [];

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">My Engagement Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track your engagement, receive personalized feedback, and improve your learning
          </p>
        </div>
        {activeSessionId && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<FileText className="h-4 w-4" />}
              onClick={() => navigate(`/dashboard/sessions/${reportSessionId}/report`)}
            >
              View report
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={downloadingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              onClick={handleDownloadReport}
              disabled={!reportSessionId || downloadingReport}
            >
              {downloadingReport ? 'Downloading...' : 'Download report'}
            </Button>
          </div>
        )}
      </div>

      {/* Engagement Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your Cluster</h3>
            <Activity className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex items-center space-x-3">
            <div className={`rounded-full p-2.5 text-white ${
              studentData.engagementLevel === 'active' ? 'bg-green-500' :
              studentData.engagementLevel === 'moderate' ? 'bg-yellow-500' : 'bg-red-500'
            }`}>
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{studentData.cluster}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {studentData.engagementLevel === 'active' ? 'Highly engaged' :
                 studentData.engagementLevel === 'moderate' ? 'Moderately engaged' : 'Needs improvement'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Quiz Performance</h3>
            <Target className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Correct Answers</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {studentData.correctAnswers}/{studentData.questionsAnswered}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Avg Response Time</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{studentData.averageResponseTime}s</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Real-time Performance Graphs */}
      {feedbackHistory.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Performance Trends</h2>
          <FeedbackGraphs history={feedbackHistory} />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Personalized Feedback</h2>
        <PersonalizedFeedback feedback={feedback} studentName={user?.firstName} />
      </div>

      {/* Session Reports Section — at the bottom */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Session Reports</h2>
        {completedSessions.length > 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center gap-2">
              <label htmlFor="student-session-report" className="text-sm font-medium text-gray-700 dark:text-gray-300">Session:</label>
              <select
                id="student-session-report"
                value={selectedReportSession || ''}
                onChange={(e) => setSelectedReportSession(e.target.value || null)}
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 max-w-md"
              >
                {completedSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} — {s.date}
                  </option>
                ))}
              </select>
            </div>
            {selectedReportSession && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<FileText className="h-4 w-4" />}
                  onClick={() => navigate(`/dashboard/sessions/${selectedReportSession}/report`)}
                >
                  View report
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={downloadingReportId === selectedReportSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  onClick={handleDownloadSessionReport}
                  disabled={downloadingReportId === selectedReportSession}
                >
                  {downloadingReportId === selectedReportSession ? 'Downloading...' : 'Download report'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center text-gray-500 dark:text-gray-400">
            No completed sessions yet. Reports will appear here after you participate in sessions.
          </div>
        )}
      </div>
    </div>
  );
};

