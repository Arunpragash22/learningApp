import { useState, useEffect } from 'react';
import { QuestionBank, Question } from '../../components/questions/QuestionBank';
import { QuestionForm } from '../../components/questions/QuestionForm';
import { Card } from '../../components/ui/Card';
import { BookOpenIcon, TargetIcon, LayersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { questionService, CreateQuestionData } from '../../services/questionService';
import { courseService, type Course } from '../../services/courseService';

export const QuestionManagement = () => {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [prefillQuestion, setPrefillQuestion] = useState<Question | null>(null);
  const [prefillCategory, setPrefillCategory] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [instructorCourses, setInstructorCourses] = useState<Course[]>([]);

  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  useEffect(() => {
    if (!isInstructor) return;
    courseService.getMyCourses().then((res) => {
      if (res.success && res.courses) setInstructorCourses(res.courses);
    }).catch(() => {});
  }, [isInstructor]);

  useEffect(() => {
    loadQuestions();
  }, [selectedCourseId]);

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      const courseId = selectedCourseId || undefined;
      const fetchedQuestions = await questionService.getAllQuestions(courseId);
      const normalized = fetchedQuestions.map((q) => ({
        ...q,
        createdAt: q.createdAt || new Date().toISOString()
      })) as Question[];
      setQuestions(normalized);
    } catch (error) {
      console.error('Error loading questions:', error);
      toast.error('Failed to load questions. Please try again.');
      setQuestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddQuestion = () => {
    setEditingQuestion(null);
    setPrefillQuestion(null);
    setPrefillCategory(null);
    setShowForm(true);
  };

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setPrefillQuestion(null);
    setPrefillCategory(null);
    setShowForm(true);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      try {
        await questionService.deleteQuestion(id);
        toast.success('Question deleted successfully');
        // Reload questions from API
        await loadQuestions();
      } catch (error) {
        console.error('Error deleting question:', error);
        toast.error('Failed to delete question. Please try again.');
      }
    }
  };

  const handleSaveQuestion = async (question: Question) => {
    
    try {
      console.log('📝 Saving question:', question);
      
      const questionData: CreateQuestionData = {
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        difficulty: question.difficulty,
        category: question.category,
        tags: question.tags,
        timeLimit: question.timeLimit,
        courseId: editingQuestion?.courseId ?? (selectedCourseId || undefined),
        questionType: question.questionType,
        targetCluster: question.targetCluster,
      };

      if (editingQuestion) {
        // Update existing question
        await questionService.updateQuestion(question.id, questionData);
        toast.success('Question updated successfully');
      } else {
        // Create new question
        // MongoDB will automatically create the database and collection
        console.log('📝 Creating new question...');
        await questionService.createQuestion(questionData);
        console.log('✅ Question created successfully');
        toast.success('Question created successfully');
      }
      
      // Reload questions from API
      await loadQuestions();
      setShowForm(false);
      setEditingQuestion(null);
      setPrefillQuestion(null);
      setPrefillCategory(null);
    } catch (error: any) {
      console.error('❌ Error saving question:', error);
      
      // Extract detailed error message
      let errorMessage = editingQuestion 
        ? 'Failed to update question.' 
        : 'Failed to create question.';
      
      if (error?.message) {
        errorMessage += ` ${error.message}`;
      }
      
      // Show specific error details if available
      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      
      console.error('📝 Error details:', errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingQuestion(null);
    setPrefillQuestion(null);
    setPrefillCategory(null);
  };

  // Statistics
  const stats = {
    total: questions.length,
    byCategory: questions.reduce((acc, q) => {
      acc[q.category] = (acc[q.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byDifficulty: {
      easy: questions.filter(q => q.difficulty === 'easy').length,
      medium: questions.filter(q => q.difficulty === 'medium').length,
      hard: questions.filter(q => q.difficulty === 'hard').length
    }
  };

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Question Bank Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create, organize, and manage questions by category for your courses
        </p>
        {isInstructor && instructorCourses.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <label htmlFor="question-course" className="text-sm font-medium text-gray-700">Course:</label>
            <select
              id="question-course"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 max-w-xs"
            >
              <option value="">All my questions</option>
              {instructorCourses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <span className="text-sm text-gray-500">
              {selectedCourseId ? 'Showing questions for this course' : 'Showing all your questions'}
            </span>
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Questions</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-lg">
              <TargetIcon className="h-6 w-6 text-indigo-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Categories</p>
              <p className="text-2xl font-bold text-gray-900">
                {Object.keys(stats.byCategory).length}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <LayersIcon className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Passive</p>
              <p className="text-2xl font-bold text-gray-900">{stats.byDifficulty.easy}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <BookOpenIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Moderate</p>
              <p className="text-2xl font-bold text-gray-900">{stats.byDifficulty.medium}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <BookOpenIcon className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-gray-900">{stats.byDifficulty.hard}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <BookOpenIcon className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Question Form or Question Bank */}
      {showForm ? (
        <QuestionForm
          question={editingQuestion}
          prefillQuestion={prefillQuestion}
          prefillCategory={prefillCategory}
          onSave={handleSaveQuestion}
          onCancel={handleCancel}
        />
      ) : (
        isLoading ? (
          <Card className="p-12 text-center">
            <p className="text-gray-500">Loading questions...</p>
          </Card>
        ) : (
          <QuestionBank
            questions={questions}
            onAddQuestion={handleAddQuestion}
            onEditQuestion={handleEditQuestion}
            onDeleteQuestion={handleDeleteQuestion}
            onTriggerQuestion={() => {
              // Could navigate to a live session with this question pre-loaded
              toast.info('Navigate to a live session to trigger questions');
            }}
            showTriggerButton={false}
          />
        )
      )}
    </div>
  );
};

