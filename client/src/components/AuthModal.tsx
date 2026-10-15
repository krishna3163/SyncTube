import React, { useState } from 'react';
import { X, User, Lock, Mail, LogIn, UserPlus, LogOut, KeyRound } from 'lucide-react';
import type { UserProfile } from '../types.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { ANIME_AVATARS, AnimeAvatar } from '../utils/animeAvatars.js';
import { authStorage } from '../utils/authStorage.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  apiUrl: string;
  onAuthSuccess: (user: UserProfile, token: string) => void;
  onLogout: () => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

// Password strength calculation helper
export function getPasswordStrength(pass: string): {
  score: number;
  label: 'Too Short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;
  percent: number;
} {
  if (!pass) return { score: 0, label: 'Too Short', color: '#64748b', percent: 0 };
  if (pass.length < 6) return { score: 1, label: 'Too Short', color: '#ef4444', percent: 20 };

  let score = 0;
  if (pass.length >= 6) score++;
  if (pass.length >= 10) score++;
  if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
  if (/\d/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;

  if (score <= 1) return { score: 1, label: 'Weak', color: '#ef4444', percent: 25 };
  if (score === 2) return { score: 2, label: 'Fair', color: '#f59e0b', percent: 50 };
  if (score === 3 || score === 4) return { score: 3, label: 'Good', color: '#38bdf8', percent: 75 };
  return { score: 4, label: 'Strong', color: '#10b981', percent: 100 };
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

  // Profile edit state
  const [editUsername, setEditUsername] = useState(currentUser?.username || '');
  const [editGender, setEditGender] = useState(currentUser?.gender || '');
  const [editAvatar, setEditAvatar] = useState(currentUser?.avatarId || 'pikachu');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Sync state if currentUser changes
  React.useEffect(() => {
    if (currentUser) {
      setEditUsername(currentUser.username || '');
      setEditGender(currentUser.gender || '');
      setEditAvatar(currentUser.avatarId || 'pikachu');
    }
  }, [currentUser]);

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

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isChangingPassword) {
      if (!currentPassword) {
        setError('Please enter your current password.');
        return;
      }
      if (newPassword.length < 6) {
        setError('New password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New password and confirm password do not match.');
        return;
      }
    }

    setProfileSaving(true);
    try {
      const token = authStorage.getToken();
      const payload: any = {
        username: editUsername.trim(),
        gender: editGender,
        avatarId: editAvatar,
      };

      if (isChangingPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const res = await fetch(`${apiUrl}/api/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

      authStorage.setUser(data.user);
      onAuthSuccess(data.user, token || '');
      onNotify('Profile updated successfully! ✨', 'success');
      setIsChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const registerStrength = getPasswordStrength(password);
  const newPassStrength = getPasswordStrength(newPassword);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card auth-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div className="auth-modal-header-title">
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
            {error && <div className="auth-error-banner">{error}</div>}

            <form onSubmit={handleUpdateProfile} className="auth-profile-form">
              <div className="auth-profile-header-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '16px' }}>
                <AnimeAvatarDisplay username={editUsername || currentUser.username} avatarId={editAvatar} size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentUser.username}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{currentUser.email}</div>
                  {currentUser.gender && (
                    <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '10px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                      {currentUser.gender}
                    </span>
                  )}
                </div>
              </div>

              {/* Edit Name */}
              <div className="auth-form-group">
                <label className="auth-label">Display Name / Username</label>
                <div className="auth-input-wrap">
                  <User size={16} className="auth-input-icon" />
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder="Your Name"
                    className="auth-input"
                  />
                </div>
              </div>

              {/* Edit Gender */}
              <div className="auth-form-group">
                <label className="auth-label">Gender</label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value)}
                  className="auth-input"
                  style={{ background: 'rgba(15, 23, 42, 0.8)', color: '#f8fafc', border: '1px solid rgba(255, 255, 255, 0.12)', padding: '10px 14px', borderRadius: '8px', width: '100%' }}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              {/* Pick Avatar */}
              <div className="auth-form-group">
                <label className="auth-label">Anime Character</label>
                <div className="auth-avatar-grid" style={{ maxHeight: '110px', overflowY: 'auto', padding: '4px' }}>
                  {ANIME_AVATARS.map((opt: AnimeAvatar) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEditAvatar(opt.id)}
                      className={`auth-avatar-btn ${editAvatar === opt.id ? 'active' : ''}`}
                      title={opt.name}
                    >
                      <AnimeAvatarDisplay username={opt.name} avatarId={opt.id} size={26} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Password Change Collapsible Toggle */}
              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <button
                  type="button"
                  onClick={() => setIsChangingPassword(!isChangingPassword)}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: isChangingPassword ? '12px' : '4px' }}
                >
                  <KeyRound size={13} color="var(--accent)" />
                  <span>{isChangingPassword ? 'Cancel Password Change' : 'Change Password'}</span>
                </button>

                {isChangingPassword && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <div className="auth-form-group">
                      <label className="auth-label">Current Password</label>
                      <div className="auth-input-wrap">
                        <Lock size={15} className="auth-input-icon" />
                        <input
                          type="password"
                          required={isChangingPassword}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Current password"
                          className="auth-input"
                        />
                      </div>
                    </div>

                    <div className="auth-form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="auth-label">New Password</label>
                        {newPassword && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: newPassStrength.color }}>
                            {newPassStrength.label}
                          </span>
                        )}
                      </div>
                      <div className="auth-input-wrap">
                        <Lock size={15} className="auth-input-icon" />
                        <input
                          type="password"
                          required={isChangingPassword}
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 6 characters"
                          className="auth-input"
                        />
                      </div>
                      {/* Password Strength Meter Bar */}
                      {newPassword && (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{ height: '4px', width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${newPassStrength.percent}%`, background: newPassStrength.color, transition: 'all 0.25s ease' }} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="auth-form-group" style={{ marginBottom: 0 }}>
                      <label className="auth-label">Confirm New Password</label>
                      <div className="auth-input-wrap">
                        <Lock size={15} className="auth-input-icon" />
                        <input
                          type="password"
                          required={isChangingPassword}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                          className="auth-input"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '18px', gap: '10px' }}>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '9px 16px', fontSize: '13px', fontWeight: 600 }}
                >
                  {profileSaving ? 'Saving…' : 'Save Changes'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onNotify('Signed out successfully.', 'info');
                    onClose();
                  }}
                  className="btn btn-secondary auth-logout-btn"
                  style={{ padding: '9px 14px', fontSize: '13px' }}
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            </form>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="auth-label">Password</label>
                  {tab === 'register' && password && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: registerStrength.color }}>
                      {registerStrength.label}
                    </span>
                  )}
                </div>
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
                {/* Password Strength Meter Bar for Register */}
                {tab === 'register' && password && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ height: '4px', width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${registerStrength.percent}%`, background: registerStrength.color, transition: 'all 0.25s ease' }} />
                    </div>
                  </div>
                )}
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
