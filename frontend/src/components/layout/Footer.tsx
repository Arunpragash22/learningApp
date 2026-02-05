import React from 'react';
import { Link } from 'react-router-dom';
import { 
  PhoneIcon, 
  MapPinIcon, 
  MailIcon, 
  GraduationCapIcon,
  FacebookIcon,
  LinkedinIcon,
  InstagramIcon,
  YoutubeIcon,
  TwitterIcon
} from 'lucide-react';

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto">
      {/* Top Contact Banner */}
      <div className="bg-gradient-to-r from-[#3B82F6] via-[#2563eb] to-[#1d4ed8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-white text-center">
            {/* Phone */}
            <div className="flex flex-col items-center gap-2">
              <PhoneIcon className="h-6 w-6" />
              <span className="font-semibold">+94 77 123 4567</span>
            </div>
            {/* Address */}
            <div className="flex flex-col items-center gap-2 border-x-0 md:border-x border-white/30">
              <MapPinIcon className="h-6 w-6" />
              <span className="font-semibold">Mihintale, Sri Lanka</span>
            </div>
            {/* Email */}
            <div className="flex flex-col items-center gap-2">
              <MailIcon className="h-6 w-6" />
              <span className="font-semibold">techsnatchers@gmail.com</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="bg-[#0f172a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Brand & Social */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl">
                  <GraduationCapIcon className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">ClassPulse</h3>
                  <p className="text-xs text-blue-300">by TechSnatcherrs</p>
                </div>
              </div>
              <p className="text-blue-200/70 text-sm mb-4">
                Empowering education through real-time engagement and analytics.
              </p>
              <p className="text-white font-medium mb-3">Follow Us On</p>
              <div className="flex gap-2">
                <a href="#" className="p-2 bg-blue-600 rounded-md hover:bg-blue-700 transition-colors">
                  <FacebookIcon className="h-4 w-4 text-white" />
                </a>
                <a href="#" className="p-2 bg-blue-700 rounded-md hover:bg-blue-800 transition-colors">
                  <LinkedinIcon className="h-4 w-4 text-white" />
                </a>
                <a href="#" className="p-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-md hover:opacity-90 transition-opacity">
                  <InstagramIcon className="h-4 w-4 text-white" />
                </a>
                <a href="#" className="p-2 bg-red-600 rounded-md hover:bg-red-700 transition-colors">
                  <YoutubeIcon className="h-4 w-4 text-white" />
                </a>
                <a href="#" className="p-2 bg-sky-500 rounded-md hover:bg-sky-600 transition-colors">
                  <TwitterIcon className="h-4 w-4 text-white" />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-white font-semibold mb-4 border-b border-blue-500/50 pb-2">QUICK LINKS</h4>
              <ul className="space-y-2">
                <li><Link to="/dashboard/courses" className="text-blue-200/70 hover:text-white transition-colors text-sm">All Courses</Link></li>
                <li><Link to="/dashboard/sessions" className="text-blue-200/70 hover:text-white transition-colors text-sm">Meetings</Link></li>
                <li><Link to="/dashboard/profile" className="text-blue-200/70 hover:text-white transition-colors text-sm">My Profile</Link></li>
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">Help & Support</a></li>
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">Contact Us</a></li>
              </ul>
            </div>

            {/* About */}
            <div>
              <h4 className="text-white font-semibold mb-4 border-b border-blue-500/50 pb-2">ABOUT</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">About ClassPulse</a></li>
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">About TechSnatcherrs</a></li>
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">Our Team</a></li>
              </ul>
            </div>

            {/* Features */}
            <div>
              <h4 className="text-white font-semibold mb-4 border-b border-blue-500/50 pb-2">FEATURES</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">Live Sessions</a></li>
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">Real-time Quizzes</a></li>
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">Student Analytics</a></li>
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">Engagement Tracking</a></li>
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">Session Reports</a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Copyright Bar */}
      <div className="bg-[#020617]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-sm text-blue-200/70">
              Copyright © {currentYear} - ClassPulse - All Rights Reserved. Concept, Design & Development By{' '}
              <span className="text-white font-medium">TechSnatcherrs</span>.
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-sm text-blue-200/70 hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="text-sm text-blue-200/70 hover:text-white transition-colors">Cookie Policy</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
