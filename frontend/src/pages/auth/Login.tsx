import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get the intended destination URL from state (if redirected from protected route)
  const from = (location.state as { from?: string })?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};
    
    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});
    
    const success = await login(email, password);
    
    if (success) {
      setTimeout(() => {
        // If there was an intended URL (from protected route redirect), go there
        if (from && from.startsWith('/dashboard')) {
          navigate(from, { replace: true });
        } else {
          // Otherwise, go to the user's default dashboard
          const currentUser = JSON.parse(sessionStorage.getItem('user') || '{}');
          if (currentUser && currentUser.role) {
            navigate(`/dashboard/${currentUser.role}`, { replace: true });
          } else {
            navigate('/dashboard/student', { replace: true });
          }
        }
      }, 100);
    } else {
      setErrors({ email: 'Invalid email or password' });
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout 
      title="Welcome back" 
      subtitle="Sign in to continue your learning journey"
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {/* Email Field */}
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email address
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Mail className={`h-5 w-5 transition-colors duration-200 ${
                errors.email ? 'text-red-400' : 'text-gray-400 group-focus-within:text-blue-500'
              }`} />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors({ ...errors, email: undefined });
              }}
              className={`
                block w-full pl-12 pr-4 py-3.5 rounded-xl border-2 transition-all duration-200
                bg-white dark:bg-gray-800 
                text-gray-900 dark:text-white
                placeholder-gray-400 dark:placeholder-gray-500
                focus:outline-none focus:ring-0
                ${errors.email 
                  ? 'border-red-300 dark:border-red-600 focus:border-red-500' 
                  : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400'
                }
              `}
              placeholder="you@example.com"
            />
          </div>
          {errors.email && (
            <p className="text-sm text-red-500 dark:text-red-400 flex items-center gap-1 animate-shake">
              <span className="inline-block w-1 h-1 bg-red-500 rounded-full" />
              {errors.email}
            </p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Password
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Lock className={`h-5 w-5 transition-colors duration-200 ${
                errors.password ? 'text-red-400' : 'text-gray-400 group-focus-within:text-blue-500'
              }`} />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors({ ...errors, password: undefined });
              }}
              className={`
                block w-full pl-12 pr-12 py-3.5 rounded-xl border-2 transition-all duration-200
                bg-white dark:bg-gray-800 
                text-gray-900 dark:text-white
                placeholder-gray-400 dark:placeholder-gray-500
                focus:outline-none focus:ring-0
                ${errors.password 
                  ? 'border-red-300 dark:border-red-600 focus:border-red-500' 
                  : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400'
                }
              `}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-4 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-red-500 dark:text-red-400 flex items-center gap-1 animate-shake">
              <span className="inline-block w-1 h-1 bg-red-500 rounded-full" />
              {errors.password}
            </p>
          )}
        </div>

        {/* Remember me & Forgot password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded-md peer-checked:border-blue-500 peer-checked:bg-blue-500 transition-all duration-200" />
              <svg 
                className="absolute top-0.5 left-0.5 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors">
              Remember me
            </span>
          </label>

          <Link
            to="/forgot-password"
            className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="
            relative w-full py-4 px-6 rounded-xl font-semibold text-white
            bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 
            hover:from-blue-600 hover:via-blue-700 hover:to-blue-700
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
            disabled:opacity-70 disabled:cursor-not-allowed
            transform hover:scale-[1.02] active:scale-[0.98]
            transition-all duration-200
            shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40
            group overflow-hidden
          "
        >
          <span className={`flex items-center justify-center gap-2 ${isLoading ? 'opacity-0' : ''}`}>
            Sign in
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </span>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
            New to Class Pulse?
          </span>
        </div>
      </div>

      {/* Register Link */}
      <Link
        to="/register"
        className="
          flex items-center justify-center gap-2 w-full py-4 px-6 rounded-xl
          font-semibold text-gray-700 dark:text-gray-200
          bg-white dark:bg-gray-800
          border-2 border-blue-200 dark:border-blue-800
          hover:border-blue-500 dark:hover:border-blue-400
          hover:text-blue-600 dark:hover:text-blue-400
          hover:bg-blue-50 dark:hover:bg-blue-900/20
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
          transform hover:scale-[1.02] active:scale-[0.98]
          transition-all duration-200
          group
        "
      >
        Create an account
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Link>
    </AuthLayout>
  );
};
