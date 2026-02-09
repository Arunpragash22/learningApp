/**
 * LiveNetworkProgressBars Component
 * ==================================
 * 
 * Displays live, animated progress bars for a student's network metrics.
 * Designed for the instructor's dashboard to show real-time network changes.
 * 
 * Features:
 * - Animated RTT progress bar with smooth transitions
 * - Jitter progress bar with color-coded thresholds
 * - Signal strength indicator (5 bars)
 * - Stability score progress bar with shimmer effect
 * - Trend indicators (improving/degrading/stable)
 * - Mini sparkline showing recent RTT history
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Wifi,
  WifiOff,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Activity,
  Clock,
  Signal,
  SignalLow,
  SignalMedium,
  SignalHigh,
  Zap,
} from 'lucide-react';
import { StabilityHistoryEntry } from './ConnectionStabilityBar';

// ============================================================
// TYPES
// ============================================================

export interface LiveStudentNetworkData {
  student_id: string;
  student_name?: string;
  session_id: string;
  avg_rtt_ms: number;
  min_rtt_ms: number;
  max_rtt_ms: number;
  jitter_ms: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  stability_score: number;
  samples_count: number;
  last_updated: string | null;
  needs_attention: boolean;
  stability_history?: StabilityHistoryEntry[];
  // Trend data (calculated on frontend from history)
  rtt_trend?: 'improving' | 'degrading' | 'stable';
  quality_trend?: 'improving' | 'degrading' | 'stable';
}

interface LiveNetworkProgressBarsProps {
  student: LiveStudentNetworkData;
  isActive?: boolean;
  showSparkline?: boolean;
  className?: string;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const RTT_MAX = 1000; // Max RTT for progress bar scale (ms)
const JITTER_MAX = 200; // Max jitter for progress bar scale (ms)

/**
 * Calculate trend from stability history
 */
export function calculateTrends(history: StabilityHistoryEntry[]): {
  rttTrend: 'improving' | 'degrading' | 'stable';
  qualityTrend: 'improving' | 'degrading' | 'stable';
} {
  if (!history || history.length < 4) {
    return { rttTrend: 'stable', qualityTrend: 'stable' };
  }

  const recent = history.slice(-5);
  const older = history.slice(-10, -5);

  if (older.length === 0) {
    return { rttTrend: 'stable', qualityTrend: 'stable' };
  }

  const recentAvgRtt = recent.reduce((sum, h) => sum + h.rtt_ms, 0) / recent.length;
  const olderAvgRtt = older.reduce((sum, h) => sum + h.rtt_ms, 0) / older.length;

  const rttDiff = recentAvgRtt - olderAvgRtt;
  const rttTrend: 'improving' | 'degrading' | 'stable' =
    rttDiff < -20 ? 'improving' : rttDiff > 20 ? 'degrading' : 'stable';

  const qualityOrder = { excellent: 4, good: 3, fair: 2, poor: 1, critical: 0 };
  const recentAvgQuality =
    recent.reduce((sum, h) => sum + (qualityOrder[h.quality] || 0), 0) / recent.length;
  const olderAvgQuality =
    older.reduce((sum, h) => sum + (qualityOrder[h.quality] || 0), 0) / older.length;

  const qualityDiff = recentAvgQuality - olderAvgQuality;
  const qualityTrend: 'improving' | 'degrading' | 'stable' =
    qualityDiff > 0.3 ? 'improving' : qualityDiff < -0.3 ? 'degrading' : 'stable';

  return { rttTrend, qualityTrend };
}

/**
 * Get color for RTT value
 */
function getRttColor(rtt: number): string {
  if (rtt < 150) return '#3b82f6'; // blue-500
  if (rtt < 300) return '#60a5fa'; // blue-400
  if (rtt < 500) return '#eab308'; // yellow-500
  if (rtt < 1000) return '#f97316'; // orange-500
  return '#ef4444'; // red-500
}

/**
 * Get color for jitter value
 */
function getJitterColor(jitter: number): string {
  if (jitter < 30) return '#3b82f6';
  if (jitter < 60) return '#60a5fa';
  if (jitter < 100) return '#eab308';
  if (jitter < 200) return '#f97316';
  return '#ef4444';
}

/**
 * Get color for quality level
 */
function getQualityColor(quality: string): string {
  switch (quality) {
    case 'excellent': return '#3b82f6';
    case 'good': return '#60a5fa';
    case 'fair': return '#eab308';
    case 'poor': return '#f97316';
    case 'critical': return '#ef4444';
    default: return '#9ca3af';
  }
}

/**
 * Get quality as percentage for progress bar
 */
function qualityToPercent(quality: string): number {
  switch (quality) {
    case 'excellent': return 100;
    case 'good': return 80;
    case 'fair': return 60;
    case 'poor': return 40;
    case 'critical': return 20;
    default: return 0;
  }
}

/**
 * Get CSS class for quality badge background
 */
function getQualityBgClass(quality: string): string {
  switch (quality) {
    case 'excellent': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'good': return 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300';
    case 'fair': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'poor': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-600';
  }
}

// ============================================================
// MINI SPARKLINE COMPONENT
// ============================================================

const MiniSparkline: React.FC<{
  history: StabilityHistoryEntry[];
  width?: number;
  height?: number;
}> = ({ history, width = 120, height = 30 }) => {
  if (!history || history.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-[10px]"
        style={{ width, height }}
      >
        Collecting...
      </div>
    );
  }

  const rttValues = history.map((h) => h.rtt_ms);
  const maxVal = Math.max(...rttValues, 100);
  const minVal = Math.min(...rttValues, 0);
  const range = maxVal - minVal || 1;

  const points = rttValues.map((val, i) => {
    const x = (i / (rttValues.length - 1)) * width;
    const y = height - ((val - minVal) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const lastQuality = history[history.length - 1]?.quality || 'good';
  const strokeColor = getQualityColor(lastQuality);

  // Create gradient area path
  const areaPath = `M0,${height} L${points.join(' L')} L${width},${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Gradient fill under the line */}
      <defs>
        <linearGradient id={`sparkGrad-${lastQuality}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sparkGrad-${lastQuality})`} />
      {/* Main line */}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
      {/* Current value dot */}
      {rttValues.length > 0 && (
        <circle
          cx={width}
          cy={
            height -
            ((rttValues[rttValues.length - 1] - minVal) / range) * (height - 4) -
            2
          }
          r="2.5"
          fill={strokeColor}
          className="animate-pulse"
        />
      )}
    </svg>
  );
};

// ============================================================
// ANIMATED PROGRESS BAR SUB-COMPONENT
// ============================================================

const AnimatedProgressBar: React.FC<{
  value: number;
  max: number;
  color: string;
  label: string;
  displayValue: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  height?: number;
  showShimmer?: boolean;
}> = ({ value, max, color, label, displayValue, icon, isActive = true, height = 8, showShimmer = true }) => {
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(Math.min(100, Math.max(2, (value / max) * 100)));
    }, 50);
    return () => clearTimeout(timer);
  }, [value, max]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[11px] font-medium text-gray-600 dark:text-gray-400">
          {icon}
          <span>{label}</span>
        </div>
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{ color }}
        >
          {displayValue}
        </span>
      </div>
      <div
        className="relative overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        style={{ height: `${height}px` }}
      >
        {/* Main fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${animatedWidth}%`,
            backgroundColor: color,
            transition: 'width 0.8s ease-in-out, background-color 0.6s ease',
          }}
        />
        {/* Active shimmer */}
        {isActive && showShimmer && animatedWidth > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
            style={{ width: `${animatedWidth}%` }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                animation: 'liveBarShimmer 2.5s ease-in-out infinite',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// SIGNAL STRENGTH BARS
// ============================================================

const SignalStrengthBars: React.FC<{
  quality: string;
  isActive?: boolean;
}> = ({ quality, isActive = true }) => {
  const qualityLevel = { excellent: 5, good: 4, fair: 3, poor: 2, critical: 1 }[quality] || 0;
  const color = getQualityColor(quality);

  return (
    <div className="flex items-end gap-[2px]" title={`Signal: ${quality}`}>
      {[1, 2, 3, 4, 5].map((bar) => (
        <div
          key={bar}
          className="rounded-sm transition-all duration-500"
          style={{
            width: '4px',
            height: `${bar * 4 + 2}px`,
            backgroundColor: bar <= qualityLevel ? color : '#d1d5db',
            opacity: bar <= qualityLevel ? 1 : 0.3,
          }}
        />
      ))}
      {isActive && (
        <div
          className="w-1.5 h-1.5 rounded-full ml-1 animate-pulse"
          style={{ backgroundColor: color }}
        />
      )}
    </div>
  );
};

// ============================================================
// TREND INDICATOR
// ============================================================

const TrendIndicator: React.FC<{
  trend: 'improving' | 'degrading' | 'stable';
  size?: number;
}> = ({ trend, size = 12 }) => {
  switch (trend) {
    case 'improving':
      return (
        <span className="inline-flex items-center gap-0.5 text-green-600 dark:text-green-400" title="Improving">
          <TrendingDown style={{ width: size, height: size }} />
          <span className="text-[9px] font-medium">RTT</span>
        </span>
      );
    case 'degrading':
      return (
        <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400" title="Degrading">
          <TrendingUp style={{ width: size, height: size }} />
          <span className="text-[9px] font-medium">RTT</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-0.5 text-gray-400 dark:text-gray-500" title="Stable">
          <Minus style={{ width: size, height: size }} />
        </span>
      );
  }
};

// ============================================================
// MAIN COMPONENT: LiveNetworkProgressBars
// ============================================================

export const LiveNetworkProgressBars: React.FC<LiveNetworkProgressBarsProps> = ({
  student,
  isActive = true,
  showSparkline = true,
  className = '',
}) => {
  const history = student.stability_history || [];

  // Use backend-provided trends when available, otherwise calculate from history
  const { rttTrend, qualityTrend } = useMemo(() => {
    if (student.rtt_trend && student.quality_trend) {
      return { rttTrend: student.rtt_trend, qualityTrend: student.quality_trend };
    }
    return calculateTrends(history);
  }, [student.rtt_trend, student.quality_trend, history]);

  // Time since last update
  const lastUpdatedText = useMemo(() => {
    if (!student.last_updated) return 'Never';
    const diff = Date.now() - new Date(student.last_updated).getTime();
    if (diff < 5000) return 'Just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    return `${Math.floor(diff / 60000)}m ago`;
  }, [student.last_updated]);

  const rttColor = getRttColor(student.avg_rtt_ms);
  const jitterColor = getJitterColor(student.jitter_ms);
  const qualityColor = getQualityColor(student.quality);

  return (
    <div
      className={`relative bg-white dark:bg-gray-800 rounded-xl border transition-all duration-300 ${
        student.needs_attention
          ? 'border-red-300 dark:border-red-700 shadow-red-100 dark:shadow-red-900/20 shadow-md'
          : 'border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md'
      } ${className}`}
    >
      {/* Attention pulse ring */}
      {student.needs_attention && (
        <div className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Avatar */}
            <div
              className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
              style={{ backgroundColor: qualityColor }}
            >
              {(student.student_name || student.student_id).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                {student.student_name || student.student_id.slice(0, 15)}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Clock className="h-3 w-3 text-gray-400" />
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {lastUpdatedText}
                </span>
                <TrendIndicator trend={rttTrend} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SignalStrengthBars quality={student.quality} isActive={isActive} />
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getQualityBgClass(student.quality)}`}
            >
              {student.quality.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="px-4 py-3 space-y-2.5">
        {/* RTT Progress Bar */}
        <AnimatedProgressBar
          value={student.avg_rtt_ms}
          max={RTT_MAX}
          color={rttColor}
          label="Latency (RTT)"
          displayValue={`${Math.round(student.avg_rtt_ms)}ms`}
          icon={<Activity className="h-3 w-3" />}
          isActive={isActive}
          height={8}
        />

        {/* Jitter Progress Bar */}
        <AnimatedProgressBar
          value={student.jitter_ms}
          max={JITTER_MAX}
          color={jitterColor}
          label="Jitter"
          displayValue={`${student.jitter_ms.toFixed(1)}ms`}
          icon={<Zap className="h-3 w-3" />}
          isActive={isActive}
          height={6}
          showShimmer={false}
        />

        {/* Connection Quality Progress Bar */}
        <AnimatedProgressBar
          value={qualityToPercent(student.quality)}
          max={100}
          color={qualityColor}
          label="Connection Quality"
          displayValue={`${qualityToPercent(student.quality)}%`}
          icon={<Wifi className="h-3 w-3" />}
          isActive={isActive}
          height={8}
        />

        {/* Stability Score Progress Bar */}
        <AnimatedProgressBar
          value={student.stability_score}
          max={100}
          color={
            student.stability_score >= 70
              ? '#3b82f6'
              : student.stability_score >= 40
              ? '#eab308'
              : '#ef4444'
          }
          label="Stability Score"
          displayValue={`${Math.round(student.stability_score)}%`}
          icon={<Signal className="h-3 w-3" />}
          isActive={isActive}
          height={6}
          showShimmer={false}
        />
      </div>

      {/* Sparkline + Stats Footer */}
      <div className="px-4 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700/50">
        <div className="flex items-center justify-between gap-3">
          {/* Mini sparkline */}
          {showSparkline && (
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-gray-400 mb-0.5 font-medium">RTT History</div>
              <MiniSparkline history={history} width={120} height={28} />
            </div>
          )}

          {/* Quick stats */}
          <div className="flex gap-2 text-[10px]">
            <div className="text-center px-1.5 py-1 bg-gray-50 dark:bg-gray-700/50 rounded">
              <div className="font-semibold text-gray-700 dark:text-gray-300">
                {Math.round(student.min_rtt_ms)}
              </div>
              <div className="text-gray-400">Min</div>
            </div>
            <div className="text-center px-1.5 py-1 bg-gray-50 dark:bg-gray-700/50 rounded">
              <div className="font-semibold text-gray-700 dark:text-gray-300">
                {Math.round(student.avg_rtt_ms)}
              </div>
              <div className="text-gray-400">Avg</div>
            </div>
            <div className="text-center px-1.5 py-1 bg-gray-50 dark:bg-gray-700/50 rounded">
              <div className="font-semibold text-gray-700 dark:text-gray-300">
                {Math.round(student.max_rtt_ms)}
              </div>
              <div className="text-gray-400">Max</div>
            </div>
            <div className="text-center px-1.5 py-1 bg-gray-50 dark:bg-gray-700/50 rounded">
              <div className="font-semibold text-gray-700 dark:text-gray-300">
                {student.samples_count}
              </div>
              <div className="text-gray-400">Samples</div>
            </div>
          </div>
        </div>

        {/* Attention warning */}
        {student.needs_attention && (
          <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
            <span className="text-[10px] text-red-700 dark:text-red-300 font-medium">
              Poor network - Engagement metrics will be adjusted automatically
            </span>
          </div>
        )}
      </div>

      {/* CSS for shimmer animation */}
      <style>{`
        @keyframes liveBarShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};

export default LiveNetworkProgressBars;
