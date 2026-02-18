import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  clusterTarget?: string;
}

interface TargetedQuizProps {
  question: QuizQuestion;
  onAnswer: (answerIndex: number) => void;
  timeLimit?: number;
  isPersonalized?: boolean;
}

export const TargetedQuiz: React.FC<TargetedQuizProps> = ({
  question,
  onAnswer,
  timeLimit = 30,
  isPersonalized = false
}) => {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(timeLimit);
  const [isAnswered, setIsAnswered] = useState(false);

  React.useEffect(() => {
    if (timeRemaining > 0 && !isAnswered) {
      const timer = setTimeout(() => {
        setTimeRemaining(timeRemaining - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeRemaining === 0 && !isAnswered) {
      setIsAnswered(true);
      onAnswer(-1); // Timeout
    }
  }, [timeRemaining, isAnswered, onAnswer]);

  const handleAnswer = (index: number) => {
    if (isAnswered) return;
    setSelectedAnswer(index);
    setIsAnswered(true);
    onAnswer(index);
  };

  const isCorrect = selectedAnswer === question.correctAnswer;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            {isPersonalized && (
              <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded">
                Personalized
              </span>
            )}
            {question.clusterTarget && (
              <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded">
                For: {question.clusterTarget}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 text-gray-600">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">
              {timeRemaining}s
            </span>
          </div>
        </div>

        {/* Question */}
        <h3 className="text-lg font-semibold text-gray-900 mb-6">
          {question.question}
        </h3>

        {/* Options */}
        <div className="space-y-3 mb-6">
          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            const showCorrect = isAnswered && index === question.correctAnswer;
            const showIncorrect = isAnswered && isSelected && !isCorrect;

            return (
              <button
                key={index}
                onClick={() => handleAnswer(index)}
                disabled={isAnswered}
                className={`
                  w-full text-left p-4 rounded-lg border-2 transition-all
                  ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}
                  ${showCorrect ? 'border-blue-500 bg-blue-50' : ''}
                  ${showIncorrect ? 'border-red-500 bg-red-50' : ''}
                  ${isAnswered ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}
                `}
              >
                <div className="flex items-center justify-between">
                  <span className="text-gray-900">{option}</span>
                  {showCorrect && (
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                  )}
                  {showIncorrect && (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {isAnswered && (
          <div className={`p-4 rounded-lg ${
            isCorrect ? 'bg-blue-50 border border-blue-200' : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-start space-x-2">
              {isCorrect ? (
                <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
              )}
              <div>
                <p className={`font-medium ${
                  isCorrect ? 'text-blue-800' : 'text-red-800'
                }`}>
                  {isCorrect ? 'Correct!' : 'Incorrect'}
                </p>
                {!isCorrect && (
                  <p className="text-sm text-red-700 mt-1">
                    The correct answer is: {question.options[question.correctAnswer]}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

