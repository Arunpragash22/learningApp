import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { EngagementIndicator } from '../../components/engagement/EngagementIndicator';
import { PersonalizedFeedback } from '../../components/feedback/PersonalizedFeedback';
import { Activity, Target } from 'lucide-react';

export const StudentEngagement = () => {
  const { user } = useAuth();

  // Mock student data
  const studentData = {
    engagementLevel: 'high' as const,
    engagementScore: 85,
    cluster: 'Active Participants',
    sessionEngagement: 78,
    overallEngagement: 82,
    questionsAnswered: 12,
    correctAnswers: 10,
    averageResponseTime: 8.5
  };

  const feedback = [
    {
      id: '1',
      type: 'achievement' as const,
      message: 'Great job! You\'ve maintained high engagement throughout this session. Keep up the excellent participation!',
      clusterContext: 'Active Participants',
      suggestions: [
        'Continue asking questions during discussions',
        'Help other students when possible'
      ],
      timestamp: '2 minutes ago'
    },
    {
      id: '2',
      type: 'encouragement' as const,
      message: 'Your response time has improved significantly. You\'re responding 20% faster than last week!',
      clusterContext: 'Active Participants',
      timestamp: '5 minutes ago'
    },
    {
      id: '3',
      type: 'improvement' as const,
      message: 'Consider participating more in group discussions. Your input would be valuable to the class.',
      suggestions: [
        'Raise your hand when you have questions',
        'Share your thoughts in the chat more often'
      ],
      timestamp: '10 minutes ago'
    }
  ];

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">My Engagement Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track your engagement, receive personalized feedback, and improve your learning
        </p>
      </div>

      {/* Engagement Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Current Engagement</h3>
            <Activity className="h-6 w-6 text-indigo-600" />
          </div>
          <EngagementIndicator
            engagementLevel={studentData.engagementLevel}
            engagementScore={studentData.engagementScore}
            cluster={studentData.cluster}
            showCluster={true}
          />
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Quiz Performance</h3>
            <Target className="h-6 w-6 text-purple-600" />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Correct Answers</span>
              <span className="font-semibold text-gray-900">
                {studentData.correctAnswers}/{studentData.questionsAnswered}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Accuracy</span>
              <span className="font-semibold text-gray-900">
                {((studentData.correctAnswers / studentData.questionsAnswered) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Response Time</span>
              <span className="font-semibold text-gray-900">{studentData.averageResponseTime}s</span>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Personalized Feedback</h2>
        <PersonalizedFeedback feedback={feedback} studentName={user?.firstName} />
      </div>
    </div>
  );
};

