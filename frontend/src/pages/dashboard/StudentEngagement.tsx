import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { EngagementIndicator } from '../../components/engagement/EngagementIndicator';
import { PersonalizedFeedback } from '../../components/feedback/PersonalizedFeedback';
import { TargetedQuiz } from '../../components/quiz/TargetedQuiz';
import { TrendingDown, Activity, Award, Target, Clock } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';

export const StudentEngagement = () => {
  const { user } = useAuth();
  const [currentQuiz, setCurrentQuiz] = useState<any>(null);

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

  const engagementHistory = [
    { time: '0 min', score: 70 },
    { time: '5 min', score: 75 },
    { time: '10 min', score: 80 },
    { time: '15 min', score: 85 },
    { time: '20 min', score: 82 },
    { time: '25 min', score: 88 }
  ];

  const achievements = [
    { id: '1', title: 'Quick Responder', description: 'Answered 5 questions in under 10 seconds', icon: Clock, earned: true },
    { id: '2', title: 'Active Participant', description: 'Maintained 80%+ engagement for 20 minutes', icon: Activity, earned: true },
    { id: '3', title: 'Perfect Score', description: 'Got 100% on a quiz', icon: Award, earned: false },
  ];

  const handleQuizAnswer = (answerIndex: number) => {
    console.log('Answer submitted:', answerIndex);
    // Handle quiz answer logic here
    setTimeout(() => {
      setCurrentQuiz(null);
    }, 3000);
  };

  const showQuiz = () => {
    setCurrentQuiz({
      id: '1',
      question: 'What is the primary purpose of backpropagation in neural networks?',
      options: [
        'To initialize weights randomly',
        'To update weights based on error gradients',
        'To add more layers to the network',
        'To visualize the network structure'
      ],
      correctAnswer: 1,
      difficulty: 'medium' as const,
      clusterTarget: 'Active Participants'
    });
  };

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

      {/* Engagement History Chart */}
      <Card className="mb-6">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Engagement Over Time</h3>
          <div className="h-64 flex items-end justify-between space-x-2">
            {engagementHistory.map((point, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-indigo-600 rounded-t transition-all hover:bg-indigo-700"
                  style={{ height: `${(point.score / 100) * 100}%` }}
                  title={`${point.score}%`}
                />
                <span className="text-xs text-gray-500 mt-2">{point.time}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Quiz Section */}
      {currentQuiz ? (
        <div className="mb-6">
          <TargetedQuiz
            question={currentQuiz}
            onAnswer={handleQuizAnswer}
            timeLimit={30}
            isPersonalized={true}
          />
        </div>
      ) : (
        <Card className="mb-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Targeted Quiz</h3>
              <p className="text-sm text-gray-500 mt-1">
                Personalized questions based on your engagement level
              </p>
            </div>
            <button
              onClick={showQuiz}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Start Quiz
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personalized Feedback */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Personalized Feedback</h2>
          <PersonalizedFeedback feedback={feedback} studentName={user?.firstName} />
        </div>

        {/* Achievements */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Achievements</h2>
          <Card className="p-6">
            <div className="space-y-4">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={`p-4 rounded-lg border-2 ${
                    achievement.earned
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200 opacity-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2 rounded-lg ${
                        achievement.earned ? 'bg-blue-100' : 'bg-gray-100'
                      }`}
                    >
                      <achievement.icon
                        className={`h-5 w-5 ${
                          achievement.earned ? 'text-blue-600' : 'text-gray-400'
                        }`}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-semibold text-gray-900">{achievement.title}</h4>
                        {achievement.earned && (
                          <Badge variant="success" size="sm">Earned</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{achievement.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

