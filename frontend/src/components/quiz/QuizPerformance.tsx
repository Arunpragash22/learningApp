import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { CheckCircle, XCircle, TrendingUp, TrendingDown, Award, Clock, Target, Users } from 'lucide-react';

interface QuizPerformanceData {
  totalStudents: number;
  answeredStudents: number;
  correctAnswers: number;
  averageTime: number;
  correctPercentage: number;
  performanceByCluster: {
    clusterName: string;
    answered: number;
    correct: number;
    percentage: number;
  }[];
  topPerformers: {
    studentName: string;
    isCorrect: boolean;
    timeTaken: number;
  }[];
}

interface QuizPerformanceProps {
  performance: QuizPerformanceData;
  question: {
    id: string;
    question: string;
  };
  onClose?: () => void;
}

export const QuizPerformance: React.FC<QuizPerformanceProps> = ({
  performance,
  question,
  onClose
}) => {
  const getPerformanceColor = (percentage: number) => {
    if (percentage >= 80) return 'text-blue-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPerformanceBadge = (percentage: number) => {
    if (percentage >= 80) return 'success';
    if (percentage >= 60) return 'warning';
    return 'danger';
  };

  return (
    <Card className="w-full max-w-4xl mx-auto border-2 border-indigo-500">
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <Target className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Quiz Performance</h3>
              <Badge variant={getPerformanceBadge(performance.correctPercentage) as any}>
                {performance.correctPercentage.toFixed(0)}% Correct
              </Badge>
            </div>
            <p className="text-sm text-gray-600 line-clamp-2">{question.question}</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Close
            </button>
          )}
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <Users className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold text-blue-900">
                {performance.answeredStudents}/{performance.totalStudents}
              </span>
            </div>
            <p className="text-xs text-blue-700">Students Answered</p>
            <p className="text-xs text-blue-600 mt-1">
              {((performance.answeredStudents / performance.totalStudents) * 100).toFixed(0)}% participation
            </p>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold text-blue-900">
                {performance.correctAnswers}
              </span>
            </div>
            <p className="text-xs text-blue-700">Correct Answers</p>
            <p className="text-xs text-blue-600 mt-1">
              {performance.correctPercentage.toFixed(1)}% accuracy
            </p>
          </div>

          <div className="bg-red-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <span className="text-2xl font-bold text-red-900">
                {performance.answeredStudents - performance.correctAnswers}
              </span>
            </div>
            <p className="text-xs text-red-700">Incorrect Answers</p>
            <p className="text-xs text-red-600 mt-1">
              {(100 - performance.correctPercentage).toFixed(1)}% incorrect
            </p>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-2xl font-bold text-blue-900">
                {performance.averageTime.toFixed(1)}s
              </span>
            </div>
            <p className="text-xs text-blue-700">Average Time</p>
            <p className="text-xs text-blue-600 mt-1">Response speed</p>
          </div>
        </div>

        {/* Performance by Cluster */}
        {performance.performanceByCluster.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              Performance by Cluster
            </h4>
            <div className="space-y-3">
              {performance.performanceByCluster.map((cluster, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{cluster.clusterName}</span>
                    <span className={`text-lg font-bold ${getPerformanceColor(cluster.percentage)}`}>
                      {cluster.percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{cluster.correct}/{cluster.answered} correct</span>
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          cluster.percentage >= 80 ? 'bg-blue-500' :
                          cluster.percentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${cluster.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Performers */}
        {performance.topPerformers.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
              <Award className="h-4 w-4 mr-2" />
              Recent Responses
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {performance.topPerformers.map((performer, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    performer.isCorrect ? 'bg-blue-50' : 'bg-red-50'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {performer.isCorrect ? (
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-sm font-medium text-gray-900">
                      {performer.studentName}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-gray-600">
                    <span className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {performer.timeTaken.toFixed(1)}s
                    </span>
                    <Badge
                      variant={performer.isCorrect ? 'success' : 'danger'}
                      size="sm"
                    >
                      {performer.isCorrect ? 'Correct' : 'Incorrect'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

