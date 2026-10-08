import React, { useState } from 'react';
import { X, User, Lock, Mail, LogIn, UserPlus, LogOut } from 'lucide-react';
import type { UserProfile } from '../types.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { ANIME_AVATARS, AnimeAvatar } from '../utils/animeAvatars.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  apiUrl: string;
  onAuthSuccess: (user: UserProfile, token: string) => void;
  onLogout: () => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  apiUrl,
  onAuthSuccess,
  onLogout,
  onNotify,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('pikachu');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = tab === 'login' ? `${apiUrl}/api/auth/login` : `${apiUrl}/api/auth/register`;
      const body =
        tab === 'login'
          ? { email: email.trim(), password }
          : { email: email.trim(), username: username.trim(), password, avatarId: selectedAvatar };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      onAuthSuccess(data.user, data.token);
      onNotify(tab === 'login' ? `Welcome back, ${data.user.username}!` : `Account created! Welcome, ${data.user.username}!`, 'success');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="auth-modal-header-title">
            <span className="auth-badge-v2">V2</span>
            <h2>
              {currentUser ? 'Your Profile' : tab === 'login' ? 'Sign In to SyncTube' : 'Create SyncTube Account'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            title="Close modal"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {currentUser ? (
          <div className="modal-body auth-modal-body">
            <div className="auth-profile-card">
              <div className="auth-profile-avatar-wrap">
                <AnimeAvatarDisplay username={currentUser.username} avatarId={currentUser.avatarId || 'pikachu'} size={64} />
              </div>
              <div className="auth-profile-details">
                <h3 className="auth-profile-username">{currentUser.username}</h3>
                <p className="auth-profile-email">{currentUser.email}</p>
                {currentUser.bio && <p className="auth-profile-bio">"{currentUser.bio}"</p>}
              </div>

              <button
                onClick={() => {
                  onLogout();
                  onNotify('Signed out successfully.', 'info');
                  onClose();
                }}
                className="btn btn-secondary auth-logout-btn"
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body auth-modal-body">
            {/* Tab switch */}
            <div className="auth-tabs">
              <button
                type="button"
                onClick={() => { setTab('login'); setError(null); }}
                className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
              >
                <LogIn size={14} />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => { setTab('register'); setError(null); }}
                className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
              >
                <UserPlus size={14} />
                <span>Register</span>
              </button>
            </div>

            {error && (
              <div className="auth-error-banner">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-form-group">
                <label className="auth-label">Email Address</label>
                <div className="auth-input-wrap">
                  <Mail size={16} className="auth-input-icon" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="auth-input"
                  />
                </div>
              </div>

              {tab === 'register' && (
                <>
                  <div className="auth-form-group">
                    <label className="auth-label">Username</label>
                    <div className="auth-input-wrap">
                      <User size={16} className="auth-input-icon" />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Choose username"
                        className="auth-input"
                      />
                    </div>
                  </div>

                  <div className="auth-form-group">
                    <label className="auth-label">Pick Avatar</label>
                    <div className="auth-avatar-grid">
                      {ANIME_AVATARS.map((opt: AnimeAvatar) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelectedAvatar(opt.id)}
                          className={`auth-avatar-btn ${selectedAvatar === opt.id ? 'active' : ''}`}
                          title={opt.name}
                        >
                          <AnimeAvatarDisplay username={opt.name} avatarId={opt.id} size={28} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="auth-form-group">
                <label className="auth-label">Password</label>
                <div className="auth-input-wrap">
                  <Lock size={16} className="auth-input-icon" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="auth-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary auth-submit-btn"
              >
                {loading ? 'Processing...' : tab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
