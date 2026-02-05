import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSessionConnection } from '../../context/SessionConnectionContext';
import { Card } from '../../components/ui/Card';
import { EngagementIndicator } from '../../components/engagement/EngagementIndicator';
import { PersonalizedFeedback } from '../../components/feedback/PersonalizedFeedback';
import { Activity, Target, Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { sessionService } from '../../services/sessionService';
import { toast } from 'sonner';

interface Session {
  id: string;
  title: string;
  date: string;
  status: string;
}

const POLL_INTERVAL_MS = 8000;

export const StudentEngagement = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { connectedSessionId } = useSessionConnection();
  const sessionIdFromStorage = typeof window !== 'undefined' ? localStorage.getItem('connectedSessionId') : null;
  const activeSessionId = connectedSessionId || sessionIdFromStorage;

  const [liveReport, setLiveReport] = useState<{
    questionsAnswered: number;
    correctAnswers: number;
    quizScore: number | null;
    averageResponseTime: number | null;
    sessionTitle?: string;
  } | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  
  // Session reports section state
  const [completedSessions, setCompletedSessions] = useState<Session[]>([]);
  const [selectedReportSession, setSelectedReportSession] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  // Real-time: poll session report when student is in a session
  useEffect(() => {
    if (!activeSessionId || !user?.id) {
      setLiveReport(null);
      return;
    }
    const fetchReport = async () => {
      const report = await sessionService.getSessionReport(activeSessionId);
      if (!report?.students?.length) return;
      const me = report.students[0];
      setLiveReport({
        questionsAnswered: me.totalQuestions ?? 0,
        correctAnswers: me.correctAnswers ?? 0,
        quizScore: me.quizScore ?? null,
        averageResponseTime: me.averageResponseTime ?? null,
        sessionTitle: report.sessionTitle
      });
    };
    fetchReport();
    const interval = setInterval(fetchReport, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeSessionId, user?.id]);

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

  const handleDownloadReport = async () => {
    if (!activeSessionId) return;
    setDownloadingReport(true);
    try {
      const filename = `report_${liveReport?.sessionTitle?.replace(/\s+/g, '_') || activeSessionId}.pdf`;
      const result = await sessionService.downloadReport(activeSessionId, filename);
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

  // Merge live report with defaults for display
  const studentData = useMemo(() => {
    const base = {
      engagementLevel: 'high' as const,
      engagementScore: 85,
      cluster: 'Active Participants',
      sessionEngagement: 78,
      overallEngagement: 82,
      questionsAnswered: 12,
      correctAnswers: 10,
      averageResponseTime: 8.5
    };
    if (liveReport) {
      return {
        ...base,
        questionsAnswered: liveReport.questionsAnswered,
        correctAnswers: liveReport.correctAnswers,
        averageResponseTime: liveReport.averageResponseTime ?? base.averageResponseTime,
        engagementScore: liveReport.quizScore ?? base.engagementScore
      };
    }
    return base;
  }, [liveReport]);

  const feedback = [
    {
      id: '1',
      type: 'achievement' as const,
      message: 'Great job! You\'ve maintained high engagement throughout this session. Keep up the excellent participation!',
      clusterContext: 'Active Participants',
      suggestions: [
        'Continue asking questions during discussions',
        'Help other students when possible'
      ],
      timestamp: '2 minutes ago'
    },
    {
      id: '2',
      type: 'encouragement' as const,
      message: 'Your response time has improved significantly. You\'re responding 20% faster than last week!',
      clusterContext: 'Active Participants',
      timestamp: '5 minutes ago'
    },
    {
      id: '3',
      type: 'improvement' as const,
      message: 'Consider participating more in group discussions. Your input would be valuable to the class.',
      suggestions: [
        'Raise your hand when you have questions',
        'Share your thoughts in the chat more often'
      ],
      timestamp: '10 minutes ago'
    }
  ];

  return (
    <div className="py-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">My Engagement Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track your engagement, receive personalized feedback, and improve your learning
          </p>
        </div>
        {activeSessionId && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<FileText className="h-4 w-4" />}
              onClick={() => navigate(`/dashboard/sessions/${activeSessionId}/report`)}
            >
              View report
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={downloadingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              onClick={handleDownloadReport}
              disabled={downloadingReport}
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
            <h3 className="text-lg font-semibold text-gray-900">Current Engagement</h3>
            <Activity className="h-6 w-6 text-indigo-600" />
          </div>
          <EngagementIndicator
            engagementLevel={studentData.engagementLevel}
            engagementScore={studentData.engagementScore}
            cluster={studentData.cluster}
            showCluster={true}
          />
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Quiz Performance</h3>
            <Target className="h-6 w-6 text-purple-600" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Correct Answers</span>
              <span className="font-semibold text-gray-900">
                {studentData.correctAnswers}/{studentData.questionsAnswered}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Response Time</span>
              <span className="font-semibold text-gray-900">{studentData.averageResponseTime}s</span>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Personalized Feedback</h2>
        <PersonalizedFeedback feedback={feedback} studentName={user?.firstName} />
      </div>

      {/* Session Reports Section — at the bottom */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Session Reports</h2>
        {completedSessions.length > 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center gap-2">
              <label htmlFor="student-session-report" className="text-sm font-medium text-gray-700">Session:</label>
              <select
                id="student-session-report"
                value={selectedReportSession || ''}
                onChange={(e) => setSelectedReportSession(e.target.value || null)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 max-w-md"
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
          <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
            No completed sessions yet. Reports will appear here after you participate in sessions.
          </div>
        )}
      </div>
    </div>
  );
};

