import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  DownloadIcon, 
  MailIcon, 
  ArrowLeftIcon,
  UsersIcon,
  HelpCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  WifiIcon,
  AlertTriangleIcon,
  Loader2Icon,
  CalendarIcon
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { sessionService, SessionReport as SessionReportType } from '../../services/sessionService';
import { toast } from 'sonner';

export const SessionReport = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  
  const [report, setReport] = useState<SessionReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  
  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  useEffect(() => {
    const fetchReport = async () => {
      if (!sessionId) return;
      
      setLoading(true);
      const data = await sessionService.getSessionReport(sessionId);
      setReport(data);
      setLoading(false);
    };

    fetchReport();
  }, [sessionId]);

  const handleDownload = async () => {
    if (!sessionId) return;
    
    setDownloading(true);
    try {
      const filename = `session_report_${sessionId}.pdf`;
      const result = await sessionService.downloadReport(sessionId, filename);
      if (result.success) {
        toast.success(result.error || 'Report downloaded as PDF');
      } else {
        toast.error(result.error || 'Failed to download report');
      }
    } catch (error) {
      toast.error('Failed to download report');
    }
    setDownloading(false);
  };

  const handleSendEmails = async () => {
    if (!sessionId) return;
    
    setSendingEmails(true);
    const result = await sessionService.sendReportEmails(sessionId);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    setSendingEmails(false);
  };

  const getScoreColor = (score: number | undefined) => {
    if (score === undefined) return 'text-gray-500';
    if (score >= 80) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConnectionBadge = (quality: string | undefined) => {
    switch (quality) {
      case 'excellent':
      case 'good':
        return <Badge variant="success" size="sm">{quality}</Badge>;
      case 'fair':
        return <Badge variant="warning" size="sm">{quality}</Badge>;
      case 'poor':
      case 'critical':
        return <Badge variant="danger" size="sm">{quality}</Badge>;
      default:
        return <Badge variant="default" size="sm">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="py-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2Icon className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="py-6">
        <Card className="p-6">
          <div className="text-center py-8">
            <AlertTriangleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Report Not Available
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The session report could not be loaded. This may happen if:
            </p>
            <ul className="text-gray-500 text-sm mb-6 space-y-1">
              <li>• The session has not ended yet</li>
              <li>• You don't have permission to view this report</li>
              <li>• No data was recorded during the session</li>
            </ul>
            <Link to="/dashboard/sessions">
              <Button variant="outline" leftIcon={<ArrowLeftIcon className="h-4 w-4" />}>
                Back to Sessions
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const studentData = report.students[0]; // For student view
  const isPreview = report.reportType === 'preview' || report.sessionStatus === 'upcoming' || report.sessionStatus === 'live';

  return (
    <div className="py-6">
      {/* Preview Banner for sessions not yet ended */}
      {isPreview && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-amber-800 dark:text-amber-200">
                {report.sessionStatus === 'live' ? 'Session In Progress' : 'Session Not Started Yet'}
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {report.message || 'This is a preview report. Full report with all participant data will be available after the instructor ends the session.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <Link 
            to="/dashboard/sessions" 
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-2"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Sessions
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Session Report
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {report.sessionTitle} • {report.sessionDate}
          </p>
          {/* Storage indicator */}
          <div className="flex items-center gap-3 mt-2">
            {report.sessionStatus && (
              <Badge 
                variant={report.sessionStatus === 'completed' ? 'success' : report.sessionStatus === 'live' ? 'primary' : 'warning'} 
                size="sm"
              >
                {report.sessionStatus === 'completed' ? 'Completed' : report.sessionStatus === 'live' ? 'Live' : 'Upcoming'}
              </Badge>
            )}
            {report.generatedAt && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                Generated: {new Date(report.generatedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button
            variant="outline"
            leftIcon={downloading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? 'Downloading...' : 'Download Report'}
          </Button>
          
          {isInstructor && (
            <Button
              variant="primary"
              leftIcon={sendingEmails ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <MailIcon className="h-4 w-4" />}
              onClick={handleSendEmails}
              disabled={sendingEmails}
            >
              {sendingEmails ? 'Sending...' : 'Email to All'}
            </Button>
          )}
        </div>
      </div>

      {/* Session Info Card */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Course</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {report.courseName}
              </p>
              <p className="text-sm text-gray-500">{report.courseCode}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Instructor</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {report.instructorName}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Date & Time</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {report.sessionDate}
              </p>
              <p className="text-sm text-gray-500">{report.sessionTime}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Duration</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {report.sessionDuration}
              </p>
            </div>
          </div>
          
          {/* Actual session times from MongoDB */}
          {(report.actualStartTime || report.actualEndTime) && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Actual Session Times</p>
              <div className="grid grid-cols-2 gap-4">
                {report.actualStartTime && (
                  <div>
                    <p className="text-sm text-gray-500">Started:</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {new Date(report.actualStartTime).toLocaleString()}
                    </p>
                  </div>
                )}
                {report.actualEndTime && (
                  <div>
                    <p className="text-sm text-gray-500">Ended:</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {new Date(report.actualEndTime).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className={`grid grid-cols-1 gap-4 mb-6 ${isInstructor ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {/* Participants - Only for instructors */}
        {isInstructor && (
          <Card className="p-4 text-center">
            <div className="flex justify-center mb-2">
              <UsersIcon className="h-8 w-8 text-blue-500" />
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {report.totalParticipants}
            </p>
            <p className="text-sm text-gray-500">Participants</p>
          </Card>
        )}
        
        <Card className="p-4 text-center">
          <div className="flex justify-center mb-2">
            <HelpCircleIcon className="h-8 w-8 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {report.totalQuestionsAsked}
          </p>
          <p className="text-sm text-gray-500">Questions Asked</p>
        </Card>
        
        <Card className="p-4 text-center">
          <div className="flex justify-center mb-2">
            <CheckCircleIcon className="h-8 w-8 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-blue-600">
            {report.engagementSummary?.highly_engaged || 0}
          </p>
          <p className="text-sm text-gray-500">Highly Engaged</p>
        </Card>
      </div>

      {/* Engagement Summary - Only for instructors */}
      {isInstructor && (
        <Card className="mb-6">
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Engagement Summary
            </h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {report.engagementSummary?.highly_engaged || 0}
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-300">Highly Engaged</p>
              </div>
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                <p className="text-2xl font-bold text-yellow-600">
                  {report.engagementSummary?.moderately_engaged || 0}
                </p>
                <p className="text-sm text-yellow-800 dark:text-yellow-300">Moderately Engaged</p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-600">
                  {report.engagementSummary?.at_risk || 0}
                </p>
                <p className="text-sm text-red-800 dark:text-red-300">At Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructor View: Student Performance Table */}
      {isInstructor && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Student Performance
              </h3>
              <Badge variant="default">
                {report.students.length} Students
              </Badge>
            </div>
          </CardHeader>
          {report.students.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Student
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Questions Attempted
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Correct / Incorrect
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Avg. Response Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Connection
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {report.students.map((student, idx) => (
                    <tr key={student.studentId || idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-4 text-gray-500">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {student.studentName}
                          </p>
                          <p className="text-sm text-gray-500">{student.studentEmail || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-600 dark:text-gray-400">
                        <span className="font-medium">{student.totalQuestions}</span>
                        <span className="text-gray-400 text-sm"> questions</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <CheckCircleIcon className="h-3 w-3 mr-1" />
                            {student.correctAnswers}
                          </span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <XCircleIcon className="h-3 w-3 mr-1" />
                            {student.incorrectAnswers}
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-4 font-semibold ${getScoreColor(student.quizScore)}`}>
                        {student.quizScore !== null && student.quizScore !== undefined 
                          ? `${student.quizScore.toFixed(1)}%` 
                          : 'N/A'}
                      </td>
                      <td className="px-4 py-4 text-gray-600 dark:text-gray-400">
                        {student.averageResponseTime 
                          ? `${student.averageResponseTime.toFixed(1)}s` 
                          : 'N/A'}
                      </td>
                      <td className="px-4 py-4">
                        {getConnectionBadge(student.averageConnectionQuality)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Summary Row */}
              <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    <strong>Total:</strong> {report.students.length} students participated
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-blue-600">
                      <strong>{report.students.reduce((sum, s) => sum + s.correctAnswers, 0)}</strong> correct answers
                    </span>
                    <span className="text-red-600">
                      <strong>{report.students.reduce((sum, s) => sum + s.incorrectAnswers, 0)}</strong> incorrect answers
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <CardContent>
              <div className="text-center py-8">
                <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No students have participated yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Student performance data will appear here after students join and answer questions
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Student View: Personal Quiz Results */}
      {!isInstructor && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Your Session Results
              </h3>
              {studentData && (
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Your Score</p>
                    <p className={`text-2xl font-bold ${getScoreColor(studentData.quizScore)}`}>
                      {studentData.quizScore !== null && studentData.quizScore !== undefined 
                        ? `${studentData.quizScore.toFixed(1)}%` 
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {studentData ? (
              <>
                {/* Personal Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {studentData.totalQuestions}
                    </p>
                    <p className="text-xs text-gray-500">Total Questions</p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                    <p className="text-xl font-bold text-blue-600">{studentData.correctAnswers}</p>
                    <p className="text-xs text-blue-700 dark:text-blue-400">Correct Answers</p>
                  </div>
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                    <p className="text-xl font-bold text-red-600">{studentData.incorrectAnswers}</p>
                    <p className="text-xs text-red-700 dark:text-red-400">Incorrect Answers</p>
                  </div>
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                    <p className="text-xl font-bold text-blue-600">
                      {studentData.averageResponseTime 
                        ? `${studentData.averageResponseTime.toFixed(1)}s` 
                        : 'N/A'}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-400">Avg. Response Time</p>
                  </div>
                </div>

                {/* Quiz Details */}
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Question-by-Question Results
                </h4>
                <div className="space-y-3">
                  {studentData.quizDetails.length > 0 ? (
                    studentData.quizDetails.map((quiz, idx) => (
                      <div 
                        key={quiz.questionId || idx}
                        className={`p-4 rounded-lg border-l-4 ${
                          quiz.isCorrect 
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500' 
                            : 'bg-red-50 dark:bg-red-900/20 border-red-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                Question {idx + 1}
                              </span>
                              {quiz.isCorrect ? (
                                <Badge variant="success" size="sm">
                                  <CheckCircleIcon className="h-3 w-3 mr-1" />
                                  Correct
                                </Badge>
                              ) : (
                                <Badge variant="danger" size="sm">
                                  <XCircleIcon className="h-3 w-3 mr-1" />
                                  Incorrect
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {quiz.question}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-gray-500 text-sm">
                              <ClockIcon className="h-4 w-4" />
                              {quiz.timeTaken ? `${quiz.timeTaken.toFixed(1)}s` : 'N/A'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <HelpCircleIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No quiz questions were answered during this session.</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Your quiz results will appear here after you answer questions
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No participation data found</p>
                <p className="text-sm text-gray-400 mt-1">
                  Your results will appear here after you participate in the session
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Connection Quality Summary (for instructors) */}
      {isInstructor && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <WifiIcon className="h-5 w-5" />
              Connection Quality Summary
            </h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3">
              {['excellent', 'good', 'fair', 'poor', 'critical'].map((quality) => {
                const count = report.connectionQualitySummary?.[quality] || 0;
                const bgColor = quality === 'excellent' || quality === 'good' 
                  ? 'bg-blue-100 dark:bg-blue-900/30' 
                  : quality === 'fair' 
                    ? 'bg-yellow-100 dark:bg-yellow-900/30' 
                    : 'bg-red-100 dark:bg-red-900/30';
                const textColor = quality === 'excellent' || quality === 'good' 
                  ? 'text-blue-700 dark:text-blue-400' 
                  : quality === 'fair' 
                    ? 'text-yellow-700 dark:text-yellow-400' 
                    : 'text-red-700 dark:text-red-400';
                
                return (
                  <div key={quality} className={`p-3 ${bgColor} rounded-lg text-center`}>
                    <p className={`text-xl font-bold ${textColor}`}>{count}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 capitalize">{quality}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

