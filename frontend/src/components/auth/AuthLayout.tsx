import React from 'react';
import { Link } from 'react-router-dom';
import { Layers, Sparkles, Users, BarChart3, Zap, BookOpen } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Insights',
    description: 'Real-time analytics that adapt to your learning style'
  },
  {
    icon: Users,
    title: 'Live Engagement',
    description: 'Interactive sessions with instant feedback'
  },
  {
    icon: BarChart3,
    title: 'Progress Tracking',
    description: 'Comprehensive dashboards for students and instructors'
  }
];

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Animated gradient background - Soft pastel mint green */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-300 via-blue-400 to-blue-500 animate-gradient" />
        
        {/* Decorative patterns */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-40 right-20 w-96 h-96 bg-white rounded-full blur-3xl animate-float-delayed" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-white rounded-full blur-3xl animate-float-slow" />
        </div>
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300">
                <Layers className="w-7 h-7 text-white" />
              </div>
              <div className="absolute -inset-1 bg-white/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">
              Class Pulse
            </span>
          </Link>
          
          {/* Main content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight">
                AI-Powered Adaptive Learning
                <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-lime-200 to-yellow-200">
                  in Real-Time
                </span>
              </h1>
              {/*<p className="text-lg text-white/80 max-w-md leading-relaxed">
                Transform passive video conferencing into dynamic, personalized 
                educational experiences with real-time AI insights.
              </p>*/}
            </div>
            
            {/* Features */}
            <div className="space-y-4">
              {features.map((feature, index) => (
                <div 
                  key={feature.title}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 transform hover:translate-x-2 transition-transform duration-300"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{feature.title}</h3>
                    <p className="text-sm text-white/70">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Footer */}
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <BookOpen className="w-4 h-4" />
            <span>Trusted by 10,000+ educators worldwide</span>
          </div>
        </div>
      </div>
      
      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col">
        {/* Mobile header */}
        <div className="lg:hidden p-6 bg-gradient-to-r from-blue-400 to-blue-600">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Class Pulse</span>
          </Link>
        </div>
        
        {/* Form container - Soft pastel green background */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-blue-50 dark:bg-gray-900">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-blue-700 dark:text-blue-400 tracking-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>
            
            {/* Form content */}
            {children}
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-6 text-center text-sm text-blue-600 dark:text-gray-400 bg-blue-50 dark:bg-gray-900 border-t border-blue-100 dark:border-gray-800">
          © {new Date().getFullYear()} Class Pulse. All rights reserved.
        </div>
      </div>
    </div>
  );
};

