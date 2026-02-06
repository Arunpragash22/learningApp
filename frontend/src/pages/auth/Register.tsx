import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2, GraduationCap, BookOpen, CheckCircle2, MailCheck, Wifi } from 'lucide-react';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  passwordHint: string;
  role: 'student' | 'instructor' | 'admin';
  networkMonitoringConsent: boolean;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
  networkMonitoringConsent?: string;
}

const passwordRequirements = [
  { regex: /.{6,}/, text: 'At least 6 characters' },
  { regex: /[a-z]/, text: 'One lowercase letter' },
  { regex: /[A-Z]/, text: 'One uppercase letter' },
  { regex: /\d/, text: 'One number' },
];

export const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    passwordHint: '',
    role: 'student',
    networkMonitoringConsent: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [step, setStep] = useState(1);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    if (errors[name as keyof FormErrors]) {
      setErrors({ ...errors, [name]: undefined });
    }
  };

  const validateStep1 = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = 'First name must be at least 2 characters';
    }
    
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = 'Last name must be at least 2 characters';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain uppercase, lowercase, and number';
    }
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.networkMonitoringConsent) {
      newErrors.networkMonitoringConsent = 'You must agree to network monitoring to continue';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateStep2()) {
      return;
    }

    setIsLoading(true);
    setErrors({});
    
    const success = await register(formData);
    
    if (success) {
      setRegistrationComplete(true);
    }
    
    setIsLoading(false);
  };

  const getPasswordStrength = () => {
    const passed = passwordRequirements.filter(req => req.regex.test(formData.password)).length;
    if (passed === 0) return { width: '0%', color: 'bg-gray-200', text: '' };
    if (passed === 1) return { width: '25%', color: 'bg-red-500', text: 'Weak' };
    if (passed === 2) return { width: '50%', color: 'bg-orange-500', text: 'Fair' };
    if (passed === 3) return { width: '75%', color: 'bg-yellow-500', text: 'Good' };
    return { width: '100%', color: 'bg-blue-500', text: 'Strong' };
  };

  const passwordStrength = getPasswordStrength();

  // Show success screen after registration
  if (registrationComplete) {
    return (
      <AuthLayout 
        title="Check your email!"
        subtitle="We've sent a verification link to your inbox"
      >
        <div className="text-center">
          {/* Success Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-6">
            <MailCheck className="w-10 h-10 text-blue-600 dark:text-blue-400" />
          </div>
          
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
            Verification email sent!
          </h3>
          
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            We've sent a verification link to:
          </p>
          
          <p className="text-blue-600 dark:text-blue-400 font-medium mb-6">
            {formData.email}
          </p>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-8 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Next steps:</strong>
            </p>
            <ol className="text-sm text-blue-700 dark:text-blue-400 mt-2 text-left list-decimal list-inside space-y-1">
              <li>Check your email inbox (and spam folder)</li>
              <li>Click the verification link in the email</li>
              <li>Start learning on Class Pulse!</li>
            </ol>
          </div>
          
          <Link
            to="/login"
            className="
              inline-flex items-center justify-center gap-2 w-full py-4 px-6 rounded-xl
              font-semibold text-white
              bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 
              hover:from-blue-600 hover:via-blue-700 hover:to-blue-700
              transform hover:scale-[1.02] active:scale-[0.98]
              transition-all duration-200
              shadow-lg shadow-blue-500/30
              group
            "
          >
            Go to Login
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            Didn't receive the email?{' '}
            <button 
              onClick={() => setRegistrationComplete(false)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Try again
            </button>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout 
      title={step === 1 ? "Create your account" : "Secure your account"}
      subtitle={step === 1 ? "Start your learning journey today" : "Set a strong password to protect your account"}
    >
      {/* Progress Steps */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm transition-all duration-300 ${
          step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
        }`}>
          {step > 1 ? <CheckCircle2 className="w-5 h-5" /> : '1'}
        </div>
        <div className={`flex-1 h-1 rounded-full transition-all duration-300 ${
          step > 1 ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
        }`} />
        <div className={`flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm transition-all duration-300 ${
          step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
        }`}>
          2
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Personal Info */}
        <div className={`space-y-5 ${step === 1 ? 'block' : 'hidden'}`}>
          {/* Name Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                First name
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className={`h-5 w-5 transition-colors duration-200 ${
                    errors.firstName ? 'text-red-400' : 'text-gray-400 group-focus-within:text-blue-500'
                  }`} />
                </div>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className={`
                    block w-full pl-12 pr-4 py-3.5 rounded-xl border-2 transition-all duration-200
                    bg-white dark:bg-gray-800 
                    text-gray-900 dark:text-white
                    placeholder-gray-400 dark:placeholder-gray-500
                    focus:outline-none focus:ring-0
                    ${errors.firstName 
                      ? 'border-red-300 dark:border-red-600 focus:border-red-500' 
                      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400'
                    }
                  `}
                  placeholder="First name"
                />
              </div>
              {errors.firstName && (
                <p className="text-sm text-red-500 animate-shake">{errors.firstName}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Last name
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className={`h-5 w-5 transition-colors duration-200 ${
                    errors.lastName ? 'text-red-400' : 'text-gray-400 group-focus-within:text-blue-500'
                  }`} />
                </div>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className={`
                    block w-full pl-12 pr-4 py-3.5 rounded-xl border-2 transition-all duration-200
                    bg-white dark:bg-gray-800 
                    text-gray-900 dark:text-white
                    placeholder-gray-400 dark:placeholder-gray-500
                    focus:outline-none focus:ring-0
                    ${errors.lastName 
                      ? 'border-red-300 dark:border-red-600 focus:border-red-500' 
                      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400'
                    }
                  `}
                  placeholder="Last name"
                />
              </div>
              {errors.lastName && (
                <p className="text-sm text-red-500 animate-shake">{errors.lastName}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email address
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className={`h-5 w-5 transition-colors duration-200 ${
                  errors.email ? 'text-red-400' : 'text-gray-400 group-focus-within:text-blue-500'
                }`} />
              </div>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
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
                placeholder="your@example.com"
              />
            </div>
            {errors.email && (
              <p className="text-sm text-red-500 animate-shake">{errors.email}</p>
            )}
          </div>

          {/* Role Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              I am a
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: 'student' })}
                className={`
                  flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200
                  ${formData.role === 'student'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  formData.role === 'student' 
                    ? 'bg-blue-100 dark:bg-blue-900/40' 
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <GraduationCap className={`w-6 h-6 ${
                    formData.role === 'student' ? 'text-blue-600' : 'text-gray-500'
                  }`} />
                </div>
                <span className={`font-medium ${
                  formData.role === 'student' 
                    ? 'text-blue-600 dark:text-blue-400' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  Student
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, role: 'instructor' })}
                className={`
                  flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200
                  ${formData.role === 'instructor'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }
                `}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  formData.role === 'instructor' 
                    ? 'bg-blue-100 dark:bg-blue-900/40' 
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <BookOpen className={`w-6 h-6 ${
                    formData.role === 'instructor' ? 'text-blue-600' : 'text-gray-500'
                  }`} />
                </div>
                <span className={`font-medium ${
                  formData.role === 'instructor' 
                    ? 'text-blue-600 dark:text-blue-400' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  Instructor
                </span>
              </button>
            </div>
          </div>

          {/* Next Button */}
          <button
            type="button"
            onClick={handleNextStep}
            className="
              w-full py-4 px-6 rounded-xl font-semibold text-white
              bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 
              hover:from-blue-600 hover:via-blue-700 hover:to-blue-700
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
              transform hover:scale-[1.02] active:scale-[0.98]
              transition-all duration-200
              shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40
              flex items-center justify-center gap-2
              group
            "
          >
            Continue
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Step 2: Password */}
        <div className={`space-y-5 ${step === 2 ? 'block' : 'hidden'}`}>
          {/* Password */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className={`h-5 w-5 transition-colors duration-200 ${
                  errors.password ? 'text-red-400' : 'text-gray-400 group-focus-within:text-blue-500'
                }`} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
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
                placeholder="Create a password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                )}
              </button>
            </div>
            
            {/* Password Strength */}
            {formData.password && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${passwordStrength.color} transition-all duration-300`}
                      style={{ width: passwordStrength.width }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${
                    passwordStrength.color === 'bg-blue-500' ? 'text-blue-600' :
                    passwordStrength.color === 'bg-yellow-500' ? 'text-yellow-600' :
                    passwordStrength.color === 'bg-orange-500' ? 'text-orange-600' :
                    'text-red-600'
                  }`}>
                    {passwordStrength.text}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {passwordRequirements.map((req) => (
                    <div 
                      key={req.text}
                      className={`flex items-center gap-2 text-xs ${
                        req.regex.test(formData.password) 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-400'
                      }`}
                    >
                      <CheckCircle2 className={`w-3.5 h-3.5 ${
                        req.regex.test(formData.password) ? 'opacity-100' : 'opacity-30'
                      }`} />
                      {req.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {errors.password && (
              <p className="text-sm text-red-500 animate-shake">{errors.password}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirm password
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className={`h-5 w-5 transition-colors duration-200 ${
                  errors.confirmPassword ? 'text-red-400' : 'text-gray-400 group-focus-within:text-blue-500'
                }`} />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`
                  block w-full pl-12 pr-12 py-3.5 rounded-xl border-2 transition-all duration-200
                  bg-white dark:bg-gray-800 
                  text-gray-900 dark:text-white
                  placeholder-gray-400 dark:placeholder-gray-500
                  focus:outline-none focus:ring-0
                  ${errors.confirmPassword 
                    ? 'border-red-300 dark:border-red-600 focus:border-red-500' 
                    : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400'
                  }
                `}
                placeholder="Confirm your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                )}
              </button>
            </div>
            {formData.confirmPassword && formData.password === formData.confirmPassword && (
              <p className="text-sm text-blue-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Passwords match
              </p>
            )}
            {errors.confirmPassword && (
              <p className="text-sm text-red-500 animate-shake">{errors.confirmPassword}</p>
            )}
          </div>

          {/* Network Monitoring Consent */}
          <div className="space-y-3">
            <div className={`
              p-4 rounded-xl border-2 transition-all duration-200
              ${formData.networkMonitoringConsent
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : errors.networkMonitoringConsent
                  ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/10'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
              }
            `}>
              <label className="flex items-start gap-3 cursor-pointer">
                <div className="flex-shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={formData.networkMonitoringConsent}
                    onChange={(e) => {
                      setFormData({ ...formData, networkMonitoringConsent: e.target.checked });
                      if (errors.networkMonitoringConsent) {
                        setErrors({ ...errors, networkMonitoringConsent: undefined });
                      }
                    }}
                    className="
                      w-5 h-5 rounded border-2 border-gray-300 dark:border-gray-600
                      text-blue-600 focus:ring-blue-500 focus:ring-offset-0
                      transition-colors cursor-pointer
                    "
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Wifi className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                      Network Quality Monitoring Agreement
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    I agree that ClassPulse may monitor my network connection quality during live meetings 
                    to provide better learning analytics and engagement tracking. This data helps instructors 
                    understand if poor engagement is due to network issues rather than disinterest.
                  </p>
                </div>
              </label>
            </div>
            {errors.networkMonitoringConsent && (
              <p className="text-sm text-red-500 animate-shake flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                {errors.networkMonitoringConsent}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="
                flex-1 py-4 px-6 rounded-xl font-semibold
                text-gray-700 dark:text-gray-200
                bg-gray-100 dark:bg-gray-800
                hover:bg-gray-200 dark:hover:bg-gray-700
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
                transition-all duration-200
              "
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="
                relative flex-1 py-4 px-6 rounded-xl font-semibold text-white
                bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 
                hover:from-blue-600 hover:via-blue-700 hover:to-blue-700
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
                disabled:opacity-70 disabled:cursor-not-allowed
                transform hover:scale-[1.02] active:scale-[0.98]
                transition-all duration-200
                shadow-lg shadow-blue-500/30
                group overflow-hidden
              "
            >
              <span className={`flex items-center justify-center gap-2 ${isLoading ? 'opacity-0' : ''}`}>
                Create account
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Divider */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
            Already have an account?
          </span>
        </div>
      </div>

      {/* Login Link */}
      <Link
        to="/login"
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
        Sign in to your account
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </Link>
    </AuthLayout>
  );
};
