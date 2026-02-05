import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  FileTextIcon,
  ClockIcon,
  TrendingUpIcon,
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon,
  Loader2Icon,
  RefreshCwIcon,
  BookOpenIcon,
  AwardIcon,
  TimerIcon,
  DownloadIcon,
  EyeIcon
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { sessionService } from '../../services/sessionService';
import { toast } from 'sonner';

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Types
interface AttendanceRecord {
  sessionId: string;
  sessionName: string;
  courseName: string;
  courseCode: string;
  instructorName: string;
  sessionDate: string;
  sessionTime: string;
  sessionStatus: string;
  joinTime: string | null;
  leaveTime: string | null;
  durationMinutes: number | null;
}

interface QuizSession {
  sessionId: string;
  sessionName: string;
  courseName: string;
  sessionDate: string;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  score: number;
  averageResponseTime: number | null;
  questionDetails: {
    questionId: string;
    question: string;
    yourAnswer: number | null;
    isCorrect: boolean | null;
    timeTaken: number | null;
  }[];
}

interface SessionHistory {
  sessionId: string;
  sessionName: string;
  courseName: string;
  courseCode: string;
  instructorName: string;
  sessionDate: string;
  sessionTime: string;
  sessionStatus: string;
  joinedAt: string | null;
  leftAt: string | null;
  durationMinutes: number | null;
  quizParticipation: {
    totalQuestions: number;
    questionsAnswered: number;
    correctAnswers: number;
    score: number | null;
  };
}

// Type for stored reports
interface MyStoredReport {
  reportId: string;
  sessionId: string;
  sessionTitle: string;
  courseName: string;
  sessionDate: string;
  generatedAt: string;
  myTotalQuestions: number;
  myCorrectAnswers: number;
  myScore: number | null;
  myAttendanceDuration: number | null;
}

export const StudentReports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'stored' | 'attendance' | 'quiz' | 'history'>('stored');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  
  // Data states
  const [storedReports, setStoredReports] = useState<MyStoredReport[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any>(null);
  const [quizData, setQuizData] = useState<QuizSession[]>([]);
  const [quizOverall, setQuizOverall] = useState<any>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistory[]>([]);
  
  // Dashboard stats
  const [dashboardStats, setDashboardStats] = useState<any>(null);

  // Expanded quiz session for details
  const [expandedQuizSession, setExpandedQuizSession] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardStats();
    fetchStoredReports();
    fetchAttendance();
  }, []);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${sessionStorage.getItem('access_token') || ''}`,
    'Content-Type': 'application/json'
  });

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/reports/dashboard-stats`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setDashboardStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
    }
  };

  // Fetch stored reports from MongoDB
  const fetchStoredReports = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/reports/stored-reports`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setStoredReports(data.reports || []);
      }
    } catch (err) {
      console.error('Failed to fetch stored reports:', err);
    }
  };

  // Download session report as PDF
  const handleDownloadReport = async (report: MyStoredReport) => {
    setDownloadingReportId(report.sessionId);
    try {
      const filename = `report_${report.sessionTitle.replace(/\s+/g, '_')}.pdf`;
      const result = await sessionService.downloadReport(report.sessionId, filename);
      if (result.success) {
        toast.success(result.error || 'Report downloaded as PDF');
      } else {
        toast.error(result.error || 'Failed to download report');
      }
    } catch {
      toast.error('Failed to download report');
    }
    setDownloadingReportId(null);
  };

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/reports/attendance`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setAttendanceData(data.attendance || []);
        setAttendanceSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
    }
    setLoading(false);
  };

  const fetchQuizReport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/reports/quiz`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setQuizData(data.sessionQuizzes || []);
        setQuizOverall(data.overallStats);
      }
    } catch (err) {
      console.error('Failed to fetch quiz report:', err);
    }
    setLoading(false);
  };

  const fetchSessionHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/reports/session-history`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSessionHistory(data.sessionHistory || []);
      }
    } catch (err) {
      console.error('Failed to fetch session history:', err);
    }
    setLoading(false);
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'attendance' && attendanceData.length === 0) {
      fetchAttendance();
    } else if (tab === 'quiz' && quizData.length === 0) {
      fetchQuizReport();
    } else if (tab === 'history' && sessionHistory.length === 0) {
      fetchSessionHistory();
    }
  };

  const refreshCurrentTab = () => {
    if (activeTab === 'attendance') {
      fetchAttendance();
    } else if (activeTab === 'quiz') {
      fetchQuizReport();
    } else if (activeTab === 'history') {
      fetchSessionHistory();
    }
    fetchDashboardStats();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'live':
        return <Badge variant="primary">Live</Badge>;
      default:
        return <Badge variant="warning">Upcoming</Badge>;
    }
  };

  // ============ DOWNLOAD FUNCTIONS ============
  
  const downloadCSV = (filename: string, csvContent: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const downloadMyAttendance = () => {
    if (attendanceData.length === 0) {
      toast.error('No attendance data to download');
      return;
    }
    
    const headers = ['Session', 'Course', 'Instructor', 'Date', 'Join Time', 'Leave Time', 'Duration (min)', 'Status'];
    const rows = attendanceData.map(r => [
      r.sessionName,
      r.courseName,
      r.instructorName,
      r.sessionDate,
      r.joinTime ? new Date(r.joinTime).toLocaleString() : 'N/A',
      r.leaveTime ? new Date(r.leaveTime).toLocaleString() : '-',
      r.durationMinutes !== null ? r.durationMinutes.toString() : 'N/A',
      r.sessionStatus
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    downloadCSV(`my_attendance_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    toast.success('Attendance report downloaded!');
  };

  const downloadMyQuizScores = () => {
    if (quizData.length === 0) {
      toast.error('No quiz data to download');
      return;
    }
    
    const headers = ['Session', 'Course', 'Date', 'Total Questions', 'Correct', 'Incorrect', 'Unanswered', 'Score (%)'];
    const rows = quizData.map(r => [
      r.sessionName,
      r.courseName,
      r.sessionDate,
      r.totalQuestions.toString(),
      r.correctAnswers.toString(),
      r.incorrectAnswers.toString(),
      r.unanswered.toString(),
      r.score.toString()
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    downloadCSV(`my_quiz_scores_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    toast.success('Quiz scores downloaded!');
  };

  const downloadSessionHistory = () => {
    if (sessionHistory.length === 0) {
      toast.error('No session history to download');
      return;
    }
    
    const headers = ['Session', 'Course', 'Instructor', 'Date', 'Time', 'Duration (min)', 'Quiz Questions', 'Quiz Score (%)'];
    const rows = sessionHistory.map(r => [
      r.sessionName,
      r.courseName,
      r.instructorName,
      r.sessionDate,
      r.sessionTime,
      r.durationMinutes !== null ? r.durationMinutes.toString() : 'N/A',
      r.quizParticipation.totalQuestions.toString(),
      r.quizParticipation.score !== null ? r.quizParticipation.score.toString() : 'N/A'
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    downloadCSV(`my_session_history_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    toast.success('Session history downloaded!');
  };

  const handleDownload = () => {
    setDownloading(true);
    try {
      if (activeTab === 'attendance') {
        downloadMyAttendance();
      } else if (activeTab === 'quiz') {
        downloadMyQuizScores();
      } else if (activeTab === 'history') {
        downloadSessionHistory();
      }
    } catch (err) {
      toast.error('Failed to download report');
    }
    setDownloading(false);
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            My Reports
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            View your personal attendance, quiz scores, and session history
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            leftIcon={downloading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? 'Downloading...' : 'Download CSV'}
          </Button>
          <Button
            variant="outline"
            leftIcon={<RefreshCwIcon className="h-4 w-4" />}
            onClick={refreshCurrentTab}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Dashboard Stats */}
      {dashboardStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <CalendarIcon className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dashboardStats.sessionsAttended}
            </p>
            <p className="text-sm text-gray-500">Sessions Attended</p>
          </Card>
          <Card className="p-4 text-center">
            <FileTextIcon className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dashboardStats.totalQuizQuestions}
            </p>
            <p className="text-sm text-gray-500">Quiz Questions</p>
          </Card>
          <Card className="p-4 text-center">
            <AwardIcon className="h-8 w-8 text-purple-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dashboardStats.overallQuizScore}%
            </p>
            <p className="text-sm text-gray-500">Overall Score</p>
          </Card>
          <Card className="p-4 text-center">
            <TimerIcon className="h-8 w-8 text-orange-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dashboardStats.totalAttendanceMinutes}
            </p>
            <p className="text-sm text-gray-500">Total Minutes</p>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {[
          { id: 'stored', label: 'My Reports', icon: FileTextIcon },
          { id: 'attendance', label: 'My Attendance', icon: ClockIcon },
          { id: 'quiz', label: 'My Quiz Scores', icon: FileTextIcon },
          { id: 'history', label: 'Session History', icon: BookOpenIcon }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2Icon className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {/* Stored Reports Tab */}
          {activeTab === 'stored' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    📦 My Session Reports (Stored in MongoDB)
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">{storedReports.length} Reports</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<RefreshCwIcon className="h-4 w-4" />}
                      onClick={fetchStoredReports}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  These are your personal reports from completed sessions. Shows only your own data.
                </p>
              </CardHeader>
              <CardContent>
                {storedReports.length === 0 ? (
                  <div className="text-center py-12">
                    <FileTextIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-lg">No session reports yet</p>
                    <p className="text-gray-400 text-sm mt-2">
                      Reports are generated after the instructor ends a session you participated in
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Session</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Course</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">My Questions</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">My Correct</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">My Score</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Attendance</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {storedReports.map((report) => (
                          <tr key={report.reportId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                              {report.sessionTitle}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {report.courseName}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {report.sessionDate}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {report.myTotalQuestions}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-blue-600">
                                <CheckCircleIcon className="h-4 w-4" />
                                {report.myCorrectAnswers}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {report.myScore !== null ? (
                                <Badge variant={report.myScore >= 70 ? 'success' : report.myScore >= 50 ? 'warning' : 'destructive'}>
                                  {report.myScore}%
                                </Badge>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {report.myAttendanceDuration !== null ? `${report.myAttendanceDuration} min` : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  leftIcon={<EyeIcon className="h-3 w-3" />}
                                  onClick={() => navigate(`/dashboard/sessions/${report.sessionId}/report`)}
                                >
                                  View
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  leftIcon={downloadingReportId === report.sessionId ? <Loader2Icon className="h-3 w-3 animate-spin" /> : <DownloadIcon className="h-3 w-3" />}
                                  onClick={() => handleDownloadReport(report)}
                                  disabled={downloadingReportId === report.sessionId}
                                >
                                  {downloadingReportId === report.sessionId ? 'Downloading...' : 'Download report'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Attendance Tab */}
          {activeTab === 'attendance' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    My Attendance Report
                  </h3>
                  {attendanceSummary && (
                    <div className="text-sm text-gray-500">
                      Total: {attendanceSummary.totalSessionsAttended} sessions • {attendanceSummary.totalMinutesAttended} minutes
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {attendanceData.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <ClockIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>You haven't attended any sessions yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Session</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Course</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Join Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Leave Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Duration</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {attendanceData.map((record) => (
                          <tr key={record.sessionId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                              {record.sessionName}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.courseName}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.sessionDate}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.joinTime ? new Date(record.joinTime).toLocaleTimeString() : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.leaveTime ? new Date(record.leaveTime).toLocaleTimeString() : '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.durationMinutes !== null ? `${record.durationMinutes} min` : 'N/A'}
                            </td>
                            <td className="px-4 py-3">
                              {getStatusBadge(record.sessionStatus)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Quiz Tab */}
          {activeTab === 'quiz' && (
            <div className="space-y-4">
              {/* Overall Stats */}
              {quizOverall && (
                <Card className="p-4">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {quizOverall.totalSessionsWithQuiz}
                      </p>
                      <p className="text-sm text-gray-500">Sessions with Quiz</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {quizOverall.totalQuestionsAttempted}
                      </p>
                      <p className="text-sm text-gray-500">Questions Attempted</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        {quizOverall.totalCorrectAnswers}
                      </p>
                      <p className="text-sm text-gray-500">Correct Answers</p>
                    </div>
                    <div>
                      <p className={`text-2xl font-bold ${
                        quizOverall.overallScore >= 80 ? 'text-blue-600' : 
                        quizOverall.overallScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {quizOverall.overallScore}%
                      </p>
                      <p className="text-sm text-gray-500">Overall Score</p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Quiz by Session */}
              {quizData.length === 0 ? (
                <Card className="p-8 text-center">
                  <FileTextIcon className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-500">You haven't attempted any quizzes yet</p>
                </Card>
              ) : (
                quizData.map((session) => (
                  <Card key={session.sessionId}>
                    <CardHeader>
                      <div 
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedQuizSession(
                          expandedQuizSession === session.sessionId ? null : session.sessionId
                        )}
                      >
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                            {session.sessionName}
                          </h4>
                          <p className="text-sm text-gray-500">
                            {session.courseName} • {session.sessionDate}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className={`text-xl font-bold ${
                              session.score >= 80 ? 'text-blue-600' : 
                              session.score >= 60 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {session.score}%
                            </p>
                            <p className="text-xs text-gray-500">
                              {session.correctAnswers}/{session.totalQuestions} correct
                            </p>
                          </div>
                          <Badge variant={expandedQuizSession === session.sessionId ? 'primary' : 'default'}>
                            {expandedQuizSession === session.sessionId ? 'Hide Details' : 'Show Details'}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    
                    {expandedQuizSession === session.sessionId && (
                      <CardContent>
                        <div className="space-y-3">
                          {session.questionDetails.map((q, idx) => (
                            <div 
                              key={q.questionId || idx}
                              className={`p-3 rounded-lg border-l-4 ${
                                q.isCorrect 
                                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500' 
                                  : q.yourAnswer === null
                                    ? 'bg-gray-50 dark:bg-gray-800 border-gray-300'
                                    : 'bg-red-50 dark:bg-red-900/20 border-red-500'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-700 dark:text-gray-300">
                                    Q{idx + 1}:
                                  </span>
                                  <span className="text-gray-600 dark:text-gray-400 text-sm">
                                    {q.question || 'Question text not available'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {q.timeTaken && (
                                    <span className="text-xs text-gray-500">
                                      {q.timeTaken.toFixed(1)}s
                                    </span>
                                  )}
                                  {q.isCorrect ? (
                                    <CheckCircleIcon className="h-5 w-5 text-blue-500" />
                                  ) : q.yourAnswer === null ? (
                                    <span className="text-xs text-gray-400">Not answered</span>
                                  ) : (
                                    <XCircleIcon className="h-5 w-5 text-red-500" />
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Session History Tab */}
          {activeTab === 'history' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Session History
                </h3>
              </CardHeader>
              <CardContent>
                {sessionHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <BookOpenIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No session history found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sessionHistory.map((session) => (
                      <div 
                        key={session.sessionId}
                        className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                              {session.sessionName}
                            </h4>
                            <p className="text-sm text-gray-500">
                              {session.courseName} • {session.instructorName}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {session.sessionDate} at {session.sessionTime}
                            </p>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(session.sessionStatus)}
                            {session.durationMinutes !== null && (
                              <p className="text-sm text-gray-500 mt-2">
                                Attended: {session.durationMinutes} min
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {/* Quiz participation summary */}
                        {session.quizParticipation.totalQuestions > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-500">Quiz:</span>
                              <span className="text-gray-700 dark:text-gray-300">
                                {session.quizParticipation.questionsAnswered}/{session.quizParticipation.totalQuestions} answered
                              </span>
                              <span className="text-blue-600">
                                {session.quizParticipation.correctAnswers} correct
                              </span>
                              {session.quizParticipation.score !== null && (
                                <Badge 
                                  variant={session.quizParticipation.score >= 70 ? 'success' : 'warning'}
                                >
                                  {session.quizParticipation.score}%
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default StudentReports;

