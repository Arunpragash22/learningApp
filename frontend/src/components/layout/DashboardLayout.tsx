import React, { useState, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSessionConnection } from '../../context/SessionConnectionContext';
import { QuizPopup } from '../quiz/QuizPopup';
import { Footer } from './Footer';
import { BookOpenIcon, CalendarIcon, MenuIcon, XIcon, HomeIcon, GraduationCapIcon, BellIcon, LogOutIcon, BarChart3Icon, ActivityIcon, TargetIcon, KeyIcon, ChevronDownIcon } from 'lucide-react';

export const DashboardLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, isLoading } = useAuth();
  const { incomingQuiz, clearIncomingQuiz, markQuestionAnswered } = useSessionConnection();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const isStudent = user?.role === 'student';

  // Get dashboard route based on user role
  const getDashboardRoute = () => {
    if (user?.role) {
      return `/dashboard/${user.role}`;
    }
    return '/dashboard/student';
  };

  // Get user initials for avatar
  const userInitials = useMemo(() => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return 'U';
  }, [user]);

  // Navigation items based on user role
  const navigationItems = useMemo(() => {
    const baseItems = [
      {
        name: 'Dashboard',
        href: getDashboardRoute(),
        icon: HomeIcon
      },
      {
        name: 'Courses',
        href: '/dashboard/courses',
        icon: BookOpenIcon
      },
      {
        name: 'Meetings',
        href: '/dashboard/sessions',
        icon: CalendarIcon
      }
    ];

    // Add role-specific items
    if (user?.role === 'student') {
      baseItems.push({
        name: 'My Engagement',
        href: '/dashboard/student/engagement',
        icon: ActivityIcon
      });
    }

    if (user?.role === 'instructor' || user?.role === 'admin') {
      baseItems.push({
        name: 'Analytics',
        href: '/dashboard/instructor/analytics',
        icon: BarChart3Icon
      });
      baseItems.push({
        name: 'Questions',
        href: '/dashboard/instructor/questions',
        icon: TargetIcon
      });
    }

    return baseItems;
  }, [user?.role]);

  const handleLogout = () => {
    // Show custom confirmation modal
    setShowLogoutModal(true);
    setUserMenuOpen(false);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
    navigate('/login');
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  // Check if current path matches the item
  const isActive = (href: string) => {
    if (href === getDashboardRoute()) {
      return location.pathname === href || location.pathname === `${href}/home`;
    }
    return location.pathname.startsWith(href);
  };

  // Check if profile is active
  const isProfileActive = location.pathname === '/dashboard/profile';

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3B82F6] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  // Save the intended URL so we can redirect back after login
  if (!isAuthenticated) {
    const intendedPath = location.pathname + location.search;
    return <Navigate to="/login" state={{ from: intendedPath }} replace />;
  }

  return (
    <div className="min-h-screen bg-[#eff6ff] dark:bg-gray-900 flex flex-col">
      {/* Top Navigation Bar */}
      <nav className="bg-gradient-to-r from-[#3B82F6] via-[#2563eb] to-[#1d4ed8] shadow-lg fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo/Brand */}
            <div className="flex items-center">
              <Link to={getDashboardRoute()} className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                  <GraduationCapIcon className="h-6 w-6 text-white" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-lg font-bold text-white">ClassPulse</h1>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation Links */}
            <div className="hidden lg:flex items-center space-x-1">
              {navigationItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`
                    flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                    ${
                      isActive(item.href)
                        ? 'bg-white/20 text-white shadow-md backdrop-blur-sm'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }
                  `}
                >
                  <item.icon className="h-4 w-4 mr-2" />
                  <span>{item.name}</span>
                </Link>
              ))}
            </div>

            {/* Right Side - User Menu & Notifications */}
            <div className="flex items-center space-x-2">
              {/* Notifications */}
              <button
                className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors"
                aria-label="View notifications"
              >
                <BellIcon className="h-5 w-5" />
              </button>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 p-2 rounded-lg bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-white/30 flex items-center justify-center text-white font-semibold text-sm border border-white/40">
                    {userInitials}
                  </div>
                  <span className="hidden md:block text-sm font-medium text-white">
                    {user?.firstName}
                  </span>
                  <ChevronDownIcon className="hidden md:block h-4 w-4 text-white/70" />
                </button>

                {/* User Dropdown */}
                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setUserMenuOpen(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-56 rounded-xl shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20 overflow-hidden">
                      <div className="py-1">
                        {/* User Info */}
                        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                          <p className="text-sm font-semibold text-gray-900">
                            {user?.firstName} {user?.lastName}
                          </p>
                          <p className="text-xs text-gray-500 capitalize mt-1">
                            {user?.role || 'User'}
                          </p>
                        </div>

                        {/* Profile Link */}
                        <Link
                          to="/dashboard/profile"
                          onClick={() => setUserMenuOpen(false)}
                          className={`block px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                            isProfileActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                          }`}
                        >
                          View Profile
                        </Link>

                        {/* Logout */}
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 transition-colors"
                        >
                          <LogOutIcon className="h-4 w-4" />
                          <span>Logout</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors"
              >
                {mobileMenuOpen ? (
                  <XIcon className="h-6 w-6" />
                ) : (
                  <MenuIcon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/20">
            <div className="px-4 py-3 space-y-1 bg-gradient-to-r from-[#3B82F6] via-[#2563eb] to-[#1d4ed8]">
              {navigationItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center px-3 py-3 rounded-lg text-base font-medium transition-all duration-200
                    ${
                      isActive(item.href)
                        ? 'bg-white/20 text-white shadow-md'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }
                  `}
                >
                  <item.icon className="h-5 w-5 mr-3" />
                  <span>{item.name}</span>
                  {isActive(item.href) && (
                    <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  )}
                </Link>
              ))}

              {/* Mobile Profile Link */}
              <Link
                to="/dashboard/profile"
                onClick={() => setMobileMenuOpen(false)}
                className={`
                  flex items-center px-3 py-3 rounded-lg text-base font-medium transition-all duration-200 mt-2 border-t border-white/20 pt-4
                  ${
                    isProfileActive
                      ? 'bg-white/20 text-white shadow-md'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }
                `}
              >
                <div className="h-8 w-8 rounded-full bg-white/30 flex items-center justify-center text-white font-semibold text-sm mr-3">
                  {userInitials}
                </div>
                <span>Profile</span>
              </Link>

              {/* Mobile Logout */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center px-3 py-3 rounded-lg text-base font-medium text-red-200 hover:bg-red-500/20 hover:text-red-100 transition-all duration-200"
              >
                <LogOutIcon className="h-5 w-5 mr-3" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="pt-16 flex-1">
        <div className="py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* Global quiz popup: students receive instructor-triggered questions on any page */}
      {isStudent && incomingQuiz && (
        <QuizPopup
          quiz={incomingQuiz}
          onClose={clearIncomingQuiz}
          onAnswerSubmitted={() => {
            const qid = incomingQuiz?.questionId ?? incomingQuiz?.question_id;
            if (qid) markQuestionAnswered(qid);
          }}
        />
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={cancelLogout}
          ></div>
          
          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all">
              {/* Icon */}
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <LogOutIcon className="h-6 w-6 text-red-600" />
              </div>
              
              {/* Content */}
              <div className="mt-4 text-center">
                <h3 className="text-lg font-semibold text-gray-900">
                  Confirm Logout
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Are you sure you want to logout? You will need to login again to access your account.
                </p>
              </div>
              
              {/* Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={cancelLogout}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
