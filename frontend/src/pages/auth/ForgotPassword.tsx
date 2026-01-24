import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { authService } from '../../services/authService';
import { Mail, ArrowLeft, CheckCircle, Loader2, ArrowRight } from 'lucide-react';

export const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const validateEmail = () => {
    if (!email.trim()) {
      setError('Email is required');
      return false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail()) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const result = await authService.forgotPassword(email);
      if (result.emailSent === false) {
        setError('Email service is not configured. Please contact the administrator.');
        return;
      }
      setIsSubmitted(true);
    } catch (err: any) {
      setError('Failed to send reset link. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <AuthLayout 
        title="Check your email" 
        subtitle="We've sent password reset instructions to your email"
      >
        <div className="space-y-6">
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center animate-scale-in">
              <CheckCircle className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          {/* Message */}
          <div className="text-center space-y-3">
            <p className="text-gray-600 dark:text-gray-400">
              We've sent an email to <span className="font-semibold text-gray-900 dark:text-white">{email}</span> with a link to reset your password.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Didn't receive the email? Check your spam folder or try again.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => setIsSubmitted(false)}
              className="
                w-full py-4 px-6 rounded-xl font-semibold
                text-gray-700 dark:text-gray-200
                bg-gray-100 dark:bg-gray-800
                hover:bg-gray-200 dark:hover:bg-gray-700
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
                transition-all duration-200
              "
            >
              Try a different email
            </button>

            <Link
              to="/login"
              className="
                flex items-center justify-center gap-2 w-full py-4 px-6 rounded-xl
                font-semibold text-white
                bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 
                hover:from-blue-600 hover:via-blue-700 hover:to-blue-700
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                transform hover:scale-[1.02] active:scale-[0.98]
                transition-all duration-200
                shadow-lg shadow-blue-500/30
                group
              "
            >
              Back to sign in
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout 
      title="Forgot password?" 
      subtitle="No worries, we'll send you reset instructions"
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {/* Back Link */}
        <Link 
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to sign in
        </Link>

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
                error ? 'text-red-400' : 'text-gray-400 group-focus-within:text-blue-500'
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
                if (error) setError('');
              }}
              className={`
                block w-full pl-12 pr-4 py-3.5 rounded-xl border-2 transition-all duration-200
                bg-white dark:bg-gray-800 
                text-gray-900 dark:text-white
                placeholder-gray-400 dark:placeholder-gray-500
                focus:outline-none focus:ring-0
                ${error 
                  ? 'border-red-300 dark:border-red-600 focus:border-red-500' 
                  : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400'
                }
              `}
              placeholder="Enter your email address"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400 flex items-center gap-1 animate-shake">
              <span className="inline-block w-1 h-1 bg-red-500 rounded-full" />
              {error}
            </p>
          )}
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
            Send reset link
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </span>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
        </button>
      </form>

      {/* Help Text */}
      <div className="mt-8 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Tip:</strong> If you don't see the email in your inbox, check your spam or junk folder. The email will be sent from noreply@classpulse.com.
        </p>
      </div>
    </AuthLayout>
  );
};
