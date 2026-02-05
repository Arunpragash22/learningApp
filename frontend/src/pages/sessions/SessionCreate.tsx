// src/pages/sessions/SessionCreate.tsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

import { SessionForm, SessionFormData } from "../../components/sessions/SessionForm";
import { Card } from "../../components/ui/Card";
import { ArrowLeftIcon, KeyIcon, CopyIcon, CheckIcon, XIcon } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { toast } from "sonner";

export const SessionCreate = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showEnrollmentKey, setShowEnrollmentKey] = useState(false);
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [createdSessionTitle, setCreatedSessionTitle] = useState("");
  const [copied, setCopied] = useState(false);

  // VITE_API_URL already includes /api, so we check for that
  const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  const API_BASE = API_URL?.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;

  const isInstructor = user?.role === "instructor" || user?.role === "admin";

  if (!isInstructor) {
    return (
      <div className="py-6">
        <Card className="p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">Only instructors can create meetings.</p>
            <Button variant="primary" onClick={() => navigate("/dashboard/sessions")}>
              Go to Meetings
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Generate a random enrollment key
  const generateEnrollmentKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 8; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const handleSubmit = async (data: SessionFormData) => {
    setIsLoading(true);
  
    try {
      // Parse duration from "120 min" to 120
      const durationMatch = data.duration.match(/\d+/);
      const durationMinutes = durationMatch ? parseInt(durationMatch[0]) : 60;
      
      // Generate enrollment key for standalone sessions
      const sessionEnrollmentKey = generateEnrollmentKey();
      
      const payload = {
        title: data.title,
        course: data.title,                 // Use title as course name for standalone
        courseCode: "STANDALONE",           // Generic code for standalone sessions
        courseId: null,                     // No course link for standalone
        date: data.date,                    // "2025-11-25"
        time: data.startTime,               // use startTime ONLY (backend expects 1 time)
        startTime: data.startTime,          // Store start time separately
        endTime: data.endTime,              // Store end time separately
        durationMinutes: durationMinutes,
        timezone: "Asia/Colombo",
        description: data.description || '',
        materials: data.materials || [],
        isStandalone: true,                 // Mark as standalone session
        enrollmentKey: sessionEnrollmentKey // Enrollment key for this session
      };
  
      console.log("📤 Sending session create payload:", payload);
  
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("access_token")}`
        },
        body: JSON.stringify(payload)
      });
  
      if (!res.ok) {
        const result = await res.json().catch(() => ({ detail: "Unknown error" }));
        console.error("❌ Backend error:", result);
        const errorMsg = result.detail || `Failed to create session (${res.status})`;
        toast.error(errorMsg);
        return;
      }
  
      const result = await res.json();
      console.log("✅ Backend created session:", result);
      
      // Store the enrollment key and show the modal
      setEnrollmentKey(result.enrollmentKey || sessionEnrollmentKey);
      setCreatedSessionTitle(data.title);
      setShowEnrollmentKey(true);
      toast.success("Session created successfully!");
  
    } catch (err: any) {
      console.error("❌ Error creating session:", err);
      toast.error(err.message || "Failed to create session");
    } finally {
      setIsLoading(false);
    }
    
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(enrollmentKey);
    setCopied(true);
    toast.success("Enrollment key copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseModal = () => {
    setShowEnrollmentKey(false);
    navigate("/dashboard/sessions");
  };

  return (
    <div className="py-6">
      {/* Enrollment Key Modal */}
      {showEnrollmentKey && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <KeyIcon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Meeting Created!</h2>
                    <p className="text-sm text-green-100">Share this key with students</p>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="p-1 rounded-full hover:bg-white/20 transition-colors"
                >
                  <XIcon className="h-5 w-5 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-1">Meeting Title:</p>
                <p className="text-lg font-semibold text-gray-900">{createdSessionTitle}</p>
              </div>

              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center mb-4">
                <p className="text-sm text-gray-500 mb-2">Enrollment Key</p>
                <div className="flex items-center justify-center space-x-3">
                  <span className="text-3xl font-mono font-bold text-indigo-600 tracking-wider">
                    {enrollmentKey}
                  </span>
                  <button
                    onClick={handleCopyKey}
                    className={`p-2 rounded-lg transition-all ${
                      copied
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <CheckIcon className="h-5 w-5" />
                    ) : (
                      <CopyIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-800">
                  <strong>Important:</strong> Share this enrollment key with students who need to join this session. 
                  They will need to enter this key to access the session.
                </p>
              </div>

              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  onClick={handleCopyKey}
                  className="flex-1"
                  leftIcon={copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                >
                  {copied ? 'Copied!' : 'Copy Key'}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCloseModal}
                  className="flex-1"
                >
                  Go to Sessions
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Button
          variant="outline"
          leftIcon={<ArrowLeftIcon className="h-4 w-4" />}
          onClick={() => navigate("/dashboard/sessions")}
          className="mb-4"
        >
          Back to Meetings
        </Button>

        <h1 className="text-2xl font-semibold text-gray-900">Create Standalone Meeting</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a standalone meeting with its own enrollment key. Students will need this key to join.
        </p>
      </div>

      <SessionForm
        onSubmit={handleSubmit}
        onCancel={() => navigate("/dashboard/sessions")}
        isLoading={isLoading}
        mode="standalone"
      />
    </div>
  );
};
