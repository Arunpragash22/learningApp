import React from 'react';
import { GraduationCapIcon, HeartIcon } from 'lucide-react';

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg">
              <GraduationCapIcon className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
              ClassPulse
            </span>
          </div>

          {/* Copyright */}
          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
            <span>© {currentYear}</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">TechSnatcherrs</span>
            <span>• All rights reserved</span>
          </div>

          {/* Made with love */}
          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
            <span>Made with</span>
            <HeartIcon className="h-4 w-4 text-red-500 fill-red-500" />
            <span>by TechSnatcherrs</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
