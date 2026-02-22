import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Lightbulb, TrendingUp, Target, Award, AlertCircle, AlertTriangle } from 'lucide-react';

interface FeedbackItem {
  id: string;
  type: 'encouragement' | 'improvement' | 'achievement' | 'warning';
  message: string;
  clusterContext?: string;
  suggestions?: string[];
  timestamp: string;
}

interface PersonalizedFeedbackProps {
  feedback: FeedbackItem[];
  studentName?: string;
}

type ClusterLevel = 'active' | 'moderate' | 'atrisk';

function _detectCluster(clusterContext?: string): ClusterLevel {
  if (!clusterContext) return 'moderate';
  const low = clusterContext.toLowerCase();
  if (low.includes('active')) return 'active';
  if (low.includes('passive') || low.includes('risk')) return 'atrisk';
  return 'moderate';
}

const CLUSTER_CARD_STYLES: Record<ClusterLevel, { border: string; bg: string }> = {
  active: {
    border: 'border-l-green-500 dark:border-l-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  },
  moderate: {
    border: 'border-l-yellow-500 dark:border-l-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  },
  atrisk: {
    border: 'border-l-red-500 dark:border-l-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  },
};

const CLUSTER_BADGE_STYLES: Record<ClusterLevel, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  atrisk: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export const PersonalizedFeedback: React.FC<PersonalizedFeedbackProps> = ({
  feedback,
  studentName
}) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'encouragement':
        return <TrendingUp className="h-5 w-5" />;
      case 'improvement':
        return <Target className="h-5 w-5" />;
      case 'achievement':
        return <Award className="h-5 w-5" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <Lightbulb className="h-5 w-5" />;
    }
  };

  const getBadgeColor = (type: string): 'default' | 'success' | 'warning' | 'danger' | 'info' => {
    switch (type) {
      case 'encouragement':
        return 'info';
      case 'improvement':
        return 'warning';
      case 'achievement':
        return 'success';
      case 'warning':
        return 'danger';
      default:
        return 'default';
    }
  };

  if (feedback.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <Lightbulb className="h-12 w-12 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
          <p>No feedback available yet.</p>
          <p className="text-sm mt-1">Feedback will appear here as you participate in sessions.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {feedback.map((item) => {
        const cluster = _detectCluster(item.clusterContext);
        const cardStyle = CLUSTER_CARD_STYLES[cluster];
        const isAtRisk = cluster === 'atrisk';
        const isActive = cluster === 'active';

        return (
          <Card key={item.id} className={`border-l-4 ${cardStyle.border}`}>
            <div className={`p-5 ${cardStyle.bg}`}>
              {/* At-Risk alert banner */}
              {isAtRisk && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <span className="text-sm font-bold text-red-700 dark:text-red-300">
                    You are At-Risk — Participate more actively to improve your standing!
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  {getIcon(item.type)}
                  <Badge variant={getBadgeColor(item.type)}>
                    {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                  </Badge>
                  {item.clusterContext && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${CLUSTER_BADGE_STYLES[cluster]}`}>
                      {item.clusterContext}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">{item.timestamp}</span>
              </div>

              <p className={`mb-3 leading-relaxed ${
                isActive
                  ? 'text-green-700 dark:text-green-300 font-bold text-[15px]'
                  : isAtRisk
                    ? 'text-red-700 dark:text-red-300 font-semibold text-sm'
                    : 'text-yellow-700 dark:text-yellow-300 font-medium text-sm'
              }`}>
                {item.message}
              </p>

              {item.suggestions && item.suggestions.length > 0 && (
                <div className={`mt-4 pt-4 border-t ${
                  isActive
                    ? 'border-green-200 dark:border-green-700'
                    : isAtRisk
                      ? 'border-red-200 dark:border-red-700'
                      : 'border-yellow-200 dark:border-yellow-700'
                }`}>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Suggestions:</p>
                  <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                    {item.suggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className={`mt-1.5 flex-shrink-0 h-2 w-2 rounded-full ${
                          isActive
                            ? 'bg-green-500'
                            : isAtRisk
                              ? 'bg-red-500'
                              : 'bg-yellow-500'
                        }`} />
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
