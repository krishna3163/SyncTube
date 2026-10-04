import React, { useState, useEffect } from 'react';
import { HomePage } from './pages/HomePage.js';
import { RoomPage } from './pages/RoomPage.js';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [userId] = useState<string>(() => {
    const existing = sessionStorage.getItem('synctube_user_id');
    if (existing) return existing;
    const generated = `usr_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('synctube_user_id', generated);
    return generated;
  });

  const [toasts, setToasts] = useState<Toast[]>([]);

  // Check URL on load (e.g. /?room=ABC123)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    const storedUsername = sessionStorage.getItem('synctube_username');
    if (storedUsername) {
      setUsername(storedUsername);
    }
    if (urlRoom && storedUsername) {
      setRoomId(urlRoom.toUpperCase());
    }
  }, []);

  const showToast = React.useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleEnterRoom = React.useCallback((targetRoomId: string, user: string) => {
    setRoomId(targetRoomId);
    setUsername(user);
    sessionStorage.setItem('synctube_username', user);
    // Update URL query string without reloading
    const newUrl = `${window.location.pathname}?room=${targetRoomId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  }, []);

  const handleLeaveRoom = React.useCallback(() => {
    setRoomId(null);
    const newUrl = window.location.pathname;
    window.history.pushState({ path: newUrl }, '', newUrl);
  }, []);

  return (
    <div>
      {roomId ? (
        <RoomPage
          roomId={roomId}
          username={username}
          userId={userId}
          onLeaveRoom={handleLeaveRoom}
          onNotify={showToast}
        />
      ) : (
        <HomePage onEnterRoom={handleEnterRoom} onNotify={showToast} />
      )}

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
