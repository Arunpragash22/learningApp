import { Question } from '../models/Question.model';
import { QuizAnswer } from '../models/QuizAnswer.model';
import { QuizPerformance } from '../models/QuizPerformance.model';

export class QuizService {
  private answers: Map<string, QuizAnswer[]> = new Map(); // questionId -> answers
  private static instance: QuizService;

  // Initialize with some mock questions
  constructor() {
    if (QuizService.instance) {
      return QuizService.instance;
    }

    // Create mock questions for testing
    Question.create({
      id: '1',
      question: 'What is the primary purpose of backpropagation in neural networks?',
      options: [
        'To initialize weights randomly',
        'To update weights based on error gradients',
        'To add more layers to the network',
        'To visualize the network structure'
      ],
      correctAnswer: 1,
      category: 'Neural Networks',
    });

    Question.create({
      id: '2',
      question: 'Which activation function is commonly used in hidden layers?',
      options: [
        'Sigmoid',
        'ReLU',
        'Linear',
        'Step function'
      ],
      correctAnswer: 1,
      category: 'Neural Networks',
    });

    Question.create({
      id: '3',
      question: 'What is the main advantage of using dropout in neural networks?',
      options: [
        'Increases training speed',
        'Prevents overfitting',
        'Reduces model size',
        'Improves accuracy on all datasets'
      ],
      correctAnswer: 1,
      category: 'Neural Networks',
    });

    QuizService.instance = this;
  }

  async submitAnswer(answer: QuizAnswer) {
    // Store answer
    if (!this.answers.has(answer.questionId)) {
      this.answers.set(answer.questionId, []);
    }
    
    const answerWithTimestamp = {
      ...answer,
      timestamp: new Date(),
    };
    
    this.answers.get(answer.questionId)!.push(answerWithTimestamp);

    // Get question to check correctness
    const question = await Question.findById(answer.questionId);
    const isCorrect = question && answer.answerIndex === question.correctAnswer;

    return {
      success: true,
      isCorrect: isCorrect || false,
    };
  }

  async getPerformance(questionId: string, sessionId: string): Promise<QuizPerformance> {
    const answers = this.answers.get(questionId) || [];
    const sessionAnswers = answers.filter(a => a.sessionId === sessionId);

    if (sessionAnswers.length === 0) {
      return {
        totalStudents: 0,
        answeredStudents: 0,
        correctAnswers: 0,
        averageTime: 0,
        correctPercentage: 0,
        performanceByCluster: [],
        topPerformers: [],
      };
    }

    const question = await Question.findById(questionId);
    if (!question) {
      throw new Error('Question not found');
    }

    const correctAnswers = sessionAnswers.filter(
      a => a.answerIndex === question.correctAnswer
    ).length;

    const averageTime =
      sessionAnswers.reduce((sum, a) => sum + a.timeTaken, 0) / sessionAnswers.length;

    // Get top performers
    const topPerformers = sessionAnswers
      .slice(-10)
      .map(a => ({
        studentName: `Student ${a.studentId.slice(0, 8)}`,
        isCorrect: a.answerIndex === question.correctAnswer,
        timeTaken: a.timeTaken,
      }));

    // Calculate performance by cluster (mock data for now)
    const performanceByCluster: QuizPerformance['performanceByCluster'] = [
      {
        clusterName: 'Active Participants',
        answered: Math.floor(sessionAnswers.length * 0.6),
        correct: Math.floor(correctAnswers * 0.7),
        percentage: 83.3,
      },
      {
        clusterName: 'Moderate Participants',
        answered: Math.floor(sessionAnswers.length * 0.3),
        correct: Math.floor(correctAnswers * 0.25),
        percentage: 62.5,
      },
      {
        clusterName: 'At-Risk Students',
        answered: Math.floor(sessionAnswers.length * 0.1),
        correct: Math.floor(correctAnswers * 0.05),
        percentage: 0,
      },
    ];

    return {
      totalStudents: 32, // TODO: Get from session
      answeredStudents: sessionAnswers.length,
      correctAnswers,
      averageTime,
      correctPercentage: (correctAnswers / sessionAnswers.length) * 100,
      performanceByCluster,
      topPerformers,
    };
  }

  async triggerQuestion(questionId: string, sessionId: string) {
    // Clear previous answers for this question in this session
    const answers = this.answers.get(questionId) || [];
    const filteredAnswers = answers.filter(a => a.sessionId !== sessionId);
    this.answers.set(questionId, filteredAnswers);

    // TODO: Emit Socket.IO event to all students in session
    // io.to(sessionId).emit('question:triggered', { questionId });

    return { success: true };
  }
}

