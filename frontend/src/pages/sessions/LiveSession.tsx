import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MessageSquareIcon, UsersIcon, MicIcon, VideoIcon, ShareIcon, HandIcon, BarChart2Icon, ZapIcon, ThumbsUpIcon, SmileIcon, BrainIcon, Settings2Icon, TargetIcon, WifiIcon } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { QuestionBank, Question } from '../../components/questions/QuestionBank';
import { TargetedQuiz } from '../../components/quiz/TargetedQuiz';
import { QuizPerformance } from '../../components/quiz/QuizPerformance';
import { quizService, QuizPerformance as QuizPerformanceType } from '../../services/quizService';
import { questionService } from '../../services/questionService';
import { clusteringService, StudentCluster } from '../../services/clusteringService';
import { toast } from 'sonner';
import { useNotifications } from '../../hooks/useNotifications';
import { QuestionNotificationPopup } from '../../components/notifications/QuestionNotificationPopup';
import { useSessionSocket, QuizNotification } from '../../hooks/useSessionSocket';
import { useLatencyMonitor, ConnectionQuality } from '../../hooks/useLatencyMonitor';
import { ConnectionQualityIndicator, ConnectionQualityBadge } from '../../components/engagement/ConnectionQualityIndicator';
import { NetworkWarningPopup } from '../../components/notifications/NetworkWarningPopup';

const DEFAULT_SESSION_QUESTIONS: Question[] = [
  {
    id: '1',
    question: 'What is the primary purpose of backpropagation in neural networks?',
    options: [
      'To initialize weights randomly',
      'To update weights based on error gradients',
      'To add more layers to the network',
      'To visualize the network structure'
    ],
    correctAnswer: 1,
    difficulty: 'medium',
    category: 'Neural Networks',
    tags: ['backpropagation', 'training'],
    timeLimit: 30,
    createdAt: '2023-10-01'
  },
  {
    id: '2',
    question: 'Which activation function is commonly used in hidden layers?',
    options: [
      'Sigmoid',
      'ReLU',
      'Linear',
      'Step function'
    ],
    correctAnswer: 1,
    difficulty: 'easy',
    category: 'Neural Networks',
    tags: ['activation', 'functions'],
    timeLimit: 25,
    createdAt: '2023-10-01'
  },
  {
    id: '3',
    question: 'What is the main advantage of using dropout in neural networks?',
    options: [
      'Increases training speed',
      'Prevents overfitting',
      'Reduces model size',
      'Improves accuracy on all datasets'
    ],
    correctAnswer: 1,
    difficulty: 'hard',
    category: 'Neural Networks',
    tags: ['dropout', 'regularization'],
    timeLimit: 35,
    createdAt: '2023-10-01'
  }
];

export const LiveSession = () => {
  const { sessionId } = useParams();
  const { user } = useAuth();
  
  // Log component mount
  useEffect(() => {
    console.log('=== LiveSession Component Mounted ===');
    console.log('sessionId from URL:', sessionId);
    console.log('user:', user);
    console.log('URL:', window.location.href);
  }, []);
  
  const [activeTab, setActiveTab] = useState('chat');
  const [message, setMessage] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [quizPerformance, setQuizPerformance] = useState<QuizPerformanceType | null>(null);
  const [showPerformance, setShowPerformance] = useState(false);
  const [answerSubmitted, setAnswerSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [selectedAnswerIndex, setSelectedAnswerIndex] = useState<number | null>(null);
  const [timeTaken, setTimeTaken] = useState(0);
  const [clusters, setClusters] = useState<StudentCluster[]>([]);
  const [questionBank, setQuestionBank] = useState<Question[]>(DEFAULT_SESSION_QUESTIONS);
  const [isQuestionBankLoading, setIsQuestionBankLoading] = useState(false);
  const questionStartTime = React.useRef<number>(0);
  const assignmentIdRef = React.useRef<string | null>(null);
  const [hasJoinedSession, setHasJoinedSession] = useState(false);
  const [isJoiningSession, setIsJoiningSession] = useState(false);

  // Determine if user is instructor (must be before useEffect hooks that use it)
  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  // 🎯 Handle quiz received from Socket.IO session room
  const handleQuizReceived = useCallback((quiz: QuizNotification) => {
    console.log('🎯 Quiz received via session socket:', quiz);
    
    // Convert socket quiz to Question format
    const question: Question = {
      id: quiz.questionId || quiz.question_id || `quiz-${Date.now()}`,
      question: quiz.question,
      options: quiz.options,
      correctAnswer: (quiz as { correctAnswer?: number; correct_answer?: number }).correctAnswer ?? (quiz as { correct_answer?: number }).correct_answer ?? -1,
      difficulty: 'medium',
      category: 'Live Quiz',
      tags: [],
      timeLimit: quiz.timeLimit || quiz.time_limit || 30,
      createdAt: quiz.triggeredAt || quiz.triggered_at || new Date().toISOString()
    };
    
    setActiveQuestion(question);
    setShowQuestions(false);
    setAnswerSubmitted(false);
    setSelectedAnswerIndex(null);
    setShowPerformance(false);
    setQuizPerformance(null);
    questionStartTime.current = Date.now();
    
    toast.success('📝 New quiz question received!');
  }, []);

  // 🎯 Session Socket for real-time quiz delivery (students only)
  const {
    isConnected: isSessionConnected,
    isJoined: hasJoinedSessionRoom,
    participantCount,
    currentQuiz,
    error: sessionSocketError,
    clearQuiz
  } = useSessionSocket({
    sessionId: sessionId || null,
    studentId: user?.id,
    studentName: `${user?.firstName} ${user?.lastName}`,
    studentEmail: user?.email,
    autoConnect: false, // 🎯 Disabled - must be explicitly enabled when student clicks "Join Now"
    onQuizReceived: handleQuizReceived
  });

  // 🔔 Real-time Notifications for Students (fallback/legacy)
  // Disabled auto-connect - only connect when student joins
  const {
    isConnected: isNotificationConnected,
    currentNotification,
    error: notificationError,
    connect: connectNotifications,
    disconnect: disconnectNotifications,
    clearNotification
  } = useNotifications({
    meetingId: sessionId || null,
    studentId: user?.id,
    studentName: `${user?.firstName} ${user?.lastName}`,
    studentEmail: user?.email,
    autoConnect: false // 🎯 Disabled - must be explicitly enabled when student joins
  });

  // 📶 Network warning popup state
  const [showNetworkWarning, setShowNetworkWarning] = useState(false);
  const [networkWarningQuality, setNetworkWarningQuality] = useState<ConnectionQuality>('unknown');
  const networkWarningShownRef = React.useRef<Set<string>>(new Set());

  // 📶 WebRTC-aware Connection Latency Monitoring
  // This monitors network quality during the Zoom session to contextualize engagement analysis
  const handleConnectionQualityChange = useCallback((quality: ConnectionQuality, stats: any) => {
    // Show network warning popup for fair, poor, or critical quality (without sound)
    if (quality === 'fair' || quality === 'poor' || quality === 'critical') {
      // Only show the popup once per quality level per session
      if (!networkWarningShownRef.current.has(quality)) {
        networkWarningShownRef.current.add(quality);
        setNetworkWarningQuality(quality);
        setShowNetworkWarning(true);
      }
    }
  }, []);

  // 📶 Network monitoring state - only enabled when student actually joins Zoom meeting
  const [networkMonitoringEnabled, setNetworkMonitoringEnabled] = useState(false);
  
  const {
    isMonitoring: isLatencyMonitoring,
    currentRtt,
    quality: connectionQuality,
    stats: latencyStats,
    shouldAdjustEngagement,
    stopMonitoring
  } = useLatencyMonitor({
    sessionId: sessionId || null,
    studentId: user?.id,
    studentName: `${user?.firstName} ${user?.lastName}`,
    userRole: user?.role || 'student', // Only student data is stored in database
    enabled: networkMonitoringEnabled && !!sessionId && !!user?.id, // Enable ONLY when explicitly enabled
    pingInterval: 3000, // Ping every 3 seconds for near real-time updates
    reportInterval: 5000, // Report to server every 5 seconds for near real-time updates
    onQualityChange: handleConnectionQualityChange
  });

  // Mock session data
  const session = {
    id: sessionId,
    title: 'Machine Learning: Neural Networks',
    course: 'Machine Learning Fundamentals',
    instructor: 'Dr. Jane Smith',
    date: '2023-10-15',
    time: '14:00-15:30',
    status: 'live',
    participants: 32,
    recording: false
  };

  // Mock chat messages
  const [chatMessages, setChatMessages] = useState([
    {
    id: 1,
    sender: 'Dr. Jane Smith',
    role: 'instructor',
    message: "Welcome to today's session on Neural Networks!",
    time: '14:01'
    },
    {
    id: 2,
    sender: 'Alice Johnson',
    role: 'student',
    message: 'Looking forward to learning about activation functions.',
    time: '14:02'
    },
    {
    id: 3,
    sender: 'Bob Williams',
    role: 'student',
    message: 'Will we be covering backpropagation today?',
    time: '14:03'
    }
  ]);

  // Use actual clusters from state or fallback to mock
  const engagementClusters = clusters.length > 0
    ? clusters.map(cluster => ({
        name: cluster.name,
        count: cluster.studentCount,
        percentage: (cluster.studentCount / clusters.reduce((sum, c) => sum + c.studentCount, 0)) * 100,
        color: cluster.engagementLevel === 'high' ? 'bg-blue-500' :
               cluster.engagementLevel === 'medium' ? 'bg-blue-400' : 'bg-red-500'
      }))
    : [
        {
    name: 'Highly Engaged',
    count: 12,
    percentage: 38,
    color: 'bg-blue-500'
        },
        {
    name: 'Moderately Engaged',
    count: 14,
    percentage: 44,
    color: 'bg-blue-400'
        },
        {
    name: 'Passively Engaged',
    count: 4,
    percentage: 12,
    color: 'bg-yellow-500'
        },
        {
    name: 'At Risk',
    count: 2,
    percentage: 6,
    color: 'bg-red-500'
        }
      ];

  // Mock AI suggestions
  const aiSuggestions = [
    {
    id: 1,
    type: 'question',
    content: 'Consider asking about activation functions to engage passive students',
    priority: 'high'
    },
    {
    id: 2,
    type: 'poll',
    content: 'Poll: Which neural network architecture is best for image recognition?',
    priority: 'medium'
    },
    {
    id: 3,
    type: 'alert',
    content: '2 students appear disengaged for >5 minutes',
    priority: 'high'
    }
  ];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    const newMessage = {
      id: chatMessages.length + 1,
      sender: `${user?.firstName} ${user?.lastName}`,
      role: user?.role || 'student',
      message: message.trim(),
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    };
    setChatMessages([...chatMessages, newMessage]);
    setMessage('');
  };

  const sendReaction = (reaction: string) => {
    console.log(`Sending reaction: ${reaction}`);
    setShowReactions(false);
  };

  useEffect(() => {
    let isMounted = true;
    const loadQuestionsFromApi = async () => {
      try {
        setIsQuestionBankLoading(true);
        const fetchedQuestions = await questionService.getAllQuestions();
        if (isMounted) {
          // Map questions to ensure createdAt is always present
          const normalizedQuestions = fetchedQuestions.map(q => ({
            ...q,
            createdAt: q.createdAt || new Date().toISOString()
          }));
          setQuestionBank(normalizedQuestions.length > 0 ? normalizedQuestions : DEFAULT_SESSION_QUESTIONS);
        }
      } catch (error) {
        console.error('Error loading question bank:', error);
        if (isMounted) {
          setQuestionBank(DEFAULT_SESSION_QUESTIONS);
        }
      } finally {
        if (isMounted) {
          setIsQuestionBankLoading(false);
        }
      }
    };

    loadQuestionsFromApi();
    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize clusters
  useEffect(() => {
    console.log('LiveSession mounted, sessionId:', sessionId);
    if (sessionId) {
      console.log('Loading clusters for session:', sessionId);
      clusteringService.getClusters(sessionId)
        .then(clusterData => {
          console.log('Clusters loaded:', clusterData);
          setClusters(clusterData);
        })
        .catch(error => {
          console.error('Error loading clusters:', error);
          // Set default clusters on error
          const defaultClusters = clusteringService.getDefaultClusters();
          console.log('Using default clusters:', defaultClusters);
          setClusters(defaultClusters);
        });
    } else {
      console.warn('No sessionId found in URL params');
      // Use default clusters if no sessionId
      const defaultClusters = clusteringService.getDefaultClusters();
      setClusters(defaultClusters);
    }
  }, [sessionId]);

  // 🎯 REMOVED: Auto-join session on page load
  // Network monitoring and session joining must start ONLY when student clicks "Join Now"
  // Students must explicitly join meetings - no automatic connections
  // ===========================================================

  // 🎯 Show connection status for students
  useEffect(() => {
    if (!isInstructor && sessionId && user?.id) {
      if (hasJoinedSessionRoom && isSessionConnected) {
        toast.success(`✅ Connected to session! ${participantCount} students online.`);
      } else if (sessionSocketError) {
        toast.error('⚠️ Session connection error. Quiz delivery may be delayed.');
      }
    }
  }, [hasJoinedSessionRoom, isSessionConnected, participantCount, sessionSocketError, isInstructor, sessionId, user?.id]);

  // 🎯 REMOVED: Personalized question polling for students
  // Questions are now delivered via WebSocket events (real-time, no polling needed)
  // This eliminates unnecessary API calls and reduces latency
  // Questions will be received through useSessionSocket hook when student joins

  // When instructor selects a question, prepare UI only — trigger happens on button click only
  useEffect(() => {
    if (activeQuestion && sessionId) {
      questionStartTime.current = Date.now();
      setAnswerSubmitted(false);
      setShowPerformance(false);
      setQuizPerformance(null);
    }
  }, [activeQuestion, sessionId]);

  // 🎯 OPTIMIZED: Performance fetching - on-demand instead of polling
  // Fetch performance when instructor opens performance view (not continuous polling)
  useEffect(() => {
    if (activeQuestion && isInstructor && showPerformance && sessionId) {
      const fetchPerformance = async () => {
        try {
          const performance = await quizService.getQuizPerformance(activeQuestion.id, sessionId);
          console.log('Performance data received:', performance);
          setQuizPerformance(performance);
          
          // Update clusters based on performance
          if (performance.answeredStudents > 0) {
            console.log('Updating clusters based on performance:', performance.correctPercentage);
            const updatedClusters = await clusteringService.updateClusters({
              sessionId: sessionId,
              quizPerformance: {
                questionId: activeQuestion.id,
                correctPercentage: performance.correctPercentage,
              },
            });
            console.log('Clusters updated:', updatedClusters);
            setClusters(updatedClusters);
          }
        } catch (error) {
          console.error('Error fetching performance:', error);
        }
      };
      
      // Fetch once when performance view is opened
      fetchPerformance();
    }
  }, [activeQuestion, isInstructor, showPerformance, sessionId]);

  const [triggerLoading, setTriggerLoading] = useState(false);
  const handleTriggerQuestion = async (question: Question) => {
    if (!sessionId) {
      toast.error('Session ID not found. Please refresh the page.');
      return;
    }
    if (!question || !question.id) {
      toast.error('Invalid question. Please try again.');
      return;
    }
    if (!isInstructor) return;

    if (triggerLoading) return; // Prevent duplicate trigger
    setTriggerLoading(true);
    try {
      const questionPayload = {
        id: question.id,
        question: question.question,
        options: question.options ?? [],
        timeLimit: question.timeLimit ?? 30,
      };
      const result = await quizService.triggerQuestionToSession(sessionId, questionPayload);
      if (result.success) {
        const sentTo = result.sentTo ?? 0;
        toast.success(`Question sent to ${sentTo} student(s) in this meeting.`);
        setActiveQuestion(null);
        setShowQuestions(false);
        setAnswerSubmitted(false);
        setShowPerformance(false);
        setQuizPerformance(null);
      } else {
        toast.error(result.error ?? 'Failed to send question. Make sure students have joined the meeting.');
      }
    } catch (error) {
      console.error('Error triggering question:', error);
      toast.error('Failed to trigger question. Please try again.');
    } finally {
      setTriggerLoading(false);
    }
  };

  const handleQuestionAnswer = async (answerIndex: number) => {
    console.log('Answer submitted:', { answerIndex, activeQuestion, sessionId, user });
    
    if (!activeQuestion) {
      console.error('No active question');
      toast.error('No question is active.');
      return;
    }
    
    if (!sessionId) {
      console.error('No sessionId');
      toast.error('Session ID not found. Please refresh the page.');
      return;
    }
    
    if (!user) {
      console.error('No user');
      toast.error('User not found. Please log in again.');
      return;
    }
    
    const timeTakenMs = Date.now() - questionStartTime.current;
    const timeTakenSeconds = timeTakenMs / 1000;
    setTimeTaken(timeTakenSeconds);
    setAnswerSubmitted(true);
    setSelectedAnswerIndex(answerIndex);

    console.log('Submitting answer to backend...', {
      questionId: activeQuestion.id,
      answerIndex,
      timeTaken: timeTakenSeconds,
      studentId: user.id || 'unknown',
      sessionId,
    });

    try {
      const result = await quizService.submitAnswer({
        questionId: activeQuestion.id,
        answerIndex,
        timeTaken: timeTakenSeconds,
        studentId: user.id || 'unknown',
        sessionId,
      });

      console.log('Answer submission result:', result);
      setIsCorrect(result.isCorrect);
      
      if (result.isCorrect) {
        toast.success('Correct answer! 🎉');
      } else {
        toast.error('Incorrect answer. Keep trying!');
      }

      // For students, show performance after a delay
      if (!isInstructor) {
        console.log('Student answered, will show performance in 2 seconds...');
        setTimeout(async () => {
          try {
            console.log('Fetching performance for student...');
            const performance = await quizService.getQuizPerformance(activeQuestion.id, sessionId);
            console.log('Performance data received:', performance);
            setQuizPerformance(performance);
            setShowPerformance(true);
          } catch (error) {
            console.error('Error fetching performance:', error);
            toast.error('Could not load performance data.');
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      toast.error('Failed to submit answer. Please try again.');
      setAnswerSubmitted(false);
    }
  };

  const handleCloseQuestion = () => {
    setActiveQuestion(null);
    setShowPerformance(false);
    setQuizPerformance(null);
    setAnswerSubmitted(false);
    setIsCorrect(null);
    setSelectedAnswerIndex(null);
  };

  const handleShowPerformance = () => {
    setShowPerformance(true);
  };

  // Debug: Log session info
  useEffect(() => {
    console.log('LiveSession Debug Info:', {
      sessionId,
      user: user?.firstName,
      role: user?.role,
      isInstructor,
      clustersCount: clusters.length,
      hasActiveQuestion: !!activeQuestion
    });
  }, [sessionId, user, isInstructor, clusters.length, activeQuestion]);

  // Show error if no sessionId
  if (!sessionId) {
    return (
      <div className="py-6">
        <Card className="p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Session Not Found</h2>
            <p className="text-gray-600 mb-4">No session ID provided in the URL.</p>
            <Button variant="primary" onClick={() => window.location.href = '/dashboard/sessions'}>
              Go to Sessions
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col" style={{ minHeight: '600px' }}>
      {/* 🔔 Notification Popup for Students */}
      {!isInstructor && currentNotification && (
        <QuestionNotificationPopup
          notification={{
            sessionToken: currentNotification.data.sessionToken,
            question: currentNotification.data.question,
            options: currentNotification.data.options,
            timeLimit: currentNotification.data.timeLimit,
            questionUrl: currentNotification.data.questionUrl,
            instructorName: currentNotification.data.instructorName,
            triggeredAt: currentNotification.data.triggeredAt
          }}
          onClose={clearNotification}
          onAnswer={() => {
            clearNotification();
            // User will be redirected to question page
          }}
        />
      )}

      {/* 📶 Network Warning Popup for Students (no sound) */}
      {!isInstructor && showNetworkWarning && (
        <NetworkWarningPopup
          quality={networkWarningQuality}
          onClose={() => setShowNetworkWarning(false)}
        />
      )}
      
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg flex-shrink-0">
        <div className="px-4 py-4 sm:py-5 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 truncate">
              {session.title}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
              {session.course} • {session.date} • {session.time}
            </p>
            {process.env.NODE_ENV === 'development' && (
              <p className="mt-1 text-xs text-gray-400">Session ID: {sessionId}</p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-0 sm:mt-0">
            <Badge variant={session.status === 'live' ? 'success' : 'default'} className="text-xs">
              {session.status === 'live' ? 'LIVE' : 'RECORDED'}
            </Badge>
            {!isInstructor && (
              <div title={isNotificationConnected ? 'Connected to notifications' : 'Connecting...'}>
                <Badge 
                  variant={isNotificationConnected ? 'success' : 'warning'} 
                  className="text-xs flex items-center gap-1"
                >
                  <span className={`w-2 h-2 rounded-full ${isNotificationConnected ? 'bg-blue-400 animate-pulse' : 'bg-yellow-400'}`}></span>
                  <span className="hidden sm:inline">{isNotificationConnected ? 'Notifications ON' : 'Connecting...'}</span>
                  <span className="sm:hidden">🔔</span>
                </Badge>
              </div>
            )}
            {/* 📶 Connection Quality Indicator */}
            <div title={`Connection: ${connectionQuality} (${currentRtt ? Math.round(currentRtt) : '--'}ms)`}>
              <ConnectionQualityBadge 
                quality={connectionQuality}
                rtt={currentRtt}
                isMonitoring={isLatencyMonitoring}
              />
            </div>
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex items-center">
              <UsersIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              <span className="hidden sm:inline">{session.participants} participants</span>
              <span className="sm:hidden">{session.participants}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Question Display - Full screen on mobile */}
      {activeQuestion && !showPerformance && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4 md:relative md:inset-auto md:z-auto md:bg-transparent md:p-0 md:mt-4">
          <Card className="w-full max-w-2xl border-2 border-indigo-500 max-h-[90vh] overflow-y-auto">
            <div className="p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                <div className="flex items-center space-x-2">
                  <TargetIcon className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Active Question</h3>
                  <Badge variant="danger">LIVE</Badge>
                </div>
                <div className="flex gap-2">
                  {isInstructor && answerSubmitted && (
                    <Button variant="primary" size="sm" onClick={handleShowPerformance} className="w-full sm:w-auto">
                      View Performance
                    </Button>
                  )}
                  {isInstructor && (
                    <Button variant="outline" size="sm" onClick={handleCloseQuestion} className="w-full sm:w-auto">
                      Close Question
                    </Button>
                  )}
                </div>
              </div>
              <TargetedQuiz
                question={{
                  id: activeQuestion.id,
                  question: activeQuestion.question,
                  options: activeQuestion.options,
                  correctAnswer: activeQuestion.correctAnswer,
                  difficulty: activeQuestion.difficulty
                }}
                onAnswer={handleQuestionAnswer}
                timeLimit={activeQuestion.timeLimit}
                isPersonalized={false}
              />
              {answerSubmitted && !isInstructor && activeQuestion && (
                <div className="mt-4 space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    {isCorrect 
                      ? '✅ Great job! Your answer has been recorded.' 
                      : '📝 Your answer has been recorded. Keep learning!'}
                  </p>
                  <div className="text-sm text-gray-700 space-y-2 border-t border-blue-200 pt-3 mt-3">
                    <p className="font-medium text-gray-900">Answer details</p>
                    {selectedAnswerIndex !== null && activeQuestion.options[selectedAnswerIndex] != null && (
                      <p>
                        <span className="text-gray-600">Your answer: </span>
                        <span className={isCorrect ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                          {String.fromCharCode(65 + selectedAnswerIndex)}. {activeQuestion.options[selectedAnswerIndex]}
                        </span>
                      </p>
                    )}
                    {activeQuestion.correctAnswer >= 0 && activeQuestion.options[activeQuestion.correctAnswer] != null && (
                      <p>
                        <span className="text-gray-600">Correct answer: </span>
                        <span className="text-green-700 font-medium">
                          {String.fromCharCode(65 + activeQuestion.correctAnswer)}. {activeQuestion.options[activeQuestion.correctAnswer]}
                        </span>
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-blue-600">
                    Performance statistics will be shown shortly...
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Quiz Performance Display */}
      {activeQuestion && showPerformance && quizPerformance && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4 md:relative md:inset-auto md:z-auto md:bg-transparent md:p-0 md:mt-4">
          <QuizPerformance
            performance={quizPerformance}
            question={{
              id: activeQuestion.id,
              question: activeQuestion.question,
              difficulty: activeQuestion.difficulty
            }}
            onClose={() => {
              setShowPerformance(false);
              if (!isInstructor) {
                handleCloseQuestion();
              }
            }}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden mt-4 gap-4">
        {/* Main content area - video */}
        <div className="flex-1 overflow-auto">
          <div className="relative">
            <div className="bg-gray-800 h-48 sm:h-64 md:h-80 lg:h-96 rounded-lg flex items-center justify-center">
              <div className="text-white text-center">
                <p className="text-lg">Video Stream</p>
                <p className="text-sm text-gray-400">
                  {session.status === 'live' ? 'Live session in progress' : 'Recorded session playback'}
                </p>
              </div>
            </div>
            {/* AI monitoring indicator */}
            <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex items-center bg-black bg-opacity-50 rounded-full px-2 py-1 sm:px-3 text-xs text-white">
              <BrainIcon className="h-3 w-3 mr-1 text-blue-400" />
              <span className="hidden sm:inline">AI monitoring ON</span>
            </div>
            {/* Participant videos */}
            <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 flex space-x-1 sm:space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-12 h-8 sm:w-20 sm:h-14 md:w-24 md:h-16 bg-gray-700 rounded overflow-hidden border-2 border-gray-600">
                  <div className="h-full flex items-center justify-center text-xs text-gray-400">
                    <span className="hidden sm:inline">User {i}</span>
                    <span className="sm:hidden">{i}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="mt-4 flex justify-center flex-wrap gap-2 sm:gap-4">
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2 sm:p-3 rounded-full ${
                audioEnabled
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
              aria-label={audioEnabled ? 'Mute audio' : 'Unmute audio'}
            >
              <MicIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              onClick={() => setVideoEnabled(!videoEnabled)}
              className={`p-2 sm:p-3 rounded-full ${
                videoEnabled
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
              aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              <VideoIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              onClick={() => setHandRaised(!handRaised)}
              className={`p-2 sm:p-3 rounded-full ${
                handRaised
                  ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
              aria-label={handRaised ? 'Lower hand' : 'Raise hand'}
            >
              <HandIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              onClick={() => setShowReactions(!showReactions)}
              className="p-2 sm:p-3 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="Show reactions"
            >
              <SmileIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              className="p-2 sm:p-3 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="Share screen"
            >
              <ShareIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>

          {/* Reactions popup */}
          {showReactions && (
            <div className="mt-2 flex justify-center space-x-3">
              <button
                onClick={() => sendReaction('thumbsup')}
                className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <ThumbsUpIcon className="h-5 w-5 text-yellow-500" />
              </button>
              <button
                onClick={() => sendReaction('clap')}
                className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <span className="text-lg">👏</span>
              </button>
              <button
                onClick={() => sendReaction('smile')}
                className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <span className="text-lg">😊</span>
              </button>
              <button
                onClick={() => sendReaction('confused')}
                className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <span className="text-lg">😕</span>
              </button>
              <button
                onClick={() => sendReaction('heart')}
                className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <span className="text-lg">❤️</span>
              </button>
            </div>
          )}

          {/* Session info */}
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                About this session
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                In this session, we'll explore neural networks, including their
                structure, activation functions, and training methods. We'll
                also discuss practical applications and implementation
                considerations.
              </p>
            </CardContent>
          </Card>

          {/* 📶 Connection Quality Panel */}
          <ConnectionQualityIndicator
            quality={connectionQuality}
            stats={latencyStats}
            currentRtt={currentRtt}
            isMonitoring={isLatencyMonitoring}
            showDetails={false}
            className="mt-4"
          />

          {/* Instructor-only controls */}
          {isInstructor && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                variant={showQuestions ? 'primary' : 'outline'}
                size="sm"
                leftIcon={<TargetIcon className="h-4 w-4" />}
                onClick={() => {
                  setShowQuestions(!showQuestions);
                  if (showQuestions) {
                    setShowAnalytics(false);
                    setShowAIPanel(false);
                  }
                }}
                className="text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">{showQuestions ? 'Hide Questions' : 'Show Questions'}</span>
                <span className="sm:hidden">Questions</span>
              </Button>
              <Button
                variant={showAnalytics ? 'primary' : 'outline'}
                size="sm"
                leftIcon={<BarChart2Icon className="h-4 w-4" />}
                onClick={() => {
            setShowAnalytics(!showAnalytics);
                  if (showAnalytics) {
                    setShowAIPanel(false);
                    setShowQuestions(false);
                  }
                }}
                className="text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">{showAnalytics ? 'Hide Analytics' : 'Show Analytics'}</span>
                <span className="sm:hidden">Analytics</span>
              </Button>
              <Button
                variant={showAIPanel ? 'primary' : 'outline'}
                size="sm"
                leftIcon={<BrainIcon className="h-4 w-4" />}
                onClick={() => {
            setShowAIPanel(!showAIPanel);
                  if (showAIPanel) {
                    setShowAnalytics(false);
                    setShowQuestions(false);
                  }
                }}
                className="text-xs sm:text-sm"
              >
                <span className="hidden sm:inline">{showAIPanel ? 'Hide AI Panel' : 'Show AI Panel'}</span>
                <span className="sm:hidden">AI</span>
              </Button>
            </div>
          )}

          {/* Question Bank Panel (Instructor only) */}
          {showQuestions && isInstructor && (
            <Card className="mt-4 border-2 border-indigo-100 dark:border-indigo-900">
              <CardHeader className="bg-indigo-50 dark:bg-indigo-900">
                <div className="flex justify-between items-center">
                  <h3 className="text-md font-medium text-indigo-900 dark:text-indigo-100 flex items-center">
                    <TargetIcon className="h-4 w-4 mr-2" />
                    Question Bank - Trigger Questions
                  </h3>
                  <Badge variant="info">Ready</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <QuestionBank
                  questions={questionBank}
                  onAddQuestion={() => {/* Navigate to question management */}}
                  onEditQuestion={() => {}}
                  onDeleteQuestion={() => {}}
                  onTriggerQuestion={handleTriggerQuestion}
                  showTriggerButton={true}
                  isTriggerLoading={triggerLoading}
                />
              </CardContent>
            </Card>
          )}

          {/* Analytics panel (instructor only) */}
          {showAnalytics && isInstructor && (
            <Card className="mt-4 border-2 border-indigo-100 dark:border-indigo-900">
                <CardHeader className="bg-indigo-50 dark:bg-indigo-900">
                  <div className="flex justify-between items-center">
                    <h3 className="text-md font-medium text-indigo-900 dark:text-indigo-100">
                      Real-time Engagement Analytics
                    </h3>
                    <Badge variant="info">Live</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Engagement Clusters
                    </h4>
                    <div className="space-y-3">
                    {engagementClusters.map(cluster => (
                      <div key={cluster.name} className="flex items-center">
                          <span className={`h-3 w-3 rounded-full ${cluster.color} mr-2`}></span>
                          <span className="text-sm text-gray-600 dark:text-gray-400 w-32">
                            {cluster.name}
                          </span>
                          <div className="flex-1 mx-2">
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className={`${cluster.color} h-2 rounded-full`}
                              style={{ width: `${cluster.percentage}%` }}
                            ></div>
                            </div>
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {cluster.count} ({cluster.percentage}%)
                          </span>
                      </div>
                    ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Average Attention Score
                      </div>
                      <div className="mt-1 text-xl font-semibold text-indigo-600 dark:text-indigo-400">
                        78%
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Questions Asked
                      </div>
                      <div className="mt-1 text-xl font-semibold text-indigo-600 dark:text-indigo-400">
                        8
                      </div>
                    </div>
                  </div>
                  
                  {/* 📶 Connection Quality Context for Engagement */}
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 flex items-center">
                        <WifiIcon className="h-4 w-4 mr-2" />
                        Network Quality Context
                      </h4>
                      <Badge 
                        variant={connectionQuality === 'excellent' || connectionQuality === 'good' ? 'success' : connectionQuality === 'fair' ? 'warning' : 'danger'}
                        size="sm"
                      >
                        {connectionQuality.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                      Connection quality is monitored to contextualize engagement analysis.
                      Students with poor connections won't be misclassified as disengaged.
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center">
                        <div className="text-blue-600 dark:text-blue-400 font-medium">
                          {currentRtt ? `${Math.round(currentRtt)}ms` : '--'}
                        </div>
                        <div className="text-blue-500 dark:text-blue-300 opacity-75">RTT</div>
                      </div>
                      <div className="text-center">
                        <div className="text-blue-600 dark:text-blue-400 font-medium">
                          {latencyStats.jitter.toFixed(1)}ms
                        </div>
                        <div className="text-blue-500 dark:text-blue-300 opacity-75">Jitter</div>
                      </div>
                      <div className="text-center">
                        <div className="text-blue-600 dark:text-blue-400 font-medium">
                          {latencyStats.stabilityScore.toFixed(0)}%
                        </div>
                        <div className="text-blue-500 dark:text-blue-300 opacity-75">Stability</div>
                      </div>
                    </div>
                    {shouldAdjustEngagement() && (
                      <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs text-yellow-800 dark:text-yellow-200">
                        ⚠️ Poor connection detected. Engagement metrics will be adjusted.
                      </div>
                    )}
                  </div>
                </CardContent>
            </Card>
          )}

          {/* AI Panel (instructor only) */}
          {showAIPanel && isInstructor && (
            <Card className="mt-4 border-2 border-blue-100 dark:border-blue-900">
                <CardHeader className="bg-blue-50 dark:bg-blue-900">
                  <div className="flex justify-between items-center">
                    <h3 className="text-md font-medium text-blue-900 dark:text-blue-100 flex items-center">
                      <BrainIcon className="h-4 w-4 mr-2" />
                      AI Teaching Assistant
                    </h3>
                    <button className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-800">
                      <Settings2Icon className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                  {aiSuggestions.map(suggestion => (
                    <div
                      key={suggestion.id}
                      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                    >
                        <div className="flex items-center mb-2">
                        <Badge
                          variant={suggestion.priority === 'high' ? 'danger' : 'warning'}
                          size="sm"
                        >
                          {suggestion.priority}
                        </Badge>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 capitalize">
                            {suggestion.type}
                          </span>
                        </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                          {suggestion.content}
                        </p>
                        </div>
                  ))}
                  </div>
                  <div className="mt-4 flex">
                  <input
                    type="text"
                    placeholder="Ask AI for teaching suggestions..."
                    className="flex-1 rounded-l-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
                  />
                    <button className="inline-flex items-center px-3 py-2 border border-transparent rounded-r-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                      <ZapIcon className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - chat/participants/questions */}
        <div className="w-full lg:w-80 lg:ml-4 mt-4 lg:mt-0 border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col overflow-hidden max-h-[600px] lg:max-h-none">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex overflow-x-auto">
              <button
                className={`flex-1 py-3 sm:py-4 px-2 sm:px-1 text-center border-b-2 text-xs sm:text-sm font-medium whitespace-nowrap ${
                  activeTab === 'chat'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => setActiveTab('chat')}
              >
                <MessageSquareIcon className="h-4 w-4 sm:h-5 sm:w-5 inline mr-1" />
                Chat
              </button>
              <button
                className={`flex-1 py-3 sm:py-4 px-2 sm:px-1 text-center border-b-2 text-xs sm:text-sm font-medium whitespace-nowrap ${
                  activeTab === 'participants'
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => setActiveTab('participants')}
              >
                <UsersIcon className="h-4 w-4 sm:h-5 sm:w-5 inline mr-1" />
                <span className="hidden sm:inline">Participants</span>
                <span className="sm:hidden">People</span>
              </button>
              {isInstructor && (
                <button
                  className={`flex-1 py-3 sm:py-4 px-2 sm:px-1 text-center border-b-2 text-xs sm:text-sm font-medium whitespace-nowrap ${
                    activeTab === 'questions'
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  onClick={() => setActiveTab('questions')}
                >
                  <TargetIcon className="h-4 w-4 sm:h-5 sm:w-5 inline mr-1" />
                  <span className="hidden sm:inline">Questions</span>
                  <span className="sm:hidden">Q's</span>
                </button>
              )}
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'chat' && (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.map(msg => (
                    <div key={msg.id} className="flex items-start space-x-2">
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${
                          msg.role === 'instructor'
                            ? 'bg-indigo-600'
                            : 'bg-gray-600'
                        }`}
                      >
                          {msg.sender.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {msg.sender}
                          </span>
                          {msg.role === 'instructor' && (
                            <span className="text-xs text-indigo-400">Instructor</span>
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {msg.time}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                          {msg.message}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                  <form onSubmit={handleSendMessage} className="flex space-x-2">
                    <input
                      type="text"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Send
                    </button>
                </form>
                </div>
              </div>
            )}

            {activeTab === 'participants' && (
              <div className="p-4">
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold">
                          U{i}
                    </div>
                        <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Student {i}
                      </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'questions' && isInstructor && (
              <div className="p-4">
              <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Quick Access Questions
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Click a question to trigger it instantly
                  </p>
                </div>
                <div className="space-y-2">
                  {questionBank.map(question => (
                    <button
                      key={question.id}
                      onClick={() => handleTriggerQuestion(question)}
                      className="w-full text-left p-3 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
                          {question.category}
                        </span>
                        <Badge variant={question.difficulty === 'easy' ? 'success' : question.difficulty === 'medium' ? 'warning' : 'danger'} size="sm">
                          {question.difficulty}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                        {question.question}
                        </p>
                      <div className="flex items-center mt-2 text-xs text-indigo-600 dark:text-indigo-400">
                        <TargetIcon className="h-3 w-3 mr-1" />
                        Click to trigger
                      </div>
                  </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
