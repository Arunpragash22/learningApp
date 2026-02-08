/**
 * ConnectionStabilityBar Component
 * =================================
 * 
 * A visual stability timeline bar that shows connection quality changes
 * over time using colored segments. Similar to a timeline/heatmap bar
 * where each segment represents a sample and its color indicates the
 * connection quality at that point.
 * 
 * Used in the instructor's Student Network Monitor to show per-student
 * connection stability at a glance.
 */

import React from 'react';

export interface StabilityHistoryEntry {
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  rtt_ms: number;
  stability_score: number;
  timestamp: string;
}

interface ConnectionStabilityBarProps {
  /** Array of recent quality samples to display as segments */
  stabilityHistory: StabilityHistoryEntry[];
  /** Overall stability score (0-100) */
  stabilityScore: number;
  /** Total number of segments to show (pads with empty if fewer samples) */
  maxSegments?: number;
  /** Height of the bar in pixels */
  height?: number;
  /** Whether to show the label */
  showLabel?: boolean;
  /** Whether to show the percentage text */
  showPercentage?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Get the color for a quality level
 */
const getQualityColor = (quality: string): string => {
  switch (quality) {
    case 'excellent': return '#3b82f6'; // blue-500
    case 'good': return '#60a5fa';      // blue-400
    case 'fair': return '#eab308';      // yellow-500
    case 'poor': return '#f97316';      // orange-500
    case 'critical': return '#ef4444';  // red-500
    default: return '#d1d5db';          // gray-300
  }
};

/**
 * Get the background color class for overall stability
 */
const getStabilityBarColor = (score: number): string => {
  if (score >= 80) return 'from-blue-400 to-blue-500';
  if (score >= 60) return 'from-blue-400 to-yellow-500';
  if (score >= 40) return 'from-yellow-500 to-orange-500';
  if (score >= 20) return 'from-orange-500 to-red-500';
  return 'from-red-500 to-red-600';
};

/**
 * Get warning indicator color
 */
const getStabilityIndicator = (score: number): { color: string; label: string } => {
  if (score >= 80) return { color: 'text-blue-500', label: 'Stable' };
  if (score >= 60) return { color: 'text-blue-400', label: 'Moderate' };
  if (score >= 40) return { color: 'text-yellow-500', label: 'Unstable' };
  if (score >= 20) return { color: 'text-orange-500', label: 'Poor' };
  return { color: 'text-red-500', label: 'Critical' };
};

export const ConnectionStabilityBar: React.FC<ConnectionStabilityBarProps> = ({
  stabilityHistory,
  stabilityScore,
  maxSegments = 30,
  height,
  showLabel = false,
  showPercentage = true,
  className = '',
  size = 'sm'
}) => {
  // Determine dimensions based on size
  const barHeight = height || (size === 'lg' ? 12 : size === 'md' ? 8 : 6);
  const gap = size === 'lg' ? 1.5 : size === 'md' ? 1 : 0.5;
  
  // Pad or trim history to maxSegments
  const segments = stabilityHistory.length > 0
    ? stabilityHistory.slice(-maxSegments)
    : [];
  
  // Fill remaining slots with empty segments
  const emptyCount = Math.max(0, maxSegments - segments.length);
  
  const indicator = getStabilityIndicator(stabilityScore);

  return (
    <div className={`${className}`}>
      {/* Label */}
      {showLabel && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            Connection Stability
          </span>
          <span className={`text-xs font-medium ${indicator.color}`}>
            {indicator.label}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {/* Segmented Timeline Bar */}
        <div 
          className="flex-1 flex items-center rounded-sm overflow-hidden bg-gray-100 dark:bg-gray-700/50"
          style={{ height: `${barHeight}px`, gap: `${gap}px`, padding: '0 1px' }}
          title={`Stability: ${Math.round(stabilityScore)}% | ${segments.length} samples`}
        >
          {/* Empty segments (no data yet) */}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex-1 rounded-[1px] bg-gray-200 dark:bg-gray-600 opacity-30"
              style={{ height: `${barHeight - 2}px`, minWidth: '2px' }}
            />
          ))}
          
          {/* Actual data segments */}
          {segments.map((entry, i) => (
            <div
              key={`seg-${i}`}
              className="flex-1 rounded-[1px] transition-colors duration-300"
              style={{ 
                height: `${barHeight - 2}px`,
                minWidth: '2px',
                backgroundColor: getQualityColor(entry.quality),
                opacity: 0.6 + (i / segments.length) * 0.4 // Newer segments more opaque
              }}
              title={`RTT: ${entry.rtt_ms}ms | Quality: ${entry.quality} | Score: ${Math.round(entry.stability_score)}%`}
            />
          ))}
        </div>

        {/* Percentage */}
        {showPercentage && (
          <span className={`text-xs font-semibold tabular-nums min-w-[36px] text-right ${indicator.color}`}>
            {Math.round(stabilityScore)}%
          </span>
        )}
      </div>

      {/* Samples info (only for md/lg sizes) */}
      {(size === 'md' || size === 'lg') && (
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            Samples: {segments.length}
          </span>
          {segments.length > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1" />
              Monitoring
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Compact inline stability bar for table rows
 * Shows just the colored bar segments with minimal chrome
 */
export const InlineStabilityBar: React.FC<{
  stabilityHistory: StabilityHistoryEntry[];
  stabilityScore: number;
  maxSegments?: number;
  className?: string;
}> = ({ stabilityHistory, stabilityScore, maxSegments = 20, className = '' }) => {
  const segments = stabilityHistory.slice(-maxSegments);
  const emptyCount = Math.max(0, maxSegments - segments.length);
  const indicator = getStabilityIndicator(stabilityScore);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Mini segmented bar */}
      <div 
        className="flex items-center rounded-sm overflow-hidden bg-gray-100 dark:bg-gray-700/50"
        style={{ width: '80px', height: '6px', gap: '0.5px', padding: '0 0.5px' }}
        title={`Stability: ${Math.round(stabilityScore)}%`}
      >
        {Array.from({ length: emptyCount }).map((_, i) => (
          <div
            key={`e-${i}`}
            className="flex-1 bg-gray-200 dark:bg-gray-600 opacity-30"
            style={{ height: '4px', minWidth: '1.5px' }}
          />
        ))}
        {segments.map((entry, i) => (
          <div
            key={`s-${i}`}
            className="flex-1 transition-colors duration-300"
            style={{ 
              height: '4px',
              minWidth: '1.5px',
              backgroundColor: getQualityColor(entry.quality),
              opacity: 0.5 + (i / segments.length) * 0.5
            }}
          />
        ))}
      </div>
      <span className={`text-xs font-medium tabular-nums ${indicator.color}`}>
        {Math.round(stabilityScore)}%
      </span>
    </div>
  );
};

export default ConnectionStabilityBar;
