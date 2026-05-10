import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth, useUser, RedirectToSignIn } from '@clerk/react';
import { useEffect } from 'react';

import HomePage from './pages/HomePage';
import InputPage from './pages/InputPage';
import ResultPage from './pages/ResultPage';
import ChatPage from './pages/ChatPage';
import AnalyticsPage from './pages/AnalyticsPage';
import InsightsPage from './pages/InsightsPage';
import { upsertUser } from './services/supabase';

// Protects routes — redirects to Clerk sign-in if not authenticated
function ProtectedRoute({ children }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F5F5F5', fontFamily: "'Sora', sans-serif", color: '#6B6B80', fontSize: 15,
    }}>
      Loading...
    </div>
  );
  if (!isSignedIn) return <RedirectToSignIn />;
  return children;
}

function AnimatedRoutes() {
  const location = useLocation();
  const { user, isSignedIn } = useUser();

  // Sync Clerk user to Supabase on every sign-in and clear old state on account switch
  useEffect(() => {
    if (isSignedIn && user) {
      upsertUser(user);
    }

    const storedUserId = localStorage.getItem('prepzo_user_id');
    if (user?.id) {
      if (storedUserId !== user.id) {
        // Different user logged in, clear previous results
        localStorage.removeItem('prepzo_last_result');
        localStorage.setItem('prepzo_user_id', user.id);
      }
    } else {
      // User logged out, clear results
      localStorage.removeItem('prepzo_last_result');
      localStorage.removeItem('prepzo_user_id');
    }
  }, [isSignedIn, user]);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public */}
        <Route path="/" element={<HomePage />} />

        {/* Protected — must be signed in */}
        <Route path="/input"     element={<ProtectedRoute><InputPage /></ProtectedRoute>} />
        <Route path="/result"    element={<ProtectedRoute><ResultPage /></ProtectedRoute>} />
        <Route path="/chat"      element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
        <Route path="/insights"  element={<ProtectedRoute><InsightsPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}
