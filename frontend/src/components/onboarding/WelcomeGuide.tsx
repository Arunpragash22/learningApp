import React, { useState } from "react";
import {
  BookOpenIcon,
  CalendarIcon,
  TargetIcon,
  UsersIcon,
  ActivityIcon,
  BarChart3Icon,
  ChevronRightIcon,
  ChevronLeftIcon,
  CheckCircleIcon,
  GraduationCapIcon,
  XIcon,
} from "lucide-react";

interface GuideStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  tip?: string;
}

const instructorSteps: GuideStep[] = [
  {
    icon: <GraduationCapIcon className="h-10 w-10 text-blue-500" />,
    title: "Welcome to ClassPulse!",
    description:
      "ClassPulse helps you monitor student engagement in real-time during your sessions and deliver personalized quiz questions based on each student's participation level.",
    tip: "Let's walk you through the key features.",
  },
  {
    icon: <BookOpenIcon className="h-10 w-10 text-indigo-500" />,
    title: "Create a Course",
    description:
      "Start by creating a course from the Courses page. Give it a name, description, and enroll your students. Each course can have multiple sessions.",
    tip: 'Go to Courses → Click "Create Course" to get started.',
  },
  {
    icon: <CalendarIcon className="h-10 w-10 text-green-500" />,
    title: "Schedule Sessions",
    description:
      "Inside each course, create sessions (meetings) with a start time, end time, and Zoom link. You can also choose to copy cluster questions from previous sessions.",
    tip: "Set the session duration carefully — it determines how many questions are needed.",
  },
  {
    icon: <TargetIcon className="h-10 w-10 text-orange-500" />,
    title: "Add Questions",
    description:
      "Create two types of questions: Generic (sent to everyone first) and Cluster-wise (Passive, Moderate, Active — sent based on student engagement level). Make sure you have enough questions for the session duration.",
    tip: 'Use the Questions page or add them directly inside a session.',
  },
  {
    icon: <UsersIcon className="h-10 w-10 text-purple-500" />,
    title: "Start a Meeting",
    description:
      "When it's time, start the meeting from the Sessions page. Enable Real-Time Analytics and Auto-Trigger Questions. Set the time gap between questions — the system will calculate how many rounds are needed.",
    tip: "The first question is always generic. After students respond, the system clusters them and sends personalized questions.",
  },
  {
    icon: <BarChart3Icon className="h-10 w-10 text-rose-500" />,
    title: "View Analytics & Reports",
    description:
      "During the session, monitor live engagement analytics. After the session, view detailed reports showing student clusters, quiz performance, and engagement trends.",
    tip: "Check the Analytics and Reports pages for comprehensive insights.",
  },
];

const studentSteps: GuideStep[] = [
  {
    icon: <GraduationCapIcon className="h-10 w-10 text-blue-500" />,
    title: "Welcome to ClassPulse!",
    description:
      "ClassPulse helps you stay engaged during live sessions. Your instructor will send quiz questions during meetings, and you'll receive personalized questions based on your participation.",
    tip: "Let's show you how it works.",
  },
  {
    icon: <BookOpenIcon className="h-10 w-10 text-indigo-500" />,
    title: "Enroll in Courses",
    description:
      "Browse available courses and enroll in the ones your instructor has set up. Once enrolled, you'll see upcoming sessions and be able to join meetings.",
    tip: "Go to Courses to see what's available.",
  },
  {
    icon: <CalendarIcon className="h-10 w-10 text-green-500" />,
    title: "Join Live Sessions",
    description:
      "When a session is live, join it from the Meetings page. Stay connected — the system tracks your engagement to personalize your learning experience.",
    tip: "Make sure to join on time and keep the tab active during the meeting.",
  },
  {
    icon: <TargetIcon className="h-10 w-10 text-orange-500" />,
    title: "Answer Quiz Questions",
    description:
      "During the session, quiz questions will pop up automatically. Answer them quickly and accurately — your response time and correctness are tracked to help tailor questions to your level.",
    tip: "Don't worry about getting every answer right — the goal is to keep you engaged!",
  },
  {
    icon: <ActivityIcon className="h-10 w-10 text-purple-500" />,
    title: "Track Your Engagement",
    description:
      "Visit My Engagement to see your cluster (Active, Moderate, or Passive), quiz performance, correct answers, and average response time. Use this to improve your participation.",
    tip: "Check your engagement dashboard regularly to see your progress.",
  },
];

interface WelcomeGuideProps {
  role: "student" | "instructor" | "admin";
  firstName: string;
  onComplete: () => void;
}

export const WelcomeGuide: React.FC<WelcomeGuideProps> = ({
  role,
  firstName,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const steps = role === "student" ? studentSteps : instructorSteps;
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
          {/* Skip button */}
          <button
            onClick={onComplete}
            className="absolute top-4 right-4 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
            title="Skip guide"
          >
            <XIcon className="h-5 w-5" />
          </button>

          {/* Progress bar */}
          <div className="h-1 bg-gray-100 dark:bg-gray-700">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
              style={{
                width: `${((currentStep + 1) / steps.length) * 100}%`,
              }}
            />
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Step counter */}
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Step {currentStep + 1} of {steps.length}
              </span>
              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentStep(i)}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === currentStep
                        ? "w-6 bg-blue-500"
                        : i < currentStep
                        ? "w-2 bg-blue-300 dark:bg-blue-700"
                        : "w-2 bg-gray-200 dark:bg-gray-600"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Icon */}
            <div className="flex justify-center mb-5">
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-700/50">
                {step.icon}
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-center text-gray-900 dark:text-gray-100 mb-3">
              {isFirst
                ? `Hi ${firstName}! ${step.title}`
                : step.title}
            </h2>

            {/* Description */}
            <p className="text-sm text-center text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
              {step.description}
            </p>

            {/* Tip */}
            {step.tip && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3 mb-6">
                <p className="text-xs text-blue-700 dark:text-blue-300 text-center">
                  <span className="font-semibold">Tip:</span> {step.tip}
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {!isFirst && (
                <button
                  onClick={() => setCurrentStep((s) => s - 1)}
                  className="flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                  Back
                </button>
              )}
              <button
                onClick={() => {
                  if (isLast) {
                    onComplete();
                  } else {
                    setCurrentStep((s) => s + 1);
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all shadow-md"
              >
                {isLast ? (
                  <>
                    <CheckCircleIcon className="h-4 w-4" />
                    Get Started
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRightIcon className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
