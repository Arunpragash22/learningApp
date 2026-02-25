import React, { useState } from 'react';
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
  TwitterIcon,
  XIcon,
  ShieldCheckIcon,
  CookieIcon,
  MessageSquareIcon,
  StarIcon,
  SendIcon
} from 'lucide-react';
import { toast } from 'sonner';

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

const FeedbackModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState('general');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) { toast.error('Please select a rating'); return; }
    if (!comment.trim()) { toast.error('Please write your feedback'); return; }

    setSending(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Website Feedback (${category})`,
          email: 'feedback@classpulse.app',
          message: `Rating: ${rating}/5 (${RATING_LABELS[rating - 1]})\nCategory: ${category}\n\n${comment}`,
        }),
      });
      if (res.ok) {
        toast.success('Thank you for your feedback!');
        setRating(0); setComment(''); setCategory('general');
        onClose();
      } else {
        toast.error('Failed to send feedback. Please try again.');
      }
    } catch {
      toast.error('Network error. Please try again later.');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;
  const activeRating = hoverRating || rating;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-2 text-white">
            <MessageSquareIcon className="h-5 w-5" />
            <h2 className="text-lg font-bold">Website Feedback</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors text-white">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">We'd love to hear how your experience with ClassPulse has been. Your feedback helps us improve!</p>

          {/* Star Rating */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">How would you rate ClassPulse?</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-0.5 transition-transform hover:scale-110"
                >
                  <StarIcon
                    className={`h-8 w-8 transition-colors ${
                      star <= activeRating
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-300 dark:text-gray-600'
                    }`}
                  />
                </button>
              ))}
              {activeRating > 0 && (
                <span className="ml-2 text-sm font-medium text-gray-600 dark:text-gray-400">{RATING_LABELS[activeRating - 1]}</span>
              )}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Feedback Category</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'general', label: 'General' },
                { value: 'ui-design', label: 'UI / Design' },
                { value: 'quizzes', label: 'Quizzes & Sessions' },
                { value: 'performance', label: 'Performance' },
                { value: 'feature-request', label: 'Feature Request' },
                { value: 'bug', label: 'Bug Report' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    category === opt.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Your Feedback</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="What did you like? What can we improve?"
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-y text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            <SendIcon className="h-4 w-4" />
            {sending ? 'Sending...' : 'Submit Feedback'}
          </button>
        </form>
      </div>
    </div>
  );
};

const PrivacyPolicyModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-2 text-white">
            <ShieldCheckIcon className="h-5 w-5" />
            <h2 className="text-lg font-bold">Privacy Policy</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors text-white">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(85vh-64px)] text-sm text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed">
          <p className="text-xs text-gray-500 dark:text-gray-400">Last updated: February 2026</p>

          <p>ClassPulse by TechSnatchers ("we", "us", or "our") is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information when you use the ClassPulse platform.</p>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">1. Information We Collect</h3>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Account Information:</strong> Name, email address, and role (student / instructor) provided during registration.</li>
            <li><strong>Session & Quiz Data:</strong> Quiz answers, response times, accuracy scores, and engagement metrics collected during live sessions.</li>
            <li><strong>Network Diagnostics:</strong> RTT (round-trip time) and jitter measurements to assess connection quality during sessions.</li>
            <li><strong>Contact Messages:</strong> Name, email, and message content submitted through the Contact Us form.</li>
          </ul>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">2. How We Use Your Information</h3>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Real-Time Analytics:</strong> To cluster students by engagement level (Active, Moderate, Passive) and deliver personalized feedback.</li>
            <li><strong>Performance Reports:</strong> To generate session reports with accuracy trends, response times, and cluster history for students and instructors.</li>
            <li><strong>Platform Improvement:</strong> To improve quiz delivery, feedback quality, and overall learning experience.</li>
            <li><strong>Communication:</strong> To send session report emails, account verification, and password resets via Resend.</li>
          </ul>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">3. Data Storage & Security</h3>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Data is stored in MongoDB (primary) with optional MySQL backup for auditing.</li>
            <li>Passwords are securely hashed and never stored in plain text.</li>
            <li>Authentication uses JWT tokens transmitted over HTTPS.</li>
            <li>WebSocket connections are session-scoped with automatic cleanup on disconnect.</li>
          </ul>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">4. Data Sharing</h3>
          <p>We do <strong>not</strong> sell, trade, or share your personal data with third parties. Data is only shared with:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Your Instructor:</strong> Session performance data and engagement metrics.</li>
            <li><strong>Email Provider (Resend):</strong> Your email address for transactional emails only.</li>
            <li><strong>Zoom:</strong> Meeting integration data (meeting ID, join URL) for live session delivery.</li>
          </ul>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">5. Your Rights</h3>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Access and view your personal data through your profile and reports.</li>
            <li>Request correction or deletion of your account by contacting us.</li>
            <li>Opt out of non-essential emails at any time.</li>
          </ul>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">6. Contact</h3>
          <p>For privacy-related questions, contact us at <a href="mailto:techsnatchers@gmail.com" className="text-blue-500 hover:underline">techsnatchers@gmail.com</a> or via the <Link to="/dashboard/contact" className="text-blue-500 hover:underline" onClick={onClose}>Contact Us</Link> page.</p>
        </div>
      </div>
    </div>
  );
};

const CookiePolicyModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-2 text-white">
            <CookieIcon className="h-5 w-5" />
            <h2 className="text-lg font-bold">Cookie Policy</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 transition-colors text-white">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(85vh-64px)] text-sm text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed">
          <p className="text-xs text-gray-500 dark:text-gray-400">Last updated: February 2026</p>

          <p>This policy explains how ClassPulse uses cookies and similar technologies.</p>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">1. What Are Cookies?</h3>
          <p>Cookies are small text files stored on your device by your browser. They help websites remember your preferences and improve your experience.</p>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">2. Cookies We Use</h3>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Authentication Token (Session Storage):</strong> Stores your JWT access token to keep you logged in. Cleared when you close the browser tab.</li>
            <li><strong>Session Connection (Local Storage):</strong> Remembers which live session you're connected to so you stay connected after a page refresh.</li>
            <li><strong>Theme Preference (Local Storage):</strong> Saves your dark/light mode preference.</li>
          </ul>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">3. Third-Party Cookies</h3>
          <p>ClassPulse does <strong>not</strong> use any third-party tracking or advertising cookies. We do not use Google Analytics, Facebook Pixel, or similar services.</p>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">4. Managing Cookies</h3>
          <p>You can clear cookies and local storage through your browser settings. Note that clearing authentication data will require you to log in again.</p>

          <h3 className="font-semibold text-gray-900 dark:text-white text-base">5. Contact</h3>
          <p>Questions about our cookie usage? Reach out at <a href="mailto:techsnatchers@gmail.com" className="text-blue-500 hover:underline">techsnatchers@gmail.com</a>.</p>
        </div>
      </div>
    </div>
  );
};

export const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [cookieOpen, setCookieOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <footer className="mt-auto">
      {/* Top Contact Banner */}
      <div className="bg-gradient-to-r from-[#3B82F6] via-[#2563eb] to-[#1d4ed8] dark:from-[#1e40af] dark:via-[#1d4ed8] dark:to-[#1e3a8a]">
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
                  <p className="text-xs text-blue-300">by TechSnatchers</p>
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
                <li><button onClick={() => setFeedbackOpen(true)} className="text-blue-200/70 hover:text-white transition-colors text-sm">Feedback</button></li>
                <li><Link to="/dashboard/contact" className="text-blue-200/70 hover:text-white transition-colors text-sm">Contact Us</Link></li>
              </ul>
            </div>

            {/* About */}
            <div>
              <h4 className="text-white font-semibold mb-4 border-b border-blue-500/50 pb-2">ABOUT</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">About ClassPulse</a></li>
                <li><a href="#" className="text-blue-200/70 hover:text-white transition-colors text-sm">About TechSnatchers</a></li>
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
              <span className="text-white font-medium">TechSnatchers</span>.
            </p>
            <div className="flex gap-4">
              <button onClick={() => setPrivacyOpen(true)} className="text-sm text-blue-200/70 hover:text-white transition-colors">Privacy Policy</button>
              <button onClick={() => setCookieOpen(true)} className="text-sm text-blue-200/70 hover:text-white transition-colors">Cookie Policy</button>
            </div>
          </div>
        </div>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <CookiePolicyModal open={cookieOpen} onClose={() => setCookieOpen(false)} />
    </footer>
  );
};
