import React from 'react';
import './index.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { SessionConnectionProvider } from './context/SessionConnectionContext';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from 'sonner';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <SessionConnectionProvider>
            <App />
            <Toaster position="top-right" richColors />
          </SessionConnectionProvider>
        </AuthProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
