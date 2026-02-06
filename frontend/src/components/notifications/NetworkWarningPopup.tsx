/**
 * NetworkWarningPopup Component
 * Shows a popup notification when student's network connection is unstable
 * No sound is played for this notification
 */
import React, { useState, useEffect } from 'react';
import { WifiOffIcon, XIcon, AlertTriangleIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConnectionQuality } from '../../hooks/useLatencyMonitor';

interface NetworkWarningPopupProps {
  quality: ConnectionQuality;
  onClose: () => void;
}

export const NetworkWarningPopup: React.FC<NetworkWarningPopupProps> = ({
  quality,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Animate in
  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const getQualityColor = () => {
    switch (quality) {
      case 'fair':
        return 'from-yellow-500 to-orange-500';
      case 'poor':
        return 'from-orange-500 to-red-500';
      case 'critical':
        return 'from-red-600 to-red-800';
      default:
        return 'from-yellow-500 to-orange-500';
    }
  };

  const getQualityMessage = () => {
    switch (quality) {
      case 'fair':
        return 'Your network connection is fair. You may experience some delays.';
      case 'poor':
        return 'Your network connection is poor. Please consider changing your location or network.';
      case 'critical':
        return 'Your network connection is very weak. Please change your location or switch to a better network immediately.';
      default:
        return 'Your network connection is unstable.';
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black transition-opacity duration-300 z-50 ${
          isVisible ? 'bg-opacity-50' : 'bg-opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Popup */}
      <div
        className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md mx-4 transition-all duration-300 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border-4 border-orange-400 overflow-hidden">
          {/* Header */}
          <div className={`bg-gradient-to-r ${getQualityColor()} p-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-white p-2 rounded-full">
                  <WifiOffIcon className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">
                    ⚠️ Network Unstable
                  </h3>
                  <p className="text-orange-100 text-sm">
                    Connection Quality: {quality.charAt(0).toUpperCase() + quality.slice(1)}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1 transition-colors"
                aria-label="Close"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Warning Icon */}
            <div className="flex items-center justify-center mb-4">
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-full">
                <AlertTriangleIcon className="h-12 w-12 text-orange-500" />
              </div>
            </div>

            {/* Message */}
            <div className="text-center mb-6">
              <p className="text-gray-900 dark:text-gray-100 font-medium text-lg mb-2">
                Your network is unstable
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {getQualityMessage()}
              </p>
            </div>

            {/* Suggestions */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Suggestions:
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>• Move closer to your WiFi router</li>
                <li>• Switch to a different network</li>
                <li>• Close other applications using bandwidth</li>
                <li>• Try using mobile data instead</li>
              </ul>
            </div>

            {/* Action Button */}
            <Button
              variant="primary"
              className="w-full py-3"
              onClick={onClose}
            >
              Got it, I'll try to improve my connection
            </Button>

            {/* Note */}
            <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
              💡 A stable connection ensures the best learning experience and accurate engagement tracking.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default NetworkWarningPopup;
