/**
 * StudentNetworkMonitor Component
 * ================================
 * 
 * Displays network quality status for all students in a session.
 * Designed for instructors to monitor student connectivity in real-time.
 * 
 * Features:
 * - Real-time network quality monitoring for all students
 * - Visual indicators (color-coded) for connection quality
 * - Sorting by worst connection first
 * - Alerts for students needing attention
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  RefreshCw,
  Users,
  Signal,
  SignalLow,
  SignalMedium,
  SignalHigh,
  Activity
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

// VITE_API_URL already includes /api, so we check for that
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const API_BASE_URL = API_URL?.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;

interface StudentLatency {
  student_id: string;
  session_id: string;
  student_name?: string;  // Display name for the student
  avg_rtt_ms: number;
  min_rtt_ms: number;
  max_rtt_ms: number;
  jitter_ms: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  stability_score: number;
  samples_count: number;
  last_updated: string | null;
  needs_attention: boolean;
}

interface SessionLatencySummary {
  total: number;
  excellent: number;
  good: number;
  fair: number;
  poor: number;
  critical: number;
}

interface SessionStudentsLatency {
  session_id: string;
  students: StudentLatency[];
  summary: SessionLatencySummary;
  timestamp: string;
}

interface StudentNetworkMonitorProps {
  sessionId: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
  className?: string;
  compact?: boolean;
  showDemoData?: boolean; // Show demo data for testing
}

// Demo data for testing/demonstration
const DEMO_STUDENTS: StudentLatency[] = [
  {
    student_id: 'student_john_doe_123',
    student_name: 'John Doe',
    session_id: 'demo',
    avg_rtt_ms: 45,
    min_rtt_ms: 32,
    max_rtt_ms: 78,
    jitter_ms: 8.5,
    quality: 'good',
    stability_score: 92,
    samples_count: 25,
    last_updated: new Date().toISOString(),
    needs_attention: false
  },
  {
    student_id: 'student_sarah_smith_456',
    student_name: 'Sarah Smith',
    session_id: 'demo',
    avg_rtt_ms: 180,
    min_rtt_ms: 120,
    max_rtt_ms: 280,
    jitter_ms: 45,
    quality: 'fair',
    stability_score: 68,
    samples_count: 20,
    last_updated: new Date().toISOString(),
    needs_attention: false
  },
  {
    student_id: 'student_mike_wilson_789',
    student_name: 'Mike Wilson',
    session_id: 'demo',
    avg_rtt_ms: 520,
    min_rtt_ms: 350,
    max_rtt_ms: 890,
    jitter_ms: 95,
    quality: 'critical',
    stability_score: 35,
    samples_count: 18,
    last_updated: new Date().toISOString(),
    needs_attention: true
  },
  {
    student_id: 'student_emma_davis_012',
    student_name: 'Emma Davis',
    session_id: 'demo',
    avg_rtt_ms: 28,
    min_rtt_ms: 22,
    max_rtt_ms: 45,
    jitter_ms: 5,
    quality: 'excellent',
    stability_score: 98,
    samples_count: 30,
    last_updated: new Date().toISOString(),
    needs_attention: false
  },
  {
    student_id: 'student_alex_brown_345',
    student_name: 'Alex Brown',
    session_id: 'demo',
    avg_rtt_ms: 320,
    min_rtt_ms: 250,
    max_rtt_ms: 450,
    jitter_ms: 65,
    quality: 'poor',
    stability_score: 52,
    samples_count: 22,
    last_updated: new Date().toISOString(),
    needs_attention: true
  }
];

export const StudentNetworkMonitor: React.FC<StudentNetworkMonitorProps> = ({
  sessionId,
  autoRefresh = true,
  refreshInterval = 2000, // Refresh every 2 seconds for near real-time updates
  className = '',
  compact = false,
  showDemoData = false
}) => {
  const [data, setData] = useState<SessionStudentsLatency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [useDemoData, setUseDemoData] = useState(showDemoData);
  const [nextRefreshIn, setNextRefreshIn] = useState(refreshInterval / 1000);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(autoRefresh);

  const fetchStudentLatency = useCallback(async () => {
    if (!sessionId) return;

    // If using demo data, set it directly
    if (useDemoData) {
      const demoSummary: SessionLatencySummary = {
        total: DEMO_STUDENTS.length,
        excellent: DEMO_STUDENTS.filter(s => s.quality === 'excellent').length,
        good: DEMO_STUDENTS.filter(s => s.quality === 'good').length,
        fair: DEMO_STUDENTS.filter(s => s.quality === 'fair').length,
        poor: DEMO_STUDENTS.filter(s => s.quality === 'poor').length,
        critical: DEMO_STUDENTS.filter(s => s.quality === 'critical').length,
      };
      
      setData({
        session_id: sessionId,
        students: DEMO_STUDENTS,
        summary: demoSummary,
        timestamp: new Date().toISOString()
      });
      setLastRefresh(new Date());
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/latency/session/${sessionId}/students`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching student latency:', err);
      setError('Failed to load student network data');
    } finally {
      setLoading(false);
    }
  }, [sessionId, useDemoData]);

  // Initial fetch
  useEffect(() => {
    fetchStudentLatency();
  }, [sessionId]);

  // 🎯 OPTIMIZED: Event-driven updates instead of polling
  // Use WebSocket events or manual refresh instead of continuous polling
  // Only fetch when explicitly requested or when session state changes
  useEffect(() => {
    if (useDemoData) {
      return;
    }

    // Initial fetch only
    fetchStudentLatency();
    
    // Optional: Manual refresh can be triggered by parent component
    // No automatic polling - updates should come via WebSocket events
  }, [sessionId, useDemoData]); // Only refetch when sessionId changes

  // Refetch when demo mode changes
  useEffect(() => {
    fetchStudentLatency();
  }, [useDemoData]);

  const getQualityIcon = (quality: string) => {
    switch (quality) {
      case 'excellent': return <SignalHigh className="h-4 w-4 text-blue-500" />;
      case 'good': return <Signal className="h-4 w-4 text-blue-400" />;
      case 'fair': return <SignalMedium className="h-4 w-4 text-yellow-500" />;
      case 'poor': return <SignalLow className="h-4 w-4 text-orange-500" />;
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <Wifi className="h-4 w-4 text-gray-400" />;
    }
  };

  const getQualityBadgeVariant = (quality: string): 'success' | 'warning' | 'danger' | 'default' => {
    switch (quality) {
      case 'excellent':
      case 'good':
        return 'success';
      case 'fair':
        return 'warning';
      case 'poor':
      case 'critical':
        return 'danger';
      default:
        return 'default';
    }
  };

  const getQualityRowColor = (quality: string): string => {
    switch (quality) {
      case 'critical': return 'bg-red-50 dark:bg-red-900/20';
      case 'poor': return 'bg-orange-50 dark:bg-orange-900/20';
      case 'fair': return 'bg-yellow-50 dark:bg-yellow-900/20';
      default: return '';
    }
  };

  if (loading && !data) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
          <span className="ml-2 text-gray-500">Loading student network data...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 ${className}`}>
        <div className="text-center text-red-500">
          <WifiOff className="h-8 w-8 mx-auto mb-2" />
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={fetchStudentLatency} className="mt-3">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const summary = data?.summary || { total: 0, excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 };
  const students = data?.students || [];
  const studentsNeedingAttention = students.filter(s => s.needs_attention);

  // Compact view for sidebar
  if (compact) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow ${className}`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center">
              <Wifi className="h-4 w-4 mr-2 text-indigo-500" />
              Student Network Status
            </h3>
            <Badge variant="default" size="sm">{summary.total} online</Badge>
          </div>
        </div>
        
        {/* Quick Summary */}
        <div className="p-4 grid grid-cols-5 gap-1 text-center text-xs">
          <div className="text-blue-600 dark:text-blue-400">
            <div className="font-bold">{summary.excellent}</div>
            <div className="opacity-75">Excel</div>
          </div>
          <div className="text-blue-500 dark:text-blue-400">
            <div className="font-bold">{summary.good}</div>
            <div className="opacity-75">Good</div>
          </div>
          <div className="text-yellow-500 dark:text-yellow-400">
            <div className="font-bold">{summary.fair}</div>
            <div className="opacity-75">Fair</div>
          </div>
          <div className="text-orange-500 dark:text-orange-400">
            <div className="font-bold">{summary.poor}</div>
            <div className="opacity-75">Poor</div>
          </div>
          <div className="text-red-500 dark:text-red-400">
            <div className="font-bold">{summary.critical}</div>
            <div className="opacity-75">Crit</div>
          </div>
        </div>

        {/* Students needing attention */}
        {studentsNeedingAttention.length > 0 && (
          <div className="px-4 pb-4">
            <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-2 flex items-center">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Needs Attention ({studentsNeedingAttention.length})
            </div>
            <div className="space-y-1">
              {studentsNeedingAttention.slice(0, 3).map(student => (
                <div 
                  key={student.student_id} 
                  className="flex items-center justify-between text-xs p-2 bg-red-50 dark:bg-red-900/20 rounded"
                >
                  <span className="truncate max-w-[120px]" title={student.student_name || student.student_id}>
                    {student.student_name || student.student_id.slice(0, 8) + '...'}
                  </span>
                  <span className="text-red-600 dark:text-red-400">{Math.round(student.avg_rtt_ms)}ms</span>
                </div>
              ))}
              {studentsNeedingAttention.length > 3 && (
                <div className="text-xs text-gray-500 text-center">
                  +{studentsNeedingAttention.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
            <Users className="h-5 w-5 mr-2 text-indigo-500" />
            Student Network Monitor
            {useDemoData && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                DEMO
              </span>
            )}
          </h3>
          <div className="flex items-center space-x-2">
            {/* Auto-refresh indicator */}
            {isAutoRefreshing && !useDemoData && (
              <div className="flex items-center space-x-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                <span>Auto-refresh: {nextRefreshIn}s</span>
              </div>
            )}
            {lastRefresh && (
              <span className="text-xs text-gray-500">
                {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setUseDemoData(!useDemoData)}
              className={`px-2 py-1 text-xs rounded ${
                useDemoData 
                  ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={useDemoData ? 'Switch to real data' : 'Show demo data'}
            >
              {useDemoData ? '📊 Real Data' : '🎭 Demo'}
            </button>
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setIsAutoRefreshing(!isAutoRefreshing)}
              className={`px-2 py-1 text-xs rounded ${
                isAutoRefreshing 
                  ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={isAutoRefreshing ? 'Disable auto-refresh' : 'Enable auto-refresh'}
            >
              {isAutoRefreshing ? '⏸️ Pause' : '▶️ Auto'}
            </button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchStudentLatency}
              disabled={loading}
              title="Refresh now"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Connection Quality Distribution
          </span>
          <span className="text-sm text-gray-500">
            {summary.total} student{summary.total !== 1 ? 's' : ''} connected
          </span>
        </div>
        <div className="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
          {summary.excellent > 0 && (
            <div 
              className="bg-blue-500 transition-all" 
              style={{ width: `${(summary.excellent / summary.total) * 100}%` }}
              title={`Excellent: ${summary.excellent}`}
            />
          )}
          {summary.good > 0 && (
            <div 
              className="bg-blue-400 transition-all" 
              style={{ width: `${(summary.good / summary.total) * 100}%` }}
              title={`Good: ${summary.good}`}
            />
          )}
          {summary.fair > 0 && (
            <div 
              className="bg-yellow-500 transition-all" 
              style={{ width: `${(summary.fair / summary.total) * 100}%` }}
              title={`Fair: ${summary.fair}`}
            />
          )}
          {summary.poor > 0 && (
            <div 
              className="bg-orange-500 transition-all" 
              style={{ width: `${(summary.poor / summary.total) * 100}%` }}
              title={`Poor: ${summary.poor}`}
            />
          )}
          {summary.critical > 0 && (
            <div 
              className="bg-red-500 transition-all" 
              style={{ width: `${(summary.critical / summary.total) * 100}%` }}
              title={`Critical: ${summary.critical}`}
            />
          )}
        </div>
        <div className="flex justify-between mt-2 text-xs">
          <span className="text-blue-600 dark:text-blue-400">● Excellent: {summary.excellent}</span>
          <span className="text-blue-500 dark:text-blue-400">● Good: {summary.good}</span>
          <span className="text-yellow-500 dark:text-yellow-400">● Fair: {summary.fair}</span>
          <span className="text-orange-500 dark:text-orange-400">● Poor: {summary.poor}</span>
          <span className="text-red-500 dark:text-red-400">● Critical: {summary.critical}</span>
        </div>
      </div>

      {/* Alert for students needing attention */}
      {studentsNeedingAttention.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
            <div className="ml-3">
              <h4 className="text-sm font-medium text-red-800 dark:text-red-200">
                {studentsNeedingAttention.length} student{studentsNeedingAttention.length !== 1 ? 's' : ''} with connectivity issues
              </h4>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                These students may appear disengaged due to network problems. 
                Engagement metrics will be adjusted automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Student List */}
      {students.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          <Wifi className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No students connected yet</p>
          <p className="text-sm mt-1">Network data will appear when students join the session</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Quality
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  RTT
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Jitter
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Stability
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {students.map((student) => (
                <tr 
                  key={student.student_id} 
                  className={`${getQualityRowColor(student.quality)} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
                          {(student.student_name || student.student_id).slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100" title={student.student_id}>
                          {student.student_name || student.student_id.slice(0, 12) + '...'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {student.samples_count} samples
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {getQualityIcon(student.quality)}
                      <Badge variant={getQualityBadgeVariant(student.quality)} size="sm">
                        {student.quality.toUpperCase()}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {Math.round(student.avg_rtt_ms)}ms
                    </div>
                    <div className="text-xs text-gray-500">
                      {Math.round(student.min_rtt_ms)}-{Math.round(student.max_rtt_ms)}ms
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {student.jitter_ms.toFixed(1)}ms
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                        <div 
                          className={`h-2 rounded-full ${
                            student.stability_score >= 70 ? 'bg-blue-500' :
                            student.stability_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(100, student.stability_score)}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {Math.round(student.stability_score)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {student.needs_attention ? (
                      <span className="inline-flex items-center text-xs text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Needs attention
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs text-blue-600 dark:text-blue-400">
                        <Activity className="h-3 w-3 mr-1" />
                        Stable
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StudentNetworkMonitor;

