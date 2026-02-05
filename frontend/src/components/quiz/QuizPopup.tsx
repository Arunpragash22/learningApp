/**
 * Shared quiz popup for instructor-triggered questions.
 * Used globally (DashboardLayout) so students receive questions on any page.
 */
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";

export interface QuizPopupProps {
  quiz: any;
  onClose: () => void;
  onAnswerSubmitted?: (isCorrect: boolean) => void;
  networkStrength?: {
    quality: string;
    rttMs: number | null;
    jitterMs?: number;
  };
}

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Play notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create oscillator for a pleasant notification tone
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Two-tone notification sound
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    oscillator.frequency.setValueAtTime(1108.73, audioContext.currentTime + 0.1); // C#6
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2); // A5
    
    oscillator.type = 'sine';
    
    // Envelope for smooth sound
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.12);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch (err) {
    console.log("Could not play notification sound:", err);
  }
};

export const QuizPopup: React.FC<QuizPopupProps> = ({
  quiz,
  onClose,
  onAnswerSubmitted,
  networkStrength,
}) => {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState<number>(quiz?.timeLimit || 30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const soundPlayedRef = useRef(false);

  // Play notification sound when quiz arrives
  useEffect(() => {
    if (quiz && !soundPlayedRef.current) {
      soundPlayedRef.current = true;
      playNotificationSound();
    }
  }, [quiz]);

  useEffect(() => {
    if (timeLeft <= 0) {
      onClose();
      return;
    }
    const interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timeLeft, onClose]);

  const handleAnswerClick = async (answerIndex: number) => {
    if (isSubmitting || hasSubmitted) return;
    setIsSubmitting(true);

    try {
      const payload = {
        questionId: quiz?.questionId || quiz?.question_id || "UNKNOWN",
        answerIndex,
        timeTaken: (quiz?.timeLimit || 30) - timeLeft,
        studentId: user?.id || quiz?.studentId || "UNKNOWN",
        sessionId: quiz?.sessionId || quiz?.session_id || "GLOBAL",
        networkStrength: networkStrength
          ? {
              quality: networkStrength.quality,
              rttMs: networkStrength.rttMs != null ? Math.round(networkStrength.rttMs) : null,
              jitterMs: networkStrength.jitterMs != null ? Math.round(networkStrength.jitterMs) : undefined,
            }
          : null,
      };

      const res = await fetch(`${API_BASE_URL}/api/quiz/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Submit failed:", text);
        alert("❌ Failed to submit answer");
      } else {
        const data = await res.json();
        alert(data.isCorrect ? "✅ Correct!" : "❌ Incorrect");
        onAnswerSubmitted?.(data.isCorrect);
      }

      setHasSubmitted(true);
      onClose();
    } catch (err) {
      console.error("Submit error:", err);
      alert("❌ Error submitting answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!quiz) return null;

  const options = quiz.options || quiz.answers || [];
  const questionText = quiz.question || quiz.text || "No question text";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[100]">
      <div className="bg-white p-6 rounded-lg w-96 max-w-[90vw] shadow-lg">
        <h2 className="text-lg font-bold mb-3">📝 New Quiz</h2>
        <p className="font-medium mb-4 text-gray-800">{questionText}</p>

        <div className="space-y-2">
          {options.length > 0 ? (
            options.map((op: string, i: number) => (
              <button
                key={i}
                className="w-full p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
                disabled={isSubmitting || hasSubmitted}
                onClick={() => handleAnswerClick(i)}
              >
                <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
                {op}
              </button>
            ))
          ) : (
            <p className="text-red-500 text-sm">⚠️ No options available</p>
          )}
        </div>

        <div className="mt-4 flex justify-between items-center text-sm text-gray-600">
          <span>
            Time Left: <span className={`font-bold ${timeLeft <= 10 ? "text-red-500" : ""}`}>{timeLeft}s</span>
          </span>
          {isSubmitting && <span className="text-blue-600">Sending...</span>}
        </div>

        <button
          className="mt-4 w-full p-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};
