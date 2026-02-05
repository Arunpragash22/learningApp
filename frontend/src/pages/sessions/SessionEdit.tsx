import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

import { SessionForm, SessionFormData } from "../../components/sessions/SessionForm";
import { Card } from "../../components/ui/Card";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { toast } from "sonner";

export const SessionEdit = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { user } = useAuth();

  const [initialData, setInitialData] = useState<Partial<SessionFormData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // VITE_API_URL already includes /api, so we check for that
  const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
  const API_BASE = API_URL?.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
  const isInstructor = user?.role === "instructor" || user?.role === "admin";

  // ---------------------------------------
  // Load existing session from backend
  // ---------------------------------------
  useEffect(() => {
    const load = async () => {
      try {
        const apiUrl = `${API_BASE}/api/sessions/${sessionId}`;
        console.log('Fetching session from:', apiUrl);
        
        const res = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem("access_token")}`,
          },
        });

        const data = await res.json();
        console.log('Session data received:', data);

        if (!res.ok) {
          console.error('Failed to load session:', data);
          toast.error(data.detail || "Failed to load session");
          return;
        }

        // Backend returns SessionOut model directly (FastAPI response_model)
        if (!data || !data.title) {
          console.error('Invalid session data received:', data);
          toast.error("Session data is incomplete");
          return;
        }

        setInitialData({
          title: data.title || '',
          course: data.course || '',
          courseCode: data.courseCode || '',
          courseId: data.courseId,
          date: data.date || '',
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          duration: data.duration || '',
          description: data.description || '',
          materials: Array.isArray(data.materials) ? data.materials : [],
        });
      } catch (err) {
        console.error('Error fetching session:', err);
        toast.error("Error fetching session");
      } finally {
        setLoading(false);
      }
    };

    if (sessionId && API_BASE) {
      load();
    } else {
      setLoading(false);
      toast.error("Invalid session ID or API configuration");
    }
  }, [sessionId, API_BASE]);

  if (!isInstructor) {
    return (
      <div className="py-6">
        <Card className="p-6 text-center">
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p>Only instructors can edit sessions.</p>
          <Button onClick={() => navigate("/dashboard/sessions")}>
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-6">
        <Card className="p-6 text-center">
          <div className="animate-spin h-12 w-12 rounded-full border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading session...</p>
        </Card>
      </div>
    );
  }

  if (!initialData) {
    return (
      <div className="py-6">
        <Card className="p-6 text-center">
          <h2 className="text-xl font-semibold">Session not found</h2>
          <Button onClick={() => navigate("/dashboard/sessions")}>
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  // ---------------------------------------
  // Save updated session
  // ---------------------------------------
  const handleSubmit = async (data: SessionFormData) => {
    setSaving(true);

    try {
      // Convert duration string to minutes (e.g., "90 min" -> 90)
      const durationMatch = data.duration.match(/\d+/);
      const durationMinutes = durationMatch ? parseInt(durationMatch[0]) : 90;

      // Prepare the update payload
      const updatePayload = {
        title: data.title,
        course: data.course,
        courseCode: data.courseCode,
        date: data.date,
        time: data.startTime, // Backend uses 'time' field
        startTime: data.startTime,
        endTime: data.endTime,
        durationMinutes: durationMinutes,
        description: data.description,
        materials: data.materials,
      };

      const apiUrl = `${API_BASE}/api/sessions/${sessionId}`;
      console.log('Updating session at:', apiUrl);
      
      const res = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("access_token")}`,
        },
        body: JSON.stringify(updatePayload),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.detail || "Update failed");
        return;
      }

      toast.success("Session updated!");
      navigate("/dashboard/sessions");
    } catch (err) {
      console.error(err);
      toast.error("Error updating session");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-6">
      <Button
        variant="outline"
        leftIcon={<ArrowLeftIcon className="h-4 w-4" />}
        onClick={() => navigate("/dashboard/sessions")}
        className="mb-4"
      >
        Back
      </Button>

      <h1 className="text-2xl font-semibold">Edit Session</h1>

      <SessionForm
        initialData={initialData}
        onSubmit={handleSubmit}
        isLoading={saving}
        onCancel={() => navigate("/dashboard/sessions")}
      />
    </div>
  );
};
