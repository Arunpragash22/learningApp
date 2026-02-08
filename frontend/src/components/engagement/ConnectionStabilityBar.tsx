/**
 * ConnectionStabilityBar Component
 * =================================
 * 
 * A smooth, animated connection stability bar that actively moves/updates
 * in real-time to show each student's network stability on the instructor side.
 * 
 * Designed to match the student-side "Connection Stability" bar style:
 * - Smooth colored fill that grows/shrinks based on stability score
 * - Active shimmer animation to show it's live/monitoring
 * - Color changes smoothly based on quality (blue -> yellow -> red)
 */

import React, { useEffect, useState } from 'react';

export interface StabilityHistoryEntry {
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  rtt_ms: number;
  stability_score: number;
  timestamp: string;
}

interface ConnectionStabilityBarProps {
  /** Array of recent quality samples */
  stabilityHistory: StabilityHistoryEntry[];
  /** Overall stability score (0-100) */
  stabilityScore: number;
  /** Overall connection quality */
  quality?: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  /** Whether to show the label */
  showLabel?: boolean;
  /** Whether to show percentage text */
  showPercentage?: boolean;
  /** Whether monitoring is active (shows animation) */
  isActive?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Get the fill color based on stability score
 */
const getBarFillColor = (score: number, quality?: string): string => {
  // Use quality if provided for more accurate color
  if (quality) {
    switch (quality) {
      case 'excellent': return '#3b82f6'; // blue-500
      case 'good': return '#60a5fa';      // blue-400
      case 'fair': return '#eab308';      // yellow-500
      case 'poor': return '#f97316';      // orange-500
      case 'critical': return '#ef4444';  // red-500
    }
  }
  // Fallback to score-based color
  if (score >= 80) return '#3b82f6';
  if (score >= 60) return '#60a5fa';
  if (score >= 40) return '#eab308';
  if (score >= 20) return '#f97316';
  return '#ef4444';
};

/**
 * Get text color class based on score
 */
const getScoreColorClass = (score: number): string => {
  if (score >= 80) return 'text-blue-500';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-500';
  if (score >= 20) return 'text-orange-500';
  return 'text-red-500';
};

/**
 * Get warning icon for low stability
 */
const getWarningIcon = (score: number): string | null => {
  if (score < 40) return '⚠';
  return null;
};

export const ConnectionStabilityBar: React.FC<ConnectionStabilityBarProps> = ({
  stabilityHistory,
  stabilityScore,
  quality,
  showLabel = false,
  showPercentage = true,
  isActive = true,
  className = '',
  size = 'sm'
}) => {
  // Animate the bar width smoothly
  const [animatedWidth, setAnimatedWidth] = useState(0);
  
  useEffect(() => {
    // Small delay to trigger CSS transition on mount
    const timer = setTimeout(() => {
      setAnimatedWidth(Math.min(100, Math.max(0, stabilityScore)));
    }, 50);
    return () => clearTimeout(timer);
  }, [stabilityScore]);

  const barHeight = size === 'lg' ? 10 : size === 'md' ? 7 : 5;
  const fillColor = getBarFillColor(stabilityScore, quality);
  const scoreColor = getScoreColorClass(stabilityScore);
  const warningIcon = getWarningIcon(stabilityScore);
  const samplesCount = stabilityHistory.length;

  return (
    <div className={`${className}`}>
      {/* Label row */}
      {showLabel && (
        <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 font-medium">
          Connection Stability
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {/* Smooth animated bar */}
        <div 
          className="flex-1 relative overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          style={{ height: `${barHeight}px` }}
          title={`Stability: ${Math.round(stabilityScore)}% | Samples: ${samplesCount}`}
        >
          {/* Main fill - smooth animated */}
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${animatedWidth}%`,
              backgroundColor: fillColor,
              transition: 'width 1s ease-in-out, background-color 0.8s ease',
            }}
          />

          {/* Active shimmer/pulse overlay - shows it's live */}
          {isActive && animatedWidth > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
              style={{ width: `${animatedWidth}%` }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)`,
                  animation: 'stabilityShimmer 2s ease-in-out infinite',
                }}
              />
            </div>
          )}
        </div>

        {/* Score with warning */}
        {showPercentage && (
          <span className={`text-xs font-semibold tabular-nums min-w-[40px] text-right ${scoreColor}`}>
            {Math.round(stabilityScore)}%
            {warningIcon && <span className="ml-0.5">{warningIcon}</span>}
          </span>
        )}
      </div>

      {/* Samples count for md/lg */}
      {(size === 'md' || size === 'lg') && (
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-gray-400">Samples: {samplesCount}</span>
          {isActive && (
            <span className="text-[10px] text-gray-400 flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1" />
              Live
            </span>
          )}
        </div>
      )}

      {/* CSS animation keyframes */}
      <style>{`
        @keyframes stabilityShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};

/**
 * Compact inline stability bar for table rows
 * A small, smooth, animated bar perfect for the student table
 */
export const InlineStabilityBar: React.FC<{
  stabilityHistory: StabilityHistoryEntry[];
  stabilityScore: number;
  quality?: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  isActive?: boolean;
  className?: string;
}> = ({ stabilityHistory, stabilityScore, quality, isActive = true, className = '' }) => {
  const [animatedWidth, setAnimatedWidth] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(Math.min(100, Math.max(0, stabilityScore)));
    }, 50);
    return () => clearTimeout(timer);
  }, [stabilityScore]);

  const fillColor = getBarFillColor(stabilityScore, quality);
  const scoreColor = getScoreColorClass(stabilityScore);
  const warningIcon = getWarningIcon(stabilityScore);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Smooth animated mini bar */}
      <div 
        className="relative overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        style={{ width: '80px', height: '5px' }}
        title={`Stability: ${Math.round(stabilityScore)}%`}
      >
        {/* Animated fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${animatedWidth}%`,
            backgroundColor: fillColor,
            transition: 'width 1s ease-in-out, background-color 0.8s ease',
          }}
        />
        {/* Shimmer */}
        {isActive && animatedWidth > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
            style={{ width: `${animatedWidth}%` }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)`,
                animation: 'stabilityShimmer 2s ease-in-out infinite',
              }}
            />
          </div>
        )}
      </div>
      {/* Score */}
      <span className={`text-xs font-semibold tabular-nums ${scoreColor}`}>
        {Math.round(stabilityScore)}%{warningIcon && <span className="ml-0.5">{warningIcon}</span>}
      </span>

      <style>{`
        @keyframes stabilityShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};

export default ConnectionStabilityBar;
