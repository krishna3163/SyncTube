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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md p-6 bg-slate-900/90 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-16 -right-16 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-bold text-white bg-gradient-to-r from-purple-500 to-cyan-500 rounded">
              V2
            </span>
            <h2 className="text-lg font-bold text-white">
              {currentUser ? 'Your Profile' : tab === 'login' ? 'Sign In to SyncTube' : 'Create SyncTube Account'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {currentUser ? (
          <div className="py-6 flex flex-col items-center gap-4 text-center">
            <div className="relative w-20 h-20 rounded-full border-2 border-purple-500/50 p-1 bg-slate-800 flex items-center justify-center">
              <AnimeAvatarDisplay username={currentUser.username} avatarId={currentUser.avatarId || 'pikachu'} size={60} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{currentUser.username}</h3>
              <p className="text-xs text-slate-400">{currentUser.email}</p>
              {currentUser.bio && <p className="text-xs text-slate-300 mt-2 italic">"{currentUser.bio}"</p>}
            </div>

            <button
              onClick={() => {
                onLogout();
                onNotify('Signed out successfully.', 'info');
                onClose();
              }}
              className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl hover:bg-rose-500/20 transition"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        ) : (
          <div className="py-4">
            {/* Tab switch */}
            <div className="flex p-1 mb-5 bg-slate-950/60 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => { setTab('login'); setError(null); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
                  tab === 'login' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setTab('register'); setError(null); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
                  tab === 'register' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Register
              </button>
            </div>

            {error && (
              <div className="p-3 mb-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {tab === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Username</label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Choose username"
                        className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Pick Avatar</label>
                    <div className="grid grid-cols-6 gap-2 p-2 bg-slate-950/60 border border-slate-800 rounded-xl max-h-28 overflow-y-auto">
                      {ANIME_AVATARS.map((opt: AnimeAvatar) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelectedAvatar(opt.id)}
                          className={`p-1 rounded-lg border flex items-center justify-center transition ${
                            selectedAvatar === opt.id
                              ? 'border-purple-500 bg-purple-500/20'
                              : 'border-transparent hover:border-slate-700'
                          }`}
                        >
                          <AnimeAvatarDisplay username={opt.name} avatarId={opt.id} size={28} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-purple-600/30 transition disabled:opacity-50"
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
