import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Plus, Edit, Trash2, Search, Target, Clock, Zap, Loader2, Users } from 'lucide-react';

export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  tags: string[];
  timeLimit?: number;
  createdAt: string;
  questionType?: 'generic' | 'cluster';  // Generic = all students, Cluster = specific cluster
  targetCluster?: 'passive' | 'moderate' | 'active';  // Only used when questionType is 'cluster'
}

interface QuestionBankProps {
  questions: Question[];
  onAddQuestion: () => void;
  onEditQuestion: (question: Question) => void;
  onDeleteQuestion: (id: string) => void;
  onTriggerQuestion: (question: Question) => void;
  showTriggerButton?: boolean;
}

export const QuestionBank: React.FC<QuestionBankProps> = ({
  questions,
  onAddQuestion,
  onEditQuestion,
  onDeleteQuestion,
  onTriggerQuestion,
  showTriggerButton = false,
  isTriggerLoading = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuestionType, setSelectedQuestionType] = useState<string>('all');
  const [selectedTargetCluster, setSelectedTargetCluster] = useState<string>('all');

  // Filter questions based on question type and target cluster
  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Filter by question type
    let matchesType = true;
    if (selectedQuestionType === 'generic') {
      matchesType = q.questionType === 'generic' || !q.questionType;
    } else if (selectedQuestionType === 'cluster') {
      matchesType = q.questionType === 'cluster';
    }
    
    // Filter by target cluster (only when cluster type is selected)
    let matchesCluster = true;
    if (selectedQuestionType === 'cluster' && selectedTargetCluster !== 'all') {
      matchesCluster = q.targetCluster === selectedTargetCluster;
    }
    
    return matchesSearch && matchesType && matchesCluster;
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'success';
      case 'medium':
        return 'warning';
      case 'hard':
        return 'danger';
      default:
        return 'default';
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'Passive';
      case 'medium': return 'Moderate';
      case 'hard': return 'Active';
      default: return difficulty;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Question Bank</h3>
          <p className="text-sm text-gray-500">Manage and organize your questions</p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={onAddQuestion}
        >
          Add Question
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search questions..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <select
            value={selectedQuestionType}
            onChange={(e) => {
              setSelectedQuestionType(e.target.value);
              if (e.target.value !== 'cluster') {
                setSelectedTargetCluster('all');
              }
            }}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          >
            <option value="all">All Questions</option>
            <option value="generic">Generic</option>
            <option value="cluster">Cluster-wise</option>
          </select>
          {selectedQuestionType === 'cluster' ? (
            <select
              value={selectedTargetCluster}
              onChange={(e) => setSelectedTargetCluster(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="all">All Clusters</option>
              <option value="passive">Passive (At-Risk)</option>
              <option value="moderate">Moderate</option>
              <option value="active">Active (Highly Engaged)</option>
            </select>
          ) : (
            <div className="block w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-400 sm:text-sm">
              Select "Cluster-wise" to filter by cluster
            </div>
          )}
        </div>
      </Card>

      {/* Questions Grid */}
      {filteredQuestions.length === 0 ? (
        <Card className="p-12 text-center">
          <Target className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No questions found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {questions.length === 0 
              ? 'Get started by adding your first question.'
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {questions.length === 0 && (
            <div className="mt-6">
              <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={onAddQuestion}>
                Add Question
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredQuestions.map((question) => (
            <Card key={question.id} className="p-4 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center flex-wrap gap-2 mb-2">
                    {/* Question Target Badge - show cluster info OR generic */}
                    {question.questionType === 'cluster' ? (
                      <Badge 
                        variant={
                          question.targetCluster === 'passive' ? 'danger' :
                          question.targetCluster === 'moderate' ? 'warning' : 'success'
                        } 
                        size="sm"
                      >
                        <Target className="h-3 w-3 mr-1" />
                        {question.targetCluster === 'passive' && 'Passive'}
                        {question.targetCluster === 'moderate' && 'Moderate'}
                        {question.targetCluster === 'active' && 'Active'}
                      </Badge>
                    ) : (
                      <Badge variant="info" size="sm">
                        <Users className="h-3 w-3 mr-1" />
                        Generic
                      </Badge>
                    )}
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">{question.question}</h4>
                  <div className="space-y-1">
                    {question.options.map((option, index) => (
                      <div key={index} className="flex items-center text-sm text-gray-600">
                        <span className="mr-2 font-medium">
                          {String.fromCharCode(65 + index)}.
                        </span>
                        <span className={index === question.correctAnswer ? 'text-blue-600 font-medium' : ''}>
                          {option}
                          {index === question.correctAnswer && ' ✓'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {question.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {question.tags.map((tag, index) => (
                        <span key={index} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  {question.timeLimit && (
                    <div className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {question.timeLimit}s
                    </div>
                  )}
                </div>
                <div className="flex space-x-2">
                  {showTriggerButton && (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={isTriggerLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      onClick={() => onTriggerQuestion(question)}
                      disabled={isTriggerLoading}
                    >
                      {isTriggerLoading ? 'Sending…' : 'Trigger'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Edit className="h-3 w-3" />}
                    onClick={() => onEditQuestion(question)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Trash2 className="h-3 w-3" />}
                    onClick={() => onDeleteQuestion(question.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

