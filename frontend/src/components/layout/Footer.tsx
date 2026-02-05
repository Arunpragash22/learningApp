import React from 'react';

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#1e1b4b] mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <p className="text-center text-sm text-gray-300">
          Copyright © {currentYear} - ClassPulse - All Rights Reserved. Concept, Design & Development By{' '}
          <span className="text-white font-medium">TechSnatcherrs</span>.
        </p>
      </div>
    </footer>
  );
};
