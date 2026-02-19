import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  User, Mail, Calendar, Shield, Edit,
  Save, X, Settings,
  GraduationCap, Award, TrendingUp, Activity,
  BookOpen, Users, HelpCircle, Clock, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const API_BASE_URL = import.meta.env.VITE_API_URL;

interface ProfileData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: number;
  bio: string;
  phone: string;
  department: string;
  createdAt: string | null;
}

interface ProfileStats {
  [key: string]: number;
}

export const UserProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', bio: '', phone: '', department: '' });
  const [stats, setStats] = useState<ProfileStats>({});

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${sessionStorage.getItem('access_token') || ''}`,
    'Content-Type': 'application/json',
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/profile`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
        setStats(data.stats || {});
        setEditForm({
          firstName: data.profile.firstName,
          lastName: data.profile.lastName,
          bio: data.profile.bio || '',
          phone: data.profile.phone || '',
          department: data.profile.department || '',
        });
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile((prev) => (prev ? { ...prev, ...data.profile } : prev));
        toast.success('Profile updated successfully');
        setIsEditing(false);
      } else {
        toast.error('Failed to update profile');
      }
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setEditForm({
        firstName: profile.firstName,
        lastName: profile.lastName,
        bio: profile.bio || '',
        phone: profile.phone || '',
        department: profile.department || '',
      });
    }
    setIsEditing(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getInitials = () => {
    const f = profile?.firstName || user?.firstName || '';
    const l = profile?.lastName || user?.lastName || '';
    if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
    return 'U';
  };

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

  const role = profile?.role || user?.role || 'student';
  const joinDate = profile?.createdAt;

  if (loading) {
    return (
      <div className="py-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">My Profile</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Header */}
          <Card>
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center space-x-6">
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                    {getInitials()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {displayName}
                    </h2>
                    <div className="flex items-center space-x-2 mt-2">
                      <Badge variant={role === 'admin' ? 'warning' : role === 'instructor' ? 'info' : 'default'}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </Badge>
                      {joinDate && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          Member since {new Date(joinDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {!isEditing ? (
                  <Button
                    variant="outline"
                    leftIcon={<Edit className="h-4 w-4" />}
                    onClick={() => setIsEditing(true)}
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <div className="flex space-x-2">
                    <Button
                      variant="primary"
                      leftIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" leftIcon={<X className="h-4 w-4" />} onClick={handleCancel}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              {/* Bio */}
              {isEditing ? (
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  rows={3}
                  placeholder="Tell us about yourself..."
                />
              ) : (
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {profile?.bio || <span className="italic text-gray-400">No bio added yet.</span>}
                </p>
              )}
            </div>
          </Card>

          {/* Personal Information */}
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                  <User className="h-5 w-5 mr-2 text-indigo-600" />
                  Personal Information
                </h3>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      First Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.firstName}
                        onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100">{profile?.firstName || '-'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Last Name
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.lastName}
                        onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    ) : (
                      <p className="text-gray-900 dark:text-gray-100">{profile?.lastName || '-'}</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center">
                    <Mail className="h-4 w-4 mr-1" />
                    Email Address
                  </label>
                  <p className="text-gray-900 dark:text-gray-100">{profile?.email || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Phone Number
                  </label>
                  {isEditing ? (
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Enter your phone number"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">
                      {profile?.phone || <span className="text-gray-400">Not provided</span>}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center">
                    <GraduationCap className="h-4 w-4 mr-1" />
                    Department
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editForm.department}
                      onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Enter your department"
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">
                      {profile?.department || <span className="text-gray-400">Not provided</span>}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Account Settings */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center mb-6">
                <Settings className="h-5 w-5 mr-2 text-indigo-600" />
                Account Settings
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center">
                    <Shield className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Account Status</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Your account is currently {profile?.status === 1 ? 'active' : 'pending verification'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={profile?.status === 1 ? 'success' : 'warning'}>
                    {profile?.status === 1 ? 'Active' : 'Pending'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Account Created</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {joinDate ? new Date(joinDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Unknown'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Stats & Actions */}
        <div className="space-y-6">
          {/* Statistics */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center">
                <Activity className="h-5 w-5 mr-2 text-indigo-600" />
                Your Statistics
              </h3>
              <div className="space-y-4">
                {role === 'student' && (
                  <>
                    <StatRow icon={GraduationCap} color="indigo" label="Courses Enrolled" value={stats.coursesEnrolled ?? 0} />
                    <StatRow icon={Calendar} color="blue" label="Sessions Attended" value={stats.sessionsAttended ?? 0} />
                    <StatRow icon={HelpCircle} color="purple" label="Questions Attempted" value={stats.quizzesCompleted ?? 0} />
                    <StatRow icon={Award} color="green" label="Average Score" value={`${stats.averageScore ?? 0}%`} />
                    <StatRow icon={Clock} color="orange" label="Total Minutes" value={stats.totalMinutes ?? 0} />
                  </>
                )}
                {role === 'instructor' && (
                  <>
                    <StatRow icon={BookOpen} color="indigo" label="Total Sessions" value={stats.totalSessions ?? 0} />
                    <StatRow icon={GraduationCap} color="blue" label="Total Courses" value={stats.totalCourses ?? 0} />
                    <StatRow icon={Users} color="purple" label="Total Students" value={stats.totalStudents ?? 0} />
                    <StatRow icon={HelpCircle} color="green" label="Questions Created" value={stats.totalQuestions ?? 0} />
                  </>
                )}
                {role === 'admin' && (
                  <>
                    <StatRow icon={Users} color="indigo" label="Total Users" value={stats.totalUsers ?? 0} />
                    <StatRow icon={BookOpen} color="blue" label="Total Sessions" value={stats.totalSessions ?? 0} />
                    <StatRow icon={GraduationCap} color="purple" label="Total Courses" value={stats.totalCourses ?? 0} />
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* Account Actions */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Links</h3>
              <div className="space-y-2">
                {role === 'student' && (
                  <>
                    <Button variant="outline" fullWidth onClick={() => navigate('/dashboard/student/reports')}>
                      My Reports
                    </Button>
                    <Button variant="outline" fullWidth onClick={() => navigate('/dashboard/student/engagement')}>
                      Engagement
                    </Button>
                  </>
                )}
                {(role === 'instructor' || role === 'admin') && (
                  <>
                    <Button variant="outline" fullWidth onClick={() => navigate('/dashboard/instructor/reports')}>
                      Reports
                    </Button>
                    <Button variant="outline" fullWidth onClick={() => navigate('/dashboard/instructor/analytics')}>
                      Analytics
                    </Button>
                  </>
                )}
                <Button variant="outline" fullWidth onClick={() => navigate('/dashboard/sessions')}>
                  Sessions
                </Button>
                <Button variant="danger" fullWidth onClick={handleLogout}>
                  Logout
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const colorMap: Record<string, { bg: string; text: string }> = {
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-600' },
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',     text: 'text-blue-600' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20',  text: 'text-purple-600' },
  green:  { bg: 'bg-green-50 dark:bg-green-900/20',    text: 'text-green-600' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20',  text: 'text-orange-600' },
  yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/20',  text: 'text-yellow-600' },
};

function StatRow({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: string | number;
}) {
  const c = colorMap[color] || colorMap.indigo;
  return (
    <div className={`flex items-center justify-between p-3 ${c.bg} rounded-lg`}>
      <div className="flex items-center">
        <Icon className={`h-5 w-5 ${c.text} mr-3`} />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      </div>
      <span className={`text-lg font-bold ${c.text}`}>{value}</span>
    </div>
  );
}
