import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { AccountActivation } from './pages/auth/AccountActivation';
import { StudentDashboard } from './pages/dashboard/StudentDashboard';
import { InstructorDashboard } from './pages/dashboard/InstructorDashboard';
import { AdminDashboard } from './pages/dashboard/AdminDashboard';
import { StudentEngagement } from './pages/dashboard/StudentEngagement';
import { InstructorAnalytics } from './pages/dashboard/InstructorAnalytics';
import { UserProfile } from './pages/profile/UserProfile';
import { QuestionManagement } from './pages/questions/QuestionManagement';
import { CourseList } from './pages/courses/CourseList';
import { CourseDetail } from './pages/courses/CourseDetail';
import { CourseCreate } from './pages/courses/CourseCreate';
import { CourseEdit } from './pages/courses/CourseEdit';
import { CourseManagement } from './pages/courses/CourseManagement';
import { StudentEnrollment } from './pages/courses/StudentEnrollment';
import { SessionList } from './pages/sessions/SessionList';
import { LiveSession } from './pages/sessions/LiveSession';
import { SessionCreate } from './pages/sessions/SessionCreate';
import { SessionEdit } from './pages/sessions/SessionEdit';
import { SessionReport } from './pages/sessions/SessionReport';
import { SessionReports } from './pages/reports/SessionReports';
import { UserManagement } from './pages/admin/UserManagement';
import { InstructorReports } from './pages/instructor/InstructorReports';
import { StudentReports } from './pages/student/StudentReports';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirect root to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        {/* Auth routes */}
        <Route path="/auth" element={<AuthLayout />}>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password/:token" element={<ResetPassword />} />
          <Route path="activate/:token" element={<AccountActivation />} />
        </Route>
        
        {/* Legacy auth routes for backward compatibility */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/activate/:token" element={<AccountActivation />} />
        
        {/* Dashboard routes - Role-based */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/dashboard/student" replace />} />
          
          {/* Student Dashboard */}
          <Route path="student" element={<StudentDashboard />} />
          <Route path="student/home" element={<Navigate to="/dashboard/student" replace />} />
          
          {/* Instructor Dashboard */}
          <Route path="instructor" element={<InstructorDashboard />} />
          <Route path="instructor/home" element={<Navigate to="/dashboard/instructor" replace />} />
          
          {/* Admin Dashboard */}
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="admin/home" element={<Navigate to="/dashboard/admin" replace />} />
          
          {/* Common routes available to all roles */}
          <Route path="courses" element={<CourseList />} />
          <Route path="courses/create" element={<CourseCreate />} />
          <Route path="courses/:courseId/edit" element={<CourseEdit />} />
          <Route path="courses/:courseId" element={<CourseDetail />} />
          <Route path="sessions/create" element={<SessionCreate />} />
          <Route path="sessions/:sessionId/edit" element={<SessionEdit />} />
          <Route path="sessions/:sessionId/report" element={<SessionReport />} />
          <Route path="sessions/:sessionId" element={<LiveSession />} />
          <Route path="sessions" element={<SessionList />} />
          
          {/* Student-specific routes */}
          <Route path="student/engagement" element={<StudentEngagement />} />
          <Route path="student/enrollment" element={<StudentEnrollment />} />
          <Route path="student/reports" element={<StudentReports />} />
          
          {/* Instructor-specific routes */}
          <Route path="instructor/analytics" element={<InstructorAnalytics />} />
          <Route path="instructor/questions" element={<QuestionManagement />} />
          <Route path="instructor/courses" element={<CourseManagement />} />
          <Route path="instructor/reports" element={<InstructorReports />} />
          
          {/* Admin-specific routes */}
          <Route path="admin/users" element={<UserManagement />} />
          <Route path="instructor/users" element={<UserManagement />} />
          
          {/* Common routes */}
          <Route path="profile" element={<UserProfile />} />
          <Route path="reports" element={<SessionReports />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
