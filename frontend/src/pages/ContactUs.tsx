import React, { useState } from 'react';
import { MailIcon, PhoneIcon, MapPinIcon, SendIcon, InstagramIcon, LinkedinIcon, TwitterIcon, GithubIcon } from 'lucide-react';
import { toast } from 'sonner';

export const ContactUs = () => {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setSending(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Message sent successfully! We will get back to you soon.');
        setForm({ name: '', email: '', message: '' });
      } else {
        toast.error(data.detail || 'Failed to send message. Please try again.');
      }
    } catch {
      toast.error('Network error. Please try again later.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="py-8 px-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Left - Contact Info */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Contact Us
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
            Feel free to get in touch for collaborations or just to say hello. We look forward to connecting with you.
          </p>

          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-full">
                <MailIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                <p className="font-medium text-gray-900 dark:text-white">techsnatchers@gmail.com</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-full">
                <PhoneIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
                <p className="font-medium text-gray-900 dark:text-white">+94 77 123 4567</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-full">
                <MapPinIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Location</p>
                <p className="font-medium text-gray-900 dark:text-white">Jaffna, Sri Lanka</p>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <p className="font-medium text-gray-900 dark:text-white mb-3">Connect with us on social media:</p>
            <div className="flex gap-3">
              <a href="#" className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                <InstagramIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </a>
              <a href="#" className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                <LinkedinIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </a>
              <a href="#" className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                <TwitterIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </a>
              <a href="#" className="p-2.5 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                <GithubIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </a>
            </div>
          </div>
        </div>

        {/* Right - Contact Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8 border border-gray-100 dark:border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Your name"
                className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Your email"
                className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Message</label>
              <textarea
                name="message"
                value={form.message}
                onChange={handleChange}
                placeholder="Your message"
                rows={5}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-y"
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors shadow-md"
            >
              <SendIcon className="h-4 w-4" />
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
