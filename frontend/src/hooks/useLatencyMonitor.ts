/**
 * useLatencyMonitor Hook
 * ======================
 * 
 * WebRTC-aware connection latency monitoring hook for live Zoom sessions.
 * 
 * Since direct access to Zoom's internal WebRTC statistics is restricted,
 * this hook implements a WebRTC-aware latency monitoring mechanism to assess
 * network quality during live sessions.
 * 
 * The measured latency serves as a proxy indicator of connection quality and
 * is used as a contextual parameter in engagement analysis. By incorporating
 * this metric, the system avoids misclassifying students with poor network
 * conditions as disengaged.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// API base URL - handle VITE_API_URL that already includes /api
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const API_BASE_URL = API_URL?.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'unknown';

export interface LatencyStats {
  avgRtt: number;
  minRtt: number;
  maxRtt: number;
  jitter: number;
  samplesCount: number;
  quality: ConnectionQuality;
  stabilityScore: number;
  isStable: boolean;
}

export interface LatencyMonitorOptions {
  sessionId: string | null;
  studentId?: string;
  studentName?: string;
  userRole?: string; // 'student', 'instructor', 'admin' - only students are stored
  enabled?: boolean;
  pingInterval?: number; // milliseconds between pings
  reportInterval?: number; // milliseconds between reports to server
  maxSamples?: number; // maximum number of samples to keep
  onQualityChange?: (quality: ConnectionQuality, stats: LatencyStats) => void;
}

interface PingResult {
  rtt: number;
  serverTimestamp: number;
  quality: ConnectionQuality;
}

export function useLatencyMonitor(options: LatencyMonitorOptions) {
  const {
    sessionId,
    studentId,
    studentName,
    userRole = 'student', // Default to student if not specified
    enabled = true,
    pingInterval = 3000, // Ping every 3 seconds for near real-time updates
    reportInterval = 5000, // Report to server every 5 seconds for near real-time updates
    maxSamples = 30,
    onQualityChange
  } = options;

  // State
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentRtt, setCurrentRtt] = useState<number | null>(null);
  const [quality, setQuality] = useState<ConnectionQuality>('unknown');
  const [stats, setStats] = useState<LatencyStats>({
    avgRtt: 0,
    minRtt: 0,
    maxRtt: 0,
    jitter: 0,
    samplesCount: 0,
    quality: 'unknown',
    stabilityScore: 100,
    isStable: true
  });
  const [error, setError] = useState<string | null>(null);

  // Refs for intervals and samples
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reportIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const rttSamplesRef = useRef<number[]>([]);
  const lastQualityRef = useRef<ConnectionQuality>('unknown');

  /**
   * Assess connection quality based on RTT
   */
  const assessQuality = useCallback((rtt: number, jitter: number = 0): ConnectionQuality => {
    // Combined assessment based on RTT and jitter
    // Thresholds adjusted for HTTP-based ping (includes HTTP overhead ~100-200ms)
    const rttQuality = rtt < 150 ? 'excellent' : rtt < 300 ? 'good' : rtt < 500 ? 'fair' : rtt < 1000 ? 'poor' : 'critical';
    const jitterQuality = jitter < 30 ? 'excellent' : jitter < 60 ? 'good' : jitter < 100 ? 'fair' : jitter < 200 ? 'poor' : 'critical';
    
    const qualityOrder: ConnectionQuality[] = ['excellent', 'good', 'fair', 'poor', 'critical'];
    const worstIndex = Math.max(qualityOrder.indexOf(rttQuality), qualityOrder.indexOf(jitterQuality));
    
    return qualityOrder[worstIndex];
  }, []);

  /**
   * Calculate jitter from samples
   */
  const calculateJitter = useCallback((samples: number[]): number => {
    if (samples.length < 2) return 0;
    
    let totalDiff = 0;
    for (let i = 1; i < samples.length; i++) {
      totalDiff += Math.abs(samples[i] - samples[i - 1]);
    }
    
    return totalDiff / (samples.length - 1);
  }, []);

  /**
   * Calculate statistics from samples
   */
  const calculateStats = useCallback((samples: number[]): LatencyStats => {
    if (samples.length === 0) {
      return {
        avgRtt: 0,
        minRtt: 0,
        maxRtt: 0,
        jitter: 0,
        samplesCount: 0,
        quality: 'unknown',
        stabilityScore: 100,
        isStable: true
      };
    }

    const avgRtt = samples.reduce((a, b) => a + b, 0) / samples.length;
    const minRtt = Math.min(...samples);
    const maxRtt = Math.max(...samples);
    const jitter = calculateJitter(samples);
    const quality = assessQuality(avgRtt, jitter);

    // Calculate stability score (0-100)
    // Adjusted for HTTP-based measurements (higher baseline latency)
    const rttScore = Math.max(0, 100 - (avgRtt / 10));  // More lenient for HTTP
    const jitterScore = Math.max(0, 100 - jitter);       // More lenient for jitter
    
    // Calculate variance for stability
    const variance = samples.reduce((acc, val) => acc + Math.pow(val - avgRtt, 2), 0) / samples.length;
    const stdDev = Math.sqrt(variance);
    const variabilityScore = Math.max(0, 100 - (stdDev / 2));
    
    const stabilityScore = (rttScore * 0.4 + jitterScore * 0.3 + variabilityScore * 0.3);

    return {
      avgRtt: Math.round(avgRtt * 100) / 100,
      minRtt: Math.round(minRtt * 100) / 100,
      maxRtt: Math.round(maxRtt * 100) / 100,
      jitter: Math.round(jitter * 100) / 100,
      samplesCount: samples.length,
      quality,
      stabilityScore: Math.round(stabilityScore * 100) / 100,
      isStable: stabilityScore >= 70
    };
  }, [assessQuality, calculateJitter]);

  /**
   * Perform a single ping measurement
   */
  const ping = useCallback(async (): Promise<PingResult | null> => {
    if (!sessionId || !studentId) return null;

    const clientTimestamp = performance.now();

    try {
      const response = await fetch(`${API_BASE_URL}/api/latency/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_timestamp: clientTimestamp,
          session_id: sessionId,
          student_id: studentId
        })
      });

      if (!response.ok) {
        throw new Error(`Ping failed: ${response.status}`);
      }

      const data = await response.json();
      const rtt = performance.now() - clientTimestamp;

      return {
        rtt,
        serverTimestamp: data.server_timestamp,
        quality: data.connection_quality as ConnectionQuality
      };
    } catch (err) {
      console.warn('Latency ping failed:', err);
      return null;
    }
  }, [sessionId, studentId]);

  /**
   * Report latency data to server
   */
  const reportToServer = useCallback(async () => {
    if (!sessionId || !studentId) return;

    const samples = rttSamplesRef.current;
    if (samples.length === 0) return;

    const currentStats = calculateStats(samples);

    try {
      await fetch(`${API_BASE_URL}/api/latency/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionId,
          student_id: studentId,
          student_name: studentName || studentId,
          user_role: userRole, // Only students are stored in DB
          rtt_ms: currentStats.avgRtt,
          jitter_ms: currentStats.jitter,
          samples_count: currentStats.samplesCount
        })
      });
    } catch (err) {
      console.warn('Failed to report latency:', err);
    }
  }, [sessionId, studentId, studentName, userRole, calculateStats]);

  /**
   * Start monitoring
   */
  const startMonitoring = useCallback(() => {
    if (!sessionId || !studentId || !enabled) {
      return;
    }

    setIsMonitoring(true);
    setError(null);
    rttSamplesRef.current = [];

    // Start ping interval
    const doPing = async () => {
      const result = await ping();
      
      if (result) {
        // Add sample
        rttSamplesRef.current.push(result.rtt);
        
        // Trim samples if exceeding max
        if (rttSamplesRef.current.length > maxSamples) {
          rttSamplesRef.current = rttSamplesRef.current.slice(-maxSamples);
        }

        // Update state
        setCurrentRtt(result.rtt);
        
        const newStats = calculateStats(rttSamplesRef.current);
        setStats(newStats);
        setQuality(newStats.quality);

        // Notify if quality changed
        if (newStats.quality !== lastQualityRef.current) {
          lastQualityRef.current = newStats.quality;
          onQualityChange?.(newStats.quality, newStats);
        }
      }
    };

    // Initial ping and immediate report so instructor sees student name immediately
    // This ensures network parameters are captured immediately when students join
    doPing().then(() => {
      // Report immediately after first ping (no delay for instant capture)
      reportToServer();
      console.log(`📶 Initial latency report sent immediately for student: ${studentName || studentId}`);
      
      // Also send a second report after 500ms to ensure data is visible
      setTimeout(() => {
        reportToServer();
      }, 500);
    });

    // Set up intervals
    pingIntervalRef.current = setInterval(doPing, pingInterval);
    reportIntervalRef.current = setInterval(reportToServer, reportInterval);

    console.log(`📶 Latency monitoring started for session ${sessionId}, student: ${studentName || studentId}`);
  }, [sessionId, studentId, studentName, enabled, ping, pingInterval, reportInterval, maxSamples, calculateStats, reportToServer, onQualityChange]);

  /**
   * Stop monitoring
   */
  const stopMonitoring = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (reportIntervalRef.current) {
      clearInterval(reportIntervalRef.current);
      reportIntervalRef.current = null;
    }

    // Final report before stopping
    reportToServer();

    setIsMonitoring(false);
    console.log('📶 Latency monitoring stopped');
  }, [reportToServer]);

  /**
   * Manual ping (for testing)
   */
  const manualPing = useCallback(async () => {
    const result = await ping();
    if (result) {
      setCurrentRtt(result.rtt);
      return result;
    }
    return null;
  }, [ping]);

  /**
   * Get connection quality color
   */
  const getQualityColor = useCallback((q: ConnectionQuality): string => {
    switch (q) {
      case 'excellent': return 'text-green-500';
      case 'good': return 'text-green-400';
      case 'fair': return 'text-yellow-500';
      case 'poor': return 'text-orange-500';
      case 'critical': return 'text-red-500';
      default: return 'text-gray-400';
    }
  }, []);

  /**
   * Get connection quality background color
   */
  const getQualityBgColor = useCallback((q: ConnectionQuality): string => {
    switch (q) {
      case 'excellent': return 'bg-green-500';
      case 'good': return 'bg-green-400';
      case 'fair': return 'bg-yellow-500';
      case 'poor': return 'bg-orange-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  }, []);

  /**
   * Check if engagement analysis should be adjusted
   */
  const shouldAdjustEngagement = useCallback((): boolean => {
    return quality === 'poor' || quality === 'critical';
  }, [quality]);

  // Auto-start/stop monitoring based on dependencies
  useEffect(() => {
    if (enabled && sessionId && studentId) {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    return () => {
      stopMonitoring();
    };
  }, [enabled, sessionId, studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // State
    isMonitoring,
    currentRtt,
    quality,
    stats,
    error,
    
    // Actions
    startMonitoring,
    stopMonitoring,
    manualPing,
    
    // Helpers
    getQualityColor,
    getQualityBgColor,
    shouldAdjustEngagement
  };
}

export default useLatencyMonitor;

