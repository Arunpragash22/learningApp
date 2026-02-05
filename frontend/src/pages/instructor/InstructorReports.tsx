import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  FileTextIcon,
  UsersIcon,
  ClockIcon,
  TrendingUpIcon,
  ActivityIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  XCircleIcon,
  Loader2Icon,
  CalendarIcon,
  BookOpenIcon
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { toast } from 'sonner';

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Types
interface SessionSummary {
  sessionId: string;
  sessionName: string;
  courseName: string;
  courseCode: string;
  date: string;
  time: string;
  duration: string;
  status: string;
  totalStudentsJoined: number;
}

interface AttendanceRecord {
  studentId: string;
  studentName: string;
  studentEmail: string;
  joinTime: string | null;
  leaveTime: string | null;
  durationMinutes: number | null;
  status: string;
}

interface QuizPerformance {
  studentId: string;
  studentName: string;
  studentEmail: string;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  unanswered: number;
  score: number;
  averageResponseTime: number | null;
}

interface EngagementData {
  studentId: string;
  studentName: string;
  studentEmail: string;
  quizInteractions: number;
  questionsAnswered: number;
  attendanceDuration: number | null;
  connectionQuality: string;
  engagementLevel: string;
}

// Type for stored reports
interface StoredReport {
  reportId: string;
  sessionId: string;
  sessionTitle: string;
  courseName: string;
  courseCode?: string;
  sessionDate: string;
  totalParticipants: number;
  totalQuestionsAsked: number;
  averageQuizScore: number | null;
  generatedAt: string;
  engagementSummary?: {
    highEngagement?: number;
    mediumEngagement?: number;
    lowEngagement?: number;
  };
}

// Type for full report details
interface FullReportData {
  sessionId: string;
  sessionTitle: string;
  courseName: string;
  courseCode: string;
  instructorName: string;
  sessionDate: string;
  sessionTime: string;
  sessionDuration: string;
  totalParticipants: number;
  totalQuestionsAsked: number;
  averageQuizScore: number | null;
  engagementSummary: Record<string, number>;
  connectionQualitySummary: Record<string, number>;
  generatedAt: string;
  students: {
    studentId: string;
    studentName: string;
    studentEmail?: string;
    joinedAt?: string;
    leftAt?: string;
    attendanceDuration?: number;
    totalQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    quizScore?: number;
    averageResponseTime?: number;
    averageConnectionQuality?: string;
  }[];
}

export const InstructorReports = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'stored' | 'sessions' | 'attendance' | 'quiz' | 'engagement' | 'mysql-sync'>('stored');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<any>(null);
  
  // Data states
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [storedReports, setStoredReports] = useState<StoredReport[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedFullReport, setSelectedFullReport] = useState<FullReportData | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [quizData, setQuizData] = useState<QuizPerformance[]>([]);
  const [engagementData, setEngagementData] = useState<EngagementData[]>([]);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  
  // Dashboard stats
  const [dashboardStats, setDashboardStats] = useState<any>(null);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
    fetchDashboardStats();
    fetchStoredReports();
  }, []);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${sessionStorage.getItem('access_token') || ''}`,
    'Content-Type': 'application/json'
  });

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/instructor/reports/dashboard-stats`, {
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

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/instructor/reports/sessions`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      } else {
        toast.error('Failed to fetch sessions');
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      toast.error('Failed to fetch sessions');
    }
    setLoading(false);
  };

  // Fetch stored reports from MongoDB
  const fetchStoredReports = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/instructor/reports/stored-reports`, {
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

  // Fetch FULL stored report from MongoDB for a specific session
  const fetchFullStoredReport = async (sessionId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/instructor/reports/sessions/${sessionId}/full-report`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.students) {
          setSelectedFullReport(data as FullReportData);
          toast.success(`Report loaded: ${data.totalParticipants} participants`);
        } else {
          setSelectedFullReport(null);
          toast.info(data.message || 'No stored report found');
        }
      } else {
        setSelectedFullReport(null);
        toast.error('Failed to load report');
      }
    } catch (err) {
      console.error('Failed to fetch full report:', err);
      setSelectedFullReport(null);
      toast.error('Failed to load report');
    }
    setLoading(false);
  };

  const fetchAttendance = async (sessionId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/instructor/reports/sessions/${sessionId}/attendance`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setAttendanceData(data.attendance || []);
        setSessionInfo({ name: data.sessionName, date: data.sessionDate });
      }
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
    }
    setLoading(false);
  };

  const fetchQuizPerformance = async (sessionId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/instructor/reports/sessions/${sessionId}/quiz-performance`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setQuizData(data.studentPerformance || []);
        setSessionInfo({ 
          name: data.sessionName, 
          totalQuestions: data.totalQuestions,
          classAverage: data.classAverageScore 
        });
      }
    } catch (err) {
      console.error('Failed to fetch quiz performance:', err);
    }
    setLoading(false);
  };

  const fetchEngagement = async (sessionId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/instructor/reports/sessions/${sessionId}/engagement`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setEngagementData(data.studentEngagement || []);
        setSessionInfo({ 
          name: data.sessionName,
          engagementSummary: data.engagementSummary
        });
      }
    } catch (err) {
      console.error('Failed to fetch engagement:', err);
    }
    setLoading(false);
  };

  const handleSessionSelect = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    if (activeTab === 'attendance') {
      fetchAttendance(sessionId);
    } else if (activeTab === 'quiz') {
      fetchQuizPerformance(sessionId);
    } else if (activeTab === 'engagement') {
      fetchEngagement(sessionId);
    }
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (selectedSessionId) {
      if (tab === 'attendance') {
        fetchAttendance(selectedSessionId);
      } else if (tab === 'quiz') {
        fetchQuizPerformance(selectedSessionId);
      } else if (tab === 'engagement') {
        fetchEngagement(selectedSessionId);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'live':
        return <Badge variant="info">Live</Badge>;
      default:
        return <Badge variant="warning">Upcoming</Badge>;
    }
  };

  const getEngagementBadge = (level: string) => {
    switch (level) {
      case 'High':
        return <Badge variant="success">High</Badge>;
      case 'Medium':
        return <Badge variant="warning">Medium</Badge>;
      default:
        return <Badge variant="danger">Low</Badge>;
    }
  };

  // ============ DOWNLOAD FUNCTIONS ============
  
  // Helper to trigger CSV download
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

  // Download Session Summary as CSV
  const downloadSessionSummary = () => {
    if (sessions.length === 0) {
      toast.error('No sessions to download');
      return;
    }
    
    const headers = ['Session Name', 'Course', 'Course Code', 'Date', 'Time', 'Duration', 'Status', 'Students Joined'];
    const rows = sessions.map(s => [
      s.sessionName,
      s.courseName,
      s.courseCode,
      s.date,
      s.time,
      s.duration,
      s.status,
      s.totalStudentsJoined.toString()
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    downloadCSV(`session_summary_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    toast.success('Session summary downloaded!');
  };

  // Download Attendance Report as CSV
  const downloadAttendanceReport = () => {
    if (attendanceData.length === 0) {
      toast.error('No attendance data to download');
      return;
    }
    
    const headers = ['#', 'Student Name', 'Email', 'Join Time', 'Leave Time', 'Duration (min)', 'Status'];
    const rows = attendanceData.map((r, idx) => [
      (idx + 1).toString(),
      r.studentName,
      r.studentEmail || 'N/A',
      r.joinTime ? new Date(r.joinTime).toLocaleString() : 'N/A',
      r.leaveTime ? new Date(r.leaveTime).toLocaleString() : 'Still in session',
      r.durationMinutes !== null ? r.durationMinutes.toString() : 'N/A',
      r.status
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const sessionName = sessionInfo?.name || 'session';
    downloadCSV(`attendance_${sessionName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    toast.success('Attendance report downloaded!');
  };

  // Download Quiz Performance as CSV
  const downloadQuizPerformance = () => {
    if (quizData.length === 0) {
      toast.error('No quiz data to download');
      return;
    }
    
    const headers = ['#', 'Student Name', 'Email', 'Total Questions', 'Correct', 'Incorrect', 'Unanswered', 'Score (%)', 'Avg Response Time (s)'];
    const rows = quizData.map((r, idx) => [
      (idx + 1).toString(),
      r.studentName,
      r.studentEmail || 'N/A',
      r.totalQuestions.toString(),
      r.correctAnswers.toString(),
      r.incorrectAnswers.toString(),
      r.unanswered.toString(),
      r.score.toString(),
      r.averageResponseTime !== null ? r.averageResponseTime.toString() : 'N/A'
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const sessionName = sessionInfo?.name || 'session';
    downloadCSV(`quiz_performance_${sessionName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    toast.success('Quiz performance report downloaded!');
  };

  // Download Engagement Report as CSV
  const downloadEngagementReport = () => {
    if (engagementData.length === 0) {
      toast.error('No engagement data to download');
      return;
    }
    
    const headers = ['#', 'Student Name', 'Email', 'Questions Answered', 'Attendance (min)', 'Connection Quality', 'Engagement Level'];
    const rows = engagementData.map((r, idx) => [
      (idx + 1).toString(),
      r.studentName,
      r.studentEmail || 'N/A',
      r.questionsAnswered.toString(),
      r.attendanceDuration !== null ? r.attendanceDuration.toString() : 'N/A',
      r.connectionQuality || 'Unknown',
      r.engagementLevel
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const sessionName = sessionInfo?.name || 'session';
    downloadCSV(`engagement_${sessionName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`, csvContent);
    toast.success('Engagement report downloaded!');
  };

  // Download current tab's data
  const handleDownload = () => {
    setDownloading(true);
    try {
      if (activeTab === 'sessions') {
        downloadSessionSummary();
      } else if (activeTab === 'attendance') {
        downloadAttendanceReport();
      } else if (activeTab === 'quiz') {
        downloadQuizPerformance();
      } else if (activeTab === 'engagement') {
        downloadEngagementReport();
      }
    } catch (err) {
      toast.error('Failed to download report');
    }
    setDownloading(false);
  };

  // Download FULL report for a specific session (all data: attendance + quiz + engagement)
  const downloadFullSessionReport = async (sessionId: string, sessionName: string) => {
    setDownloading(true);
    toast.info(`Generating report for ${sessionName}...`);
    
    try {
      // Fetch all data for this session
      const [attendanceRes, quizRes, engagementRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/instructor/reports/sessions/${sessionId}/attendance`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/api/instructor/reports/sessions/${sessionId}/quiz-performance`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/api/instructor/reports/sessions/${sessionId}/engagement`, { headers: getAuthHeaders() })
      ]);

      const attendanceJson = attendanceRes.ok ? await attendanceRes.json() : { attendance: [] };
      const quizJson = quizRes.ok ? await quizRes.json() : { studentPerformance: [] };
      const engagementJson = engagementRes.ok ? await engagementRes.json() : { studentEngagement: [] };

      // Build comprehensive CSV
      let csvContent = '';
      
      // Session Header
      csvContent += `SESSION REPORT: ${sessionName}\n`;
      csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;
      
      // Attendance Section
      csvContent += `=== ATTENDANCE REPORT ===\n`;
      csvContent += `Total Students: ${attendanceJson.attendance?.length || 0}\n\n`;
      csvContent += `#,Student Name,Email,Join Time,Leave Time,Duration (min),Status\n`;
      (attendanceJson.attendance || []).forEach((r: any, idx: number) => {
        csvContent += `${idx + 1},"${r.studentName}","${r.studentEmail || 'N/A'}","${r.joinTime ? new Date(r.joinTime).toLocaleString() : 'N/A'}","${r.leaveTime ? new Date(r.leaveTime).toLocaleString() : 'Still in session'}","${r.durationMinutes !== null ? r.durationMinutes : 'N/A'}","${r.status}"\n`;
      });
      
      csvContent += `\n\n`;
      
      // Quiz Performance Section
      csvContent += `=== QUIZ PERFORMANCE REPORT ===\n`;
      csvContent += `Class Average: ${quizJson.classAverageScore || 'N/A'}%\n`;
      csvContent += `Total Questions: ${quizJson.totalQuestions || 0}\n\n`;
      csvContent += `#,Student Name,Email,Total Questions,Correct,Incorrect,Score (%),Avg Response Time (s)\n`;
      (quizJson.studentPerformance || []).forEach((r: any, idx: number) => {
        csvContent += `${idx + 1},"${r.studentName}","${r.studentEmail || 'N/A'}","${r.totalQuestions}","${r.correctAnswers}","${r.incorrectAnswers}","${r.score}","${r.averageResponseTime !== null ? r.averageResponseTime : 'N/A'}"\n`;
      });
      
      csvContent += `\n\n`;
      
      // Engagement Section
      csvContent += `=== ENGAGEMENT REPORT ===\n`;
      const engSummary = engagementJson.engagementSummary || {};
      csvContent += `High Engagement: ${engSummary.highEngagement || 0}, Medium: ${engSummary.mediumEngagement || 0}, Low: ${engSummary.lowEngagement || 0}\n\n`;
      csvContent += `#,Student Name,Email,Questions Answered,Attendance (min),Connection Quality,Engagement Level\n`;
      (engagementJson.studentEngagement || []).forEach((r: any, idx: number) => {
        csvContent += `${idx + 1},"${r.studentName}","${r.studentEmail || 'N/A'}","${r.questionsAnswered}","${r.attendanceDuration !== null ? r.attendanceDuration : 'N/A'}","${r.connectionQuality || 'Unknown'}","${r.engagementLevel}"\n`;
      });

      // Download
      const filename = `full_report_${sessionName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(filename, csvContent);
      toast.success(`Report downloaded: ${filename}`);
      
    } catch (err) {
      console.error('Failed to download full report:', err);
      toast.error('Failed to download session report');
    }
    
    setDownloading(false);
  };

  // ============================================================
  // MYSQL SYNC FUNCTIONS
  // ============================================================
  const syncToMySQL = async (collection: 'all' | 'users' | 'questions' | 'quiz-answers' | 'reports') => {
    setSyncing(true);
    setSyncResults(null);
    
    const endpoints: Record<string, string> = {
      'all': '/api/admin/mysql-sync/sync-all',
      'users': '/api/admin/mysql-sync/sync-users',
      'courses': '/api/admin/mysql-sync/sync-courses',
      'questions': '/api/admin/mysql-sync/sync-questions',
      'quiz-answers': '/api/admin/mysql-sync/sync-quiz-answers',
      'reports': '/api/admin/mysql-sync/sync-all-reports'
    };
    
    toast.info(`Syncing ${collection} to MySQL...`);
    
    try {
      const res = await fetch(`${API_BASE_URL}${endpoints[collection]}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      
      if (res.ok) {
        const data = await res.json();
        setSyncResults(data);
        toast.success(`✅ ${collection} synced successfully!`);
      } else {
        const error = await res.text();
        toast.error(`Failed to sync: ${error}`);
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Failed to sync to MySQL');
    }
    
    setSyncing(false);
  };

  const checkSyncStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/mysql-sync/status`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSyncResults(data);
      }
    } catch (err) {
      console.error('Failed to check sync status:', err);
    }
    setLoading(false);
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Instructor Reports
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            View detailed reports for your sessions
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
            onClick={() => {
              fetchSessions();
              fetchDashboardStats();
            }}
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
              {dashboardStats.totalSessions}
            </p>
            <p className="text-sm text-gray-500">Total Sessions</p>
          </Card>
          <Card className="p-4 text-center">
            <UsersIcon className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dashboardStats.totalParticipants}
            </p>
            <p className="text-sm text-gray-500">Total Participants</p>
          </Card>
          <Card className="p-4 text-center">
            <FileTextIcon className="h-8 w-8 text-purple-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dashboardStats.totalQuestionsAsked}
            </p>
            <p className="text-sm text-gray-500">Questions Asked</p>
          </Card>
          <Card className="p-4 text-center">
            <TrendingUpIcon className="h-8 w-8 text-orange-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dashboardStats.averageQuizScore}%
            </p>
            <p className="text-sm text-gray-500">Avg. Quiz Score</p>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {[
          { id: 'stored', label: 'Stored Reports', icon: FileTextIcon },
          { id: 'sessions', label: 'Session Summary', icon: BookOpenIcon },
          { id: 'attendance', label: 'Attendance', icon: ClockIcon },
          { id: 'quiz', label: 'Quiz Performance', icon: FileTextIcon },
          { id: 'engagement', label: 'Engagement', icon: ActivityIcon },
          { id: 'mysql-sync', label: 'MySQL Backup', icon: RefreshCwIcon }
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
      {/* STORED REPORTS TAB - Full width, shows all MongoDB stored reports */}
      {activeTab === 'stored' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                📦 Stored Reports (MongoDB)
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
              These reports are automatically generated and stored in MongoDB when you end a session.
            </p>
          </CardHeader>
          <CardContent>
            {storedReports.length === 0 ? (
              <div className="text-center py-12">
                <FileTextIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No stored reports yet</p>
                <p className="text-gray-400 text-sm mt-2">
                  Reports are automatically generated when you end a session
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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Participants</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Questions</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Avg Score</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Generated</th>
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
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <UsersIcon className="h-4 w-4 text-blue-500" />
                            <span className="text-gray-700 dark:text-gray-300">{report.totalParticipants}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                          {report.totalQuestionsAsked}
                        </td>
                        <td className="px-4 py-3">
                          {report.averageQuizScore !== null ? (
                            <Badge variant={report.averageQuizScore >= 70 ? 'success' : report.averageQuizScore >= 50 ? 'warning' : 'danger'}>
                              {report.averageQuizScore}%
                            </Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(report.generatedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              leftIcon={<FileTextIcon className="h-3 w-3" />}
                              onClick={() => fetchFullStoredReport(report.sessionId)}
                              disabled={loading}
                            >
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<DownloadIcon className="h-3 w-3" />}
                              onClick={() => downloadFullSessionReport(report.sessionId, report.sessionTitle)}
                              disabled={downloading}
                            >
                              Download
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Full Report Details - Shows when a report is selected */}
            {selectedFullReport && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    📊 Full Report: {selectedFullReport.sessionTitle}
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedFullReport(null)}
                  >
                    Close
                  </Button>
                </div>
                
                {/* Report Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-center">
                    <UsersIcon className="h-6 w-6 text-blue-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{selectedFullReport.totalParticipants}</p>
                    <p className="text-xs text-gray-500">Participants</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg text-center">
                    <FileTextIcon className="h-6 w-6 text-purple-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{selectedFullReport.totalQuestionsAsked}</p>
                    <p className="text-xs text-gray-500">Questions</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-center">
                    <TrendingUpIcon className="h-6 w-6 text-blue-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                      {selectedFullReport.averageQuizScore !== null ? `${selectedFullReport.averageQuizScore}%` : '-'}
                    </p>
                    <p className="text-xs text-gray-500">Avg Score</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg text-center">
                    <CalendarIcon className="h-6 w-6 text-orange-500 mx-auto mb-1" />
                    <p className="text-sm font-bold text-orange-700 dark:text-orange-300">{selectedFullReport.sessionDate}</p>
                    <p className="text-xs text-gray-500">{selectedFullReport.sessionTime}</p>
                  </div>
                </div>

                {/* All Students Table */}
                <h5 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  👥 All Students ({selectedFullReport.students?.length || 0})
                </h5>
                {selectedFullReport.students && selectedFullReport.students.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-800">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">#</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Name</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Email</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Join Time</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Duration</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Questions</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Correct</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Score</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Connection</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {selectedFullReport.students.map((student, idx) => (
                          <tr key={student.studentId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                              {student.studentName}
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs">{student.studentEmail || '-'}</td>
                            <td className="px-3 py-2 text-gray-500 text-xs">
                              {student.joinedAt ? new Date(student.joinedAt).toLocaleTimeString() : '-'}
                            </td>
                            <td className="px-3 py-2 text-gray-600">
                              {student.attendanceDuration !== undefined ? `${student.attendanceDuration} min` : '-'}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{student.totalQuestions}</td>
                            <td className="px-3 py-2">
                              <span className="text-blue-600 font-medium">{student.correctAnswers}</span>
                              <span className="text-gray-400"> / </span>
                              <span className="text-red-600">{student.incorrectAnswers}</span>
                            </td>
                            <td className="px-3 py-2">
                              {student.quizScore !== undefined && student.quizScore !== null ? (
                                <Badge variant={student.quizScore >= 70 ? 'success' : student.quizScore >= 50 ? 'warning' : 'danger'}>
                                  {student.quizScore.toFixed(1)}%
                                </Badge>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {student.averageConnectionQuality || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <UsersIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p>No student data found in this report</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* OTHER TABS - Need session selection */}
      {activeTab !== 'stored' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Session List (Left sidebar) */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  Select Session
                </h3>
              </CardHeader>
              <CardContent className="max-h-[500px] overflow-y-auto">
                {loading && sessions.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2Icon className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : sessions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No sessions found</p>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div
                        key={session.sessionId}
                        className={`p-3 rounded-lg border transition-colors ${
                          selectedSessionId === session.sessionId
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <button
                          onClick={() => handleSessionSelect(session.sessionId)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
                              {session.sessionName}
                            </span>
                            {getStatusBadge(session.status)}
                          </div>
                          <p className="text-xs text-gray-500">{session.courseName}</p>
                          <p className="text-xs text-gray-400">{session.date}</p>
                          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                            <UsersIcon className="h-3 w-3" />
                            {session.totalStudentsJoined} students
                          </div>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFullSessionReport(session.sessionId, session.sessionName);
                          }}
                          className="mt-2 w-full flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-700 py-1 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          disabled={downloading}
                        >
                          <DownloadIcon className="h-3 w-3" />
                          Download Report
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Report Content (Right side) */}
          <div className="lg:col-span-3">
            {activeTab === 'sessions' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Session Summary Report
                </h3>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Session</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Course</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Duration</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Students</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {sessions.map((session) => (
                        <tr key={session.sessionId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                            {session.sessionName}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {session.courseName}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {session.date}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {session.duration}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {session.totalStudentsJoined}
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(session.status)}
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<DownloadIcon className="h-3 w-3" />}
                              onClick={() => downloadFullSessionReport(session.sessionId, session.sessionName)}
                              disabled={downloading}
                            >
                              Download
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'attendance' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Attendance Report
                    {sessionInfo && <span className="text-sm font-normal text-gray-500 ml-2">- {sessionInfo.name}</span>}
                  </h3>
                  <Badge variant="default">{attendanceData.length} Students</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {!selectedSessionId ? (
                  <div className="text-center py-8 text-gray-500">
                    <ClockIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Select a session to view attendance report</p>
                  </div>
                ) : loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2Icon className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Join Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Leave Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {attendanceData.map((record, idx) => (
                          <tr key={record.studentId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                              {record.studentName}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.studentEmail || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.joinTime ? new Date(record.joinTime).toLocaleTimeString() : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.leaveTime ? new Date(record.leaveTime).toLocaleTimeString() : 'Still in session'}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.durationMinutes !== null ? `${record.durationMinutes} min` : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {attendanceData.length === 0 && (
                      <p className="text-center py-8 text-gray-500">No attendance data for this session</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'quiz' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Quiz Performance Report
                    {sessionInfo && <span className="text-sm font-normal text-gray-500 ml-2">- {sessionInfo.name}</span>}
                  </h3>
                  {sessionInfo?.classAverage !== undefined && (
                    <Badge variant="info">Class Avg: {sessionInfo.classAverage}%</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedSessionId ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileTextIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Select a session to view quiz performance</p>
                  </div>
                ) : loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2Icon className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Questions</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Correct</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Incorrect</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Score</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Avg. Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {quizData.map((record, idx) => (
                          <tr key={record.studentId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">{record.studentName}</p>
                                <p className="text-xs text-gray-500">{record.studentEmail}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.totalQuestions}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-blue-600">
                                <CheckCircleIcon className="h-4 w-4" />
                                {record.correctAnswers}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-red-600">
                                <XCircleIcon className="h-4 w-4" />
                                {record.incorrectAnswers}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-semibold ${
                                record.score >= 80 ? 'text-blue-600' : 
                                record.score >= 60 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {record.score}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.averageResponseTime ? `${record.averageResponseTime}s` : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {quizData.length === 0 && (
                      <p className="text-center py-8 text-gray-500">No quiz data for this session</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'engagement' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Engagement Activity Report
                    {sessionInfo && <span className="text-sm font-normal text-gray-500 ml-2">- {sessionInfo.name}</span>}
                  </h3>
                  {sessionInfo?.engagementSummary && (
                    <div className="flex gap-2">
                      <Badge variant="success">{sessionInfo.engagementSummary.highEngagement} High</Badge>
                      <Badge variant="warning">{sessionInfo.engagementSummary.mediumEngagement} Medium</Badge>
                      <Badge variant="danger">{sessionInfo.engagementSummary.lowEngagement} Low</Badge>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedSessionId ? (
                  <div className="text-center py-8 text-gray-500">
                    <ActivityIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Select a session to view engagement report</p>
                  </div>
                ) : loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2Icon className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Questions Answered</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Attendance</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Connection</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Engagement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {engagementData.map((record, idx) => (
                          <tr key={record.studentId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">{record.studentName}</p>
                                <p className="text-xs text-gray-500">{record.studentEmail}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.questionsAnswered}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                              {record.attendanceDuration !== null ? `${record.attendanceDuration} min` : 'N/A'}
                            </td>
                            <td className="px-4 py-3">
                              <Badge 
                                variant={
                                  record.connectionQuality === 'excellent' || record.connectionQuality === 'good' 
                                    ? 'success' 
                                    : record.connectionQuality === 'fair' 
                                      ? 'warning' 
                                      : 'default'
                                }
                              >
                                {record.connectionQuality || 'Unknown'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {getEngagementBadge(record.engagementLevel)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {engagementData.length === 0 && (
                      <p className="text-center py-8 text-gray-500">No engagement data for this session</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          </div>
        </div>
      )}

      {/* MySQL SYNC TAB */}
      {activeTab === 'mysql-sync' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                🗄️ MySQL Backup Sync
              </h3>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCwIcon className="h-4 w-4" />}
                onClick={checkSyncStatus}
                disabled={loading}
              >
                Check Status
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Sync MongoDB data to MySQL backup database for reporting and auditing.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {/* Sync All Button */}
              <Card className="p-4 border-2 border-blue-200 dark:border-blue-800">
                <div className="text-center">
                  <RefreshCwIcon className="h-10 w-10 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Sync All</h4>
                  <p className="text-xs text-gray-500 mb-3">Users, Questions, Quiz Answers, Reports</p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => syncToMySQL('all')}
                    disabled={syncing}
                    leftIcon={syncing ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <RefreshCwIcon className="h-4 w-4" />}
                  >
                    {syncing ? 'Syncing...' : 'Sync All'}
                  </Button>
                </div>
              </Card>

              {/* Sync Users */}
              <Card className="p-4">
                <div className="text-center">
                  <UsersIcon className="h-10 w-10 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Users</h4>
                  <p className="text-xs text-gray-500 mb-3">Students & Instructors</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncToMySQL('users')}
                    disabled={syncing}
                  >
                    Sync Users
                  </Button>
                </div>
              </Card>

              {/* Sync Courses */}
              <Card className="p-4">
                <div className="text-center">
                  <BookOpenIcon className="h-10 w-10 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Courses</h4>
                  <p className="text-xs text-gray-500 mb-3">Course Details</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncToMySQL('courses')}
                    disabled={syncing}
                  >
                    Sync Courses
                  </Button>
                </div>
              </Card>

              {/* Sync Questions */}
              <Card className="p-4">
                <div className="text-center">
                  <FileTextIcon className="h-10 w-10 text-purple-500 mx-auto mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Questions</h4>
                  <p className="text-xs text-gray-500 mb-3">Question Bank</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncToMySQL('questions')}
                    disabled={syncing}
                  >
                    Sync Questions
                  </Button>
                </div>
              </Card>

              {/* Sync Quiz Answers */}
              <Card className="p-4">
                <div className="text-center">
                  <CheckCircleIcon className="h-10 w-10 text-blue-500 mx-auto mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Quiz Answers</h4>
                  <p className="text-xs text-gray-500 mb-3">Student Responses</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncToMySQL('quiz-answers')}
                    disabled={syncing}
                  >
                    Sync Answers
                  </Button>
                </div>
              </Card>

              {/* Sync Reports */}
              <Card className="p-4">
                <div className="text-center">
                  <TrendingUpIcon className="h-10 w-10 text-orange-500 mx-auto mb-2" />
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Session Reports</h4>
                  <p className="text-xs text-gray-500 mb-3">Generated Reports</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncToMySQL('reports')}
                    disabled={syncing}
                  >
                    Sync Reports
                  </Button>
                </div>
              </Card>
            </div>

            {/* Sync Results */}
            {syncResults && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  {syncResults.message ? '✅ Sync Results' : '📊 Sync Status'}
                </h4>
                <pre className="text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
                  {JSON.stringify(syncResults, null, 2)}
                </pre>
              </div>
            )}

            {/* Info Box */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-2">ℹ️ About MySQL Backup</h4>
              <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1">
                <li>• MongoDB is the primary database (source of truth)</li>
                <li>• MySQL is used for backup and structured SQL reporting</li>
                <li>• New data is automatically backed up when created</li>
                <li>• Use sync to backup existing data</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default InstructorReports;

