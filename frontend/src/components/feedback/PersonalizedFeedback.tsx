import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Lightbulb, TrendingUp, Target, Award, AlertCircle } from 'lucide-react';

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

  const getColor = (type: string) => {
    switch (type) {
      case 'encouragement':
        return 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200';
      case 'improvement':
        return 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200';
      case 'achievement':
        return 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200';
      case 'warning':
        return 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
      default:
        return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200';
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
      {feedback.map((item) => (
        <Card key={item.id} className="border-l-4 border-l-indigo-500 dark:border-l-indigo-400">
          <div className={`p-5 ${getColor(item.type)}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-2">
                {getIcon(item.type)}
                <Badge variant={getBadgeColor(item.type)}>
                  {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                </Badge>
                {item.clusterContext && (
                  <Badge variant="default">
                    {item.clusterContext}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{item.timestamp}</span>
            </div>
            
            <p className="text-gray-900 dark:text-gray-100 mb-3">
              {item.message}
            </p>

            {item.suggestions && item.suggestions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Suggestions:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {item.suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
};
