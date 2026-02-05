import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  SearchIcon,
  DownloadIcon,
  FileTextIcon,
  CalendarIcon,
  BookOpenIcon,
  UsersIcon,
  Loader2Icon,
  FilterIcon,
  EyeIcon,
  DatabaseIcon,
  RefreshCwIcon
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { sessionService, Session, SessionReport } from '../../services/sessionService';
import { toast } from 'sonner';

export const SessionReports = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [storedReports, setStoredReports] = useState<SessionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'sessions' | 'stored'>('sessions');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    // Load sessions
    const allSessions = await sessionService.getAllSessions();
    setSessions(allSessions);
    
    // Load stored reports from MongoDB
    const { reports } = await sessionService.getAllReports();
    setStoredReports(reports);
    
    setLoading(false);
  };

  const handleDownload = async (sessionId: string, sessionTitle: string) => {
    setDownloadingId(sessionId);
    try {
      const filename = `report_${sessionTitle.replace(/\s+/g, '_')}.pdf`;
      const result = await sessionService.downloadReport(sessionId, filename);
      if (result.success) {
        toast.success(result.error || 'Report downloaded as PDF');
      } else {
        toast.error(result.error || 'Failed to download report');
      }
    } catch (error) {
      toast.error('Failed to download report');
    }
    setDownloadingId(null);
  };

  const handleViewReport = (sessionId: string) => {
    navigate(`/dashboard/sessions/${sessionId}/report`);
  };

  // Filter sessions
  const filteredSessions = sessions.filter((session) => {
    const matchesSearch = 
      session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.course.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.courseCode.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Sort by date (most recent first)
  const sortedSessions = [...filteredSessions].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // Filter stored reports
  const filteredStoredReports = storedReports.filter((report) => {
    const matchesSearch = 
      report.sessionTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.courseCode.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'live':
        return <Badge variant="danger">Live</Badge>;
      case 'upcoming':
        return <Badge variant="warning">Upcoming</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="py-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2Icon className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Session Reports
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {isInstructor 
            ? 'View and download reports for all your sessions' 
            : 'View and download your session reports'}
        </p>
      </div>

      {/* View Mode Toggle & Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          {/* View Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={viewMode === 'sessions' ? 'primary' : 'outline'}
              size="sm"
              leftIcon={<CalendarIcon className="h-4 w-4" />}
              onClick={() => setViewMode('sessions')}
            >
              All Sessions
            </Button>
            <Button
              variant={viewMode === 'stored' ? 'primary' : 'outline'}
              size="sm"
              leftIcon={<DatabaseIcon className="h-4 w-4" />}
              onClick={() => setViewMode('stored')}
            >
              Stored Reports ({storedReports.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCwIcon className="h-4 w-4" />}
              onClick={loadData}
            >
              Refresh
            </Button>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder={viewMode === 'sessions' ? "Search sessions..." : "Search reports..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Status Filter (only for sessions view) */}
            {viewMode === 'sessions' && (
              <div className="flex items-center gap-2">
                <FilterIcon className="h-5 w-5 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Sessions</option>
                  <option value="completed">Completed</option>
                  <option value="live">Live</option>
                  <option value="upcoming">Upcoming</option>
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sessions List View */}
      {viewMode === 'sessions' && (
        <>
          {sortedSessions.length === 0 ? (
            <Card className="p-12 text-center">
              <FileTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No sessions found
              </h3>
              <p className="text-gray-500">
                {searchTerm || statusFilter !== 'all' 
                  ? 'Try adjusting your search or filter' 
                  : 'Sessions will appear here after you attend them'}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {sortedSessions.map((session) => (
                <Card key={session.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      {/* Session Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {session.title}
                          </h3>
                          {getStatusBadge(session.status)}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <BookOpenIcon className="h-4 w-4" />
                            <span>{session.course}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            <span>{session.date}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <UsersIcon className="h-4 w-4" />
                            <span>{session.instructor}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">{session.duration}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          leftIcon={<EyeIcon className="h-4 w-4" />}
                          onClick={() => handleViewReport(session.id)}
                        >
                          View
                        </Button>
                        <Button
                          variant="primary"
                          leftIcon={
                            downloadingId === session.id 
                              ? <Loader2Icon className="h-4 w-4 animate-spin" /> 
                              : <DownloadIcon className="h-4 w-4" />
                          }
                          onClick={() => handleDownload(session.id, session.title)}
                          disabled={downloadingId === session.id}
                        >
                          {downloadingId === session.id ? 'Downloading...' : 'Download report'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Stored Reports View (from MongoDB) */}
      {viewMode === 'stored' && (
        <>
          {filteredStoredReports.length === 0 ? (
            <Card className="p-12 text-center">
              <DatabaseIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                No stored reports found
              </h3>
              <p className="text-gray-500">
                {searchTerm 
                  ? 'Try adjusting your search' 
                  : 'Reports will be stored after you view them for the first time'}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredStoredReports.map((report) => (
                <Card key={report.id || report.sessionId} className="hover:shadow-md transition-shadow border-l-4 border-blue-500">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      {/* Report Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {report.sessionTitle}
                          </h3>
                          <Badge variant="success" size="sm">
                            <DatabaseIcon className="h-3 w-3 mr-1" />
                            Stored
                          </Badge>
                          <Badge variant="default" size="sm">
                            {report.reportType === 'instructor_full' ? 'Full Report' : 'Personal'}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <BookOpenIcon className="h-4 w-4" />
                            <span>{report.courseName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            <span>{report.sessionDate}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <UsersIcon className="h-4 w-4" />
                            <span>{report.totalParticipants} participants</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600 font-medium">
                              {report.averageQuizScore !== null && report.averageQuizScore !== undefined 
                                ? `${report.averageQuizScore.toFixed(1)}% avg score` 
                                : 'No quiz data'}
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-xs text-gray-400 mt-2">
                          Generated: {new Date(report.generatedAt).toLocaleString()}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          leftIcon={<EyeIcon className="h-4 w-4" />}
                          onClick={() => handleViewReport(report.sessionId)}
                        >
                          View
                        </Button>
                        <Button
                          variant="primary"
                          leftIcon={
                            downloadingId === report.sessionId 
                              ? <Loader2Icon className="h-4 w-4 animate-spin" /> 
                              : <DownloadIcon className="h-4 w-4" />
                          }
                          onClick={() => handleDownload(report.sessionId, report.sessionTitle)}
                          disabled={downloadingId === report.sessionId}
                        >
                          {downloadingId === report.sessionId ? 'Downloading...' : 'Download report'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Summary Stats */}
      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {sessions.length}
              </p>
              <p className="text-sm text-gray-500">Total Sessions</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {storedReports.length}
              </p>
              <p className="text-sm text-gray-500">Stored Reports</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {sessions.filter(s => s.status === 'completed').length}
              </p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {sessions.filter(s => s.status === 'upcoming').length}
              </p>
              <p className="text-sm text-gray-500">Upcoming</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

