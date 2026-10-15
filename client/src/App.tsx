import React, { useState, useEffect } from 'react';
import { HomePage } from './pages/HomePage.js';
import { RoomPage } from './pages/RoomPage.js';
import { TemporaryBrowserPage } from './pages/TemporaryBrowserPage.js';
import { CinematicBackground } from './components/CinematicBackground.js';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { getOrCreateUserId } from './utils/identity.js';
import { playErrorSound } from './utils/soundEffects.js';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [userId] = useState<string>(getOrCreateUserId);
  const [isBrowserView, setIsBrowserView] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.location.pathname.toLowerCase() === '/browser';
  });

  const [toasts, setToasts] = useState<Toast[]>([]);

  // Check URL on load (supports ?room=ABC123, path /ABC123, and path /browser)
  useEffect(() => {
    const handleLocation = () => {
      const isBrowser = window.location.pathname.toLowerCase() === '/browser';
      setIsBrowserView(isBrowser);

      if (isBrowser) {
        setRoomId(null);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room');

      const pathMatch = window.location.pathname.match(/^\/([A-Za-z0-9_-]{4,16})$/);
      const rawCode = urlRoom || (pathMatch ? pathMatch[1] : null);
      const roomFromUrl = rawCode?.toLowerCase() === 'browser' ? null : rawCode?.toUpperCase() || null;

      const storedSettings = (() => {
        try {
          const s = localStorage.getItem('synctube_user_settings');
          return s ? JSON.parse(s) : null;
        } catch {
          return null;
        }
      })();

      const storedUsername = sessionStorage.getItem('synctube_username') || storedSettings?.name;
      if (storedUsername) {
        setUsername(storedUsername);
      }
      if (roomFromUrl && storedUsername) {
        setRoomId(roomFromUrl);
      } else if (!roomFromUrl) {
        setRoomId(null);
      }
    };

    handleLocation();
    window.addEventListener('popstate', handleLocation);
    return () => window.removeEventListener('popstate', handleLocation);
  }, []);

  const showToast = React.useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (type === 'error') {
      playErrorSound();
    }
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleEnterRoom = React.useCallback((targetRoomId: string, user: string) => {
    setIsBrowserView(false);
    setRoomId(targetRoomId);
    setUsername(user);
    sessionStorage.setItem('synctube_username', user);
    // Update URL pathname cleanly without reloading
    const newUrl = `/${targetRoomId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  }, []);

  const handleLeaveRoom = React.useCallback(() => {
    setRoomId(null);
    setIsBrowserView(false);
    window.history.pushState({ path: '/' }, '', '/');
  }, []);

  const handleOpenBrowser = React.useCallback(() => {
    setRoomId(null);
    setIsBrowserView(true);
    window.history.pushState({ path: '/browser' }, '', '/browser');
  }, []);

  const handleBackToHome = React.useCallback(() => {
    setIsBrowserView(false);
    setRoomId(null);
    window.history.pushState({ path: '/' }, '', '/');
  }, []);

  return (
    <div className="app-root-shell">
      <CinematicBackground />
      <div className="app-content-layer">
        {roomId ? (
          <RoomPage
            roomId={roomId}
            username={username}
            userId={userId}
            onLeaveRoom={handleLeaveRoom}
            onNotify={showToast}
          />
        ) : isBrowserView ? (
          <TemporaryBrowserPage
            onBackToHome={handleBackToHome}
            onNotify={showToast}
          />
        ) : (
          <HomePage
            onEnterRoom={handleEnterRoom}
            onOpenBrowser={handleOpenBrowser}
            onNotify={showToast}
            userId={userId}
          />
        )}
      </div>

      {/* Floating Toast Alerts */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'success' ? (
              <CheckCircle2 size={18} color="var(--accent-emerald)" />
            ) : toast.type === 'error' ? (
              <AlertCircle size={18} color="var(--accent-rose)" />
            ) : (
              <Info size={18} color="var(--accent)" />
            )}
            <span style={{ fontSize: '0.9rem', flex: 1 }}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
