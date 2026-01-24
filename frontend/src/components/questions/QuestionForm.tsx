import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { X, Plus, Trash2 } from 'lucide-react';
import { Question } from './QuestionBank';

interface QuestionFormProps {
  question?: Question | null;
  prefillQuestion?: Question | null;
  prefillCategory?: string | null;
  onSave: (question: Question) => void;
  onCancel: () => void;
}

export const QuestionForm: React.FC<QuestionFormProps> = ({
  question,
  prefillQuestion = null,
  prefillCategory = null,
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = useState<Omit<Question, 'id' | 'createdAt'>>({
    question: question?.question || '',
    options: question?.options || ['', '', '', ''],
    correctAnswer: question?.correctAnswer ?? 0,
    difficulty: question?.difficulty || 'medium',
    category: question?.category || '',
    tags: question?.tags || [],
    timeLimit: question?.timeLimit || 30
  });

  const [newTag, setNewTag] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const padOptions = (options: string[]) => {
    const trimmed = options.filter(opt => opt.trim());
    const padded = [...trimmed];
    while (padded.length < 4) {
      padded.push('');
    }
    return padded.slice(0, 6);
  };

  React.useEffect(() => {
    if (!prefillQuestion || question) return;
    setFormData({
      question: prefillQuestion.question || '',
      options: padOptions(prefillQuestion.options || []),
      correctAnswer: prefillQuestion.correctAnswer ?? 0,
      difficulty: prefillQuestion.difficulty || 'medium',
      category: prefillCategory || prefillQuestion.category || '',
      tags: prefillQuestion.tags || [],
      timeLimit: prefillQuestion.timeLimit || 30
    });
  }, [prefillQuestion, prefillCategory, question]);

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  const addOption = () => {
    if (formData.options.length < 6) {
      setFormData({
        ...formData,
        options: [...formData.options, '']
      });
    }
  };

  const removeOption = (index: number) => {
    if (formData.options.length > 2) {
      const newOptions = formData.options.filter((_, i) => i !== index);
      const newCorrectAnswer = formData.correctAnswer >= newOptions.length 
        ? newOptions.length - 1 
        : formData.correctAnswer;
      setFormData({
        ...formData,
        options: newOptions,
        correctAnswer: newCorrectAnswer
      });
    }
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, newTag.trim()]
      });
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.question.trim()) {
      newErrors.question = 'Question is required';
    }

    if (!formData.category.trim()) {
      newErrors.category = 'Category is required';
    }

    const validOptions = formData.options.filter(opt => opt.trim());
    if (validOptions.length < 2) {
      newErrors.options = 'At least 2 options are required';
    }

    if (formData.correctAnswer < 0 || formData.correctAnswer >= formData.options.length) {
      newErrors.correctAnswer = 'Invalid correct answer selection';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const questionData: Question = {
      id: question?.id || Date.now().toString(),
      ...formData,
      options: formData.options.filter(opt => opt.trim()),
      createdAt: question?.createdAt || new Date().toISOString()
    };

    onSave(questionData);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          {question ? 'Edit Question' : 'Create New Question'}
        </h3>
        <button
          onClick={onCancel}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Question Text */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Question *
          </label>
          <textarea
            value={formData.question}
            onChange={(e) => {
              setFormData({ ...formData, question: e.target.value });
              if (errors.question) setErrors({ ...errors, question: '' });
            }}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
              errors.question ? 'border-red-300' : 'border-gray-300'
            }`}
            rows={3}
            placeholder="Enter your question here..."
          />
          {errors.question && (
            <p className="mt-1 text-sm text-red-600">{errors.question}</p>
          )}
        </div>

        {/* Category and Difficulty */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category *
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => {
                setFormData({ ...formData, category: e.target.value });
                if (errors.category) setErrors({ ...errors, category: '' });
              }}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                errors.category ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="e.g., Neural Networks, Database Design"
            />
            {errors.category && (
              <p className="mt-1 text-sm text-red-600">{errors.category}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Difficulty *
            </label>
            <select
              value={formData.difficulty}
              onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        {/* Options */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Answer Options *
          </label>
          {formData.options.map((option, index) => (
            <div key={index} className="flex items-center space-x-2 mb-2">
              <div className="flex-1 flex items-center">
                <span className="mr-2 font-medium text-gray-700 w-6">
                  {String.fromCharCode(65 + index)}.
                </span>
                <input
                  type="text"
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                />
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="ml-2 p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  disabled={formData.options.length <= 2}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {errors.options && (
            <p className="mt-1 text-sm text-red-600">{errors.options}</p>
          )}
          {formData.options.length < 6 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={addOption}
              className="mt-2"
            >
              Add Option
            </Button>
          )}
        </div>

        {/* Correct Answer */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Correct Answer *
          </label>
          <select
            value={formData.correctAnswer}
            onChange={(e) => {
              setFormData({ ...formData, correctAnswer: parseInt(e.target.value) });
              if (errors.correctAnswer) setErrors({ ...errors, correctAnswer: '' });
            }}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
              errors.correctAnswer ? 'border-red-300' : 'border-gray-300'
            }`}
          >
            {formData.options.map((option, index) => (
              option.trim() && (
                <option key={index} value={index}>
                  {String.fromCharCode(65 + index)}. {option || `Option ${String.fromCharCode(65 + index)}`}
                </option>
              )
            ))}
          </select>
          {errors.correctAnswer && (
            <p className="mt-1 text-sm text-red-600">{errors.correctAnswer}</p>
          )}
        </div>

        {/* Time Limit */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Time Limit (seconds)
          </label>
          <input
            type="number"
            value={formData.timeLimit}
            onChange={(e) => setFormData({ ...formData, timeLimit: parseInt(e.target.value) || 30 })}
            min="5"
            max="300"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {formData.tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-100 text-indigo-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-2 text-indigo-600 hover:text-indigo-800"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex space-x-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Add a tag and press Enter"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addTag}
            >
              Add Tag
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {question ? 'Update Question' : 'Create Question'}
          </Button>
        </div>
      </form>
    </Card>
  );
};

