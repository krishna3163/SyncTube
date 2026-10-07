import React, { useState, useEffect } from 'react';
import {
  Tv,
  Sparkles,
  PlusCircle,
  Users,
  User,
  Link2,
  Hash,
  Play,
  LogIn,
  ArrowRight,
  Clock,
  Trash2,
  Copy,
  RotateCcw,
  X,
  ChevronDown,
  ChevronRight,
  Home,
  HelpCircle,
  Settings,
  Sun,
} from 'lucide-react';
import { extractYouTubeId } from '../utils/youtube.js';
import {
  getStoredParties,
  saveStoredParty,
  removeStoredParty,
  clearStoredParties,
} from '../utils/partyStorage.js';
import { StoredWatchParty, UserSettings } from '../types.js';
import { ANIME_AVATARS, getAvatarById } from '../utils/animeAvatars.js';
import { AnimeAvatarDisplay, AvatarPicker } from '../components/AnimeAvatar.js';
import { rememberParticipantCharacter } from '../utils/characterMemory.js';
import { getSafeYouTubeThumbnailUrl, saveRoomIdentityToken } from '../utils/identity.js';

interface HomePageProps {
  userId: string;
  onEnterRoom: (roomId: string, username: string, isCreator?: boolean) => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const getApiUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalhost) {
      return '';
    }
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    return 'https://youtube-watch-party-api-buaf.onrender.com';
  }
  return envUrl || 'https://youtube-watch-party-api-buaf.onrender.com';
};

export const HomePage: React.FC<HomePageProps> = ({ userId, onEnterRoom, onNotify }) => {
  // Saved user profile from localStorage
  const savedSettings = (() => {
    try {
      const saved = localStorage.getItem('synctube_user_settings');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })();

  const initialName = savedSettings?.name || '';
  const [createUsername, setCreateUsername] = useState(initialName);
  const [createVideoUrl, setCreateVideoUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [joinUsername, setJoinUsername] = useState(initialName);
  const [joinRoomCode, setJoinRoomCode] = useState('');

  // Current active user to filter history
  const activeUsername = (createUsername || joinUsername || initialName || '').trim();

  // Selected Profile Avatar ID
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(() => {
    if (savedSettings?.avatarId) return savedSettings.avatarId;
    return localStorage.getItem('synctube_avatar_id') || 'tanjiro';
  });

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isFeaturesOpen, setIsFeaturesOpen] = useState(false);

  // Stored watch parties in browser (filtered by user)
  const [storedParties, setStoredParties] = useState<StoredWatchParty[]>([]);

  useEffect(() => {
    setStoredParties(getStoredParties(activeUsername || undefined));
  }, [activeUsername]);

  const refreshParties = (userToFilter?: string) => {
    setStoredParties(getStoredParties(userToFilter || activeUsername || undefined));
  };

  // Check if URL has ?room=ABC123 or pathname /ABC123
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const pathMatch = window.location.pathname.match(/^\/([A-Za-z0-9_-]{4,16})$/);
    const detectedRoom = roomParam || (pathMatch ? pathMatch[1] : null);
    if (detectedRoom) {
      setJoinRoomCode(detectedRoom.toUpperCase());
    }
  }, []);

  const saveUserAvatar = (name: string, avatarId: string) => {
    const existing = localStorage.getItem('synctube_user_settings');
    let updated: UserSettings = {
      name,
      color: '#2f618f',
      rememberMe: true,
      avatarId,
    };
    if (existing) {
      try {
        updated = { ...JSON.parse(existing), name, avatarId };
      } catch {}
    }
    localStorage.setItem('synctube_user_settings', JSON.stringify(updated));
    localStorage.setItem('synctube_avatar_id', avatarId);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUsername.trim()) {
      onNotify('Please enter your name.', 'error');
      return;
    }

    let initialVideoId = '';
    if (createVideoUrl.trim()) {
      const extracted = extractYouTubeId(createVideoUrl.trim());
      if (!extracted) {
        onNotify('Invalid YouTube URL or ID.', 'error');
        return;
      }
      initialVideoId = extracted;
    }

    setIsCreating(true);

    try {
      let apiUrl = getApiUrl();
      let res = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialVideoId, creatorUserId: userId }),
      });

      // If relative URL returned 405 (e.g. Vercel static rewrite), fallback directly to Render backend
      if (res.status === 405 && apiUrl !== 'https://youtube-watch-party-api-buaf.onrender.com') {
        apiUrl = 'https://youtube-watch-party-api-buaf.onrender.com';
        res = await fetch(`${apiUrl}/api/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initialVideoId, creatorUserId: userId }),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create room');
      }

      const data = await res.json();
      if (typeof data.identityToken === 'string') saveRoomIdentityToken(data.roomId, data.identityToken);
      saveUserAvatar(createUsername.trim(), selectedAvatarId);
      rememberParticipantCharacter(createUsername.trim(), undefined, selectedAvatarId);
      saveStoredParty({
        roomId: data.roomId,
        username: createUsername.trim(),
        role: 'HOST',
        videoId: initialVideoId,
        avatarId: selectedAvatarId,
        lastVisited: Date.now(),
      });
      refreshParties(createUsername.trim());
      onNotify(`Room ${data.roomId} created!`, 'success');
      onEnterRoom(data.roomId, createUsername.trim(), true);
    } catch (err) {
      onNotify((err as Error).message, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinUsername.trim()) {
      onNotify('Please enter your name.', 'error');
      return;
    }
    if (!joinRoomCode.trim()) {
      onNotify('Please enter a room code.', 'error');
      return;
    }

    const normalizedRoom = joinRoomCode.trim().toUpperCase();

    try {
      if (!/^[A-Za-z0-9_-]{4,16}$/.test(normalizedRoom)) {
        throw new Error('Invalid room code.');
      }
      const apiUrl = getApiUrl();
      let roomData: any = {};
      try {
        const res = await fetch(`${apiUrl}/api/rooms/${encodeURIComponent(normalizedRoom)}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(`Room "${normalizedRoom}" was not found.`);
          }
        } else {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            roomData = await res.json().catch(() => ({}));
          }
        }
      } catch (fetchErr: any) {
        if (fetchErr?.message?.includes('not found')) {
          throw fetchErr;
        }
        console.warn('API room check bypassed, continuing to WebSocket join:', fetchErr);
      }

      saveUserAvatar(joinUsername.trim(), selectedAvatarId);
      rememberParticipantCharacter(joinUsername.trim(), undefined, selectedAvatarId);
      saveStoredParty({
        roomId: normalizedRoom,
        username: joinUsername.trim(),
        role: 'PARTICIPANT',
        videoId: roomData.videoId || '',
        avatarId: selectedAvatarId,
        lastVisited: Date.now(),
      });
      refreshParties(joinUsername.trim());

      onEnterRoom(normalizedRoom, joinUsername.trim(), false);
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  const handleRejoinParty = async (party: StoredWatchParty) => {
    const userToUse = party.username || 'Viewer';
    setJoinUsername(userToUse);
    setJoinRoomCode(party.roomId);

    if (party.avatarId) {
      setSelectedAvatarId(party.avatarId);
      saveUserAvatar(userToUse, party.avatarId);
      rememberParticipantCharacter(userToUse, undefined, party.avatarId);
    }

    try {
      const apiUrl = getApiUrl();
      try {
        if (!/^[A-Za-z0-9_-]{4,16}$/.test(party.roomId)) {
          throw new Error('Invalid saved room code.');
        }
        const res = await fetch(`${apiUrl}/api/rooms/${encodeURIComponent(party.roomId)}`);
        if (res.ok) {
          saveStoredParty({
            roomId: party.roomId,
            username: userToUse,
            role: party.role,
            videoId: party.videoId,
            avatarId: party.avatarId,
            lastVisited: Date.now(),
          });
          refreshParties();
          onNotify(`Rejoining room ${party.roomId}...`, 'success');
          onEnterRoom(party.roomId, userToUse, party.role === 'HOST');
          return;
        } else if (res.status === 404) {
          onNotify(
            `Room ${party.roomId} is no longer open. Fill out below to restart a party with this video!`,
            'error'
          );
          if (party.videoId) {
            setCreateVideoUrl(`https://www.youtube.com/watch?v=${party.videoId}`);
          }
          setCreateUsername(userToUse);
          return;
        }
      } catch (fetchErr) {
        console.warn('API check error on rejoin, proceeding to room:', fetchErr);
      }

      saveStoredParty({
        roomId: party.roomId,
        username: userToUse,
        role: party.role,
        videoId: party.videoId,
        avatarId: party.avatarId,
        lastVisited: Date.now(),
      });
      refreshParties();
      onNotify(`Rejoining room ${party.roomId}...`, 'success');
      onEnterRoom(party.roomId, userToUse, party.role === 'HOST');
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  const handleRemoveParty = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = removeStoredParty(roomId, activeUsername || undefined);
    setStoredParties(updated);
    onNotify(`Removed Room ${roomId} from history.`, 'success');
  };

  const handleClearHistory = () => {
    const confirmPrompt = activeUsername
      ? `Clear watch party history for "${activeUsername}"?`
      : 'Clear all stored watch party history in this browser?';
    if (window.confirm(confirmPrompt)) {
      clearStoredParties(activeUsername || undefined);
      setStoredParties([]);
      onNotify('Watch party history cleared.', 'success');
    }
  };

  const handleCopyLink = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard
      .writeText(link)
      .then(() => onNotify(`Copied room link: ${link}`, 'success'))
      .catch(() => onNotify(`Room link: ${link}`, 'success'));
  };

  const formatTimeAgo = (timestamp: number): string => {
    if (!timestamp) return 'Recently';
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const currentAvatar = getAvatarById(selectedAvatarId) || ANIME_AVATARS[0];

  return (
    <div className="home-page-wrapper">
      {/* Top Navbar */}
      <header className="home-top-navbar">
        <div className="home-nav-left">
          <div className="brand brand-logo">
            <div className="brand-icon">
              <Tv size={20} color="#ffd21f" />
            </div>
            <span className="brand-title brand-text">SyncTube</span>
          </div>
        </div>

        <nav className="home-nav-center">
          <div className="home-nav-pills">
            <button type="button" className="home-nav-pill active">
              <Home size={14} />
              <span>Home</span>
            </button>
            <button
              type="button"
              className="home-nav-pill"
              onClick={() => setIsHowItWorksOpen(true)}
            >
              <Settings size={14} />
              <span>How it works</span>
            </button>
            <button
              type="button"
              className="home-nav-pill"
              onClick={() => setIsFeaturesOpen(true)}
            >
              <Sparkles size={14} />
              <span>Features</span>
            </button>
          </div>
        </nav>

        <div className="home-nav-right">
          {/* Theme toggle (temporarily hidden per user request) */}
          {false && (
            <button
              type="button"
              className="btn-icon home-theme-btn"
              title="Theme toggle"
              onClick={() => onNotify('Dark theme is active', 'info')}
            >
              <Sun size={17} />
            </button>
          )}

          <div
            className="home-header-profile"
            onClick={() => setIsAvatarModalOpen(true)}
            title="Click to change your anime character"
          >
            <div className="home-header-avatar-wrap">
              <AnimeAvatarDisplay username={currentAvatar.name} avatarId={selectedAvatarId} size={34} />
            </div>
            <div className="home-header-profile-text">
              <span className="home-header-profile-name">{currentAvatar.name}</span>
            </div>
            <ChevronDown size={14} className="home-header-profile-arrow" />
          </div>
        </div>
      </header>

      {/* Hero Section with Ambient Background */}
      <div className="home-container">
        <div className="hero">
          <div className="hero-decor-left" aria-hidden="true" />
          <div className="hero-decor-right" aria-hidden="true">
            <span className="decor-script-text">Better Movies Together</span>
          </div>

          <div className="hero-pill">
            <Sparkles size={13} color="var(--accent)" />
            <span>Real-Time Watch Party System</span>
          </div>

          <h1 className="hero-title">
            Watch YouTube Together in <span className="hero-highlight">Real-Time</span>
          </h1>

          <p className="hero-desc">
            Synchronize playback, invite your group, and stream videos simultaneously with authoritative role-based controls.
          </p>
        </div>

        {/* YOUR PROFILE CHARACTER Banner (temporarily hidden per user request) */}
        {false && (
          <div className="home-profile-banner">
            <div className="home-profile-left">
              <div
                className="home-profile-avatar-wrap"
                onClick={() => setIsAvatarModalOpen(true)}
                title="Click to choose a different anime character"
              >
                <AnimeAvatarDisplay username={currentAvatar.name} avatarId={selectedAvatarId} size={54} />
                <span className="online-status-dot" title="Online & ready" />
              </div>
              <div className="home-profile-info">
                <span className="home-profile-greeting">YOUR PROFILE CHARACTER</span>
                <div className="home-profile-name-row">
                  <span className="home-profile-char-name">{currentAvatar.name}</span>
                  <span className="home-profile-char-series">{currentAvatar.series}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="home-choose-char-btn"
              onClick={() => setIsAvatarModalOpen(true)}
            >
              <Sparkles size={14} color="var(--accent)" />
              <span>Choose Character</span>
              <ChevronRight size={15} />
            </button>
          </div>
        )}

        {/* The Two Main Action Cards Grid */}
        <div className="home-grid">
          {/* Card 1: Create a Room */}
          <div className="home-card create-card">
            <div className="home-card-header">
              <div className="home-card-icon-box create-icon">
                <PlusCircle size={20} color="var(--accent)" />
              </div>
              <div className="home-card-title-wrap">
                <h2 className="card-title">Create a Room</h2>
                <p className="card-subtitle">
                  Start a new watch party. As the creator, you will automatically have the Host role with full playback controls.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateRoom} className="home-card-form">
              <div className="input-group">
                <div className="input-label-row">
                  <label className="input-label">Your Name</label>
                  <button
                    type="button"
                    className="btn-text-change-avatar"
                    onClick={() => setIsAvatarModalOpen(true)}
                  >
                    <Sparkles size={12} />
                    <span>Change Character</span>
                  </button>
                </div>
                <div className="input-with-left-icon">
                  <User size={16} className="input-left-icon" />
                  <input
                    type="text"
                    className="input-field input-field-icon"
                    placeholder="e.g. Alice"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    maxLength={50}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">YouTube URL or Video ID (Optional)</label>
                <div className="input-with-left-icon">
                  <Link2 size={16} className="input-left-icon" />
                  <input
                    type="text"
                    className="input-field input-field-icon"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={createVideoUrl}
                    onChange={(e) => setCreateVideoUrl(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-card-action create-action-btn"
                disabled={isCreating}
              >
                <Play size={16} fill="currentColor" />
                <span>{isCreating ? 'Creating Room...' : 'Start Watch Party'}</span>
                <ArrowRight size={16} />
              </button>
            </form>
          </div>

          {/* Card 2: Join a Room */}
          <div className="home-card join-card">
            <div className="home-card-header">
              <div className="home-card-icon-box join-icon">
                <Users size={20} color="var(--accent)" />
              </div>
              <div className="home-card-title-wrap">
                <h2 className="card-title">Join a Room</h2>
                <p className="card-subtitle">
                  Enter an existing room code or link to join an active watch party with your friends.
                </p>
              </div>
            </div>

            <form onSubmit={handleJoinRoom} className="home-card-form">
              <div className="input-group">
                <div className="input-label-row">
                  <label className="input-label">Your Name</label>
                  <button
                    type="button"
                    className="btn-text-change-avatar"
                    onClick={() => setIsAvatarModalOpen(true)}
                  >
                    <Sparkles size={12} />
                    <span>Change Character</span>
                  </button>
                </div>
                <div className="input-with-left-icon">
                  <User size={16} className="input-left-icon" />
                  <input
                    type="text"
                    className="input-field input-field-icon"
                    placeholder="e.g. Bob"
                    value={joinUsername}
                    onChange={(e) => setJoinUsername(e.target.value)}
                    maxLength={50}
                    required
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Room Code</label>
                <div className="input-with-left-icon">
                  <Hash size={16} className="input-left-icon" />
                  <input
                    type="text"
                    className="input-field input-field-icon code-input"
                    placeholder="e.g. ABC123"
                    value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                    maxLength={16}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-card-action join-action-btn"
              >
                <LogIn size={16} />
                <span>Join Room</span>
                <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>

        {/* Your Watch Party History Section */}
        <div className="stored-parties-section">
          <div className="stored-parties-header">
            <div className="stored-parties-title-wrap">
              <RotateCcw size={19} color="var(--accent)" />
              <h2 className="stored-parties-title">
                {activeUsername ? `${activeUsername}'s Watch Party History` : 'Your Watch Party History'}
              </h2>
              <span className="stored-parties-count">{storedParties.length} saved</span>
            </div>

            {storedParties.length > 0 && (
              <button
                type="button"
                className="btn-clear-history"
                onClick={handleClearHistory}
                title="Clear history from this browser"
              >
                <Trash2 size={14} />
                <span>Clear All</span>
              </button>
            )}
          </div>

          {storedParties.length === 0 ? (
            <div className="stored-parties-empty">
              <Tv size={32} color="var(--text-muted)" style={{ opacity: 0.6, marginBottom: '0.5rem' }} />
              <p className="empty-text">
                {activeUsername
                  ? `No watch parties saved for "${activeUsername}" yet.`
                  : 'No watch parties saved in this browser yet.'}
              </p>
              <p className="empty-subtext">
                Create a new room or join an existing session above and it will be saved here automatically for quick rejoining!
              </p>
            </div>
          ) : (
            <div className="stored-parties-grid">
              {storedParties.map((party) => {
                const videoId = party.videoId || '';
                const thumbUrl = getSafeYouTubeThumbnailUrl(undefined, videoId);
                const isHost = party.role === 'HOST';

                return (
                  <div
                    key={party.roomId}
                    className="stored-party-card"
                    onClick={() => handleRejoinParty(party)}
                  >
                    <div className="stored-party-thumb-wrap">
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={`Watch party ${party.roomId}`}
                          className="stored-party-thumb"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = '/video-placeholder.svg';
                          }}
                        />
                      ) : (
                        <div className="stored-party-thumb video-thumb-empty">No video selected</div>
                      )}
                      <span className="stored-party-time-badge">
                        <Clock size={11} />
                        <span>{formatTimeAgo(party.lastVisited)}</span>
                      </span>
                    </div>

                    <div className="stored-party-content">
                      <div className="stored-party-top-row">
                        <span className="stored-party-code">#{party.roomId}</span>
                        <span className={`stored-party-role-badge ${isHost ? 'role-host' : 'role-viewer'}`}>
                          {isHost ? 'HOST' : 'VIEWER'}
                        </span>
                      </div>

                      <div className="stored-party-user-row">
                        <AnimeAvatarDisplay
                          username={party.username || 'Viewer'}
                          avatarId={party.avatarId}
                          size={24}
                        />
                        <span className="stored-party-username">{party.username || 'Viewer'}</span>
                      </div>

                      <div className="stored-party-actions-row">
                        <button
                          type="button"
                          className="btn-history-rejoin"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRejoinParty(party);
                          }}
                        >
                          <RotateCcw size={14} />
                          <span>Rejoin</span>
                        </button>

                        <button
                          type="button"
                          className="btn-history-icon"
                          title="Copy Room Link"
                          onClick={(e) => handleCopyLink(party.roomId, e)}
                        >
                          <Copy size={15} />
                        </button>

                        <button
                          type="button"
                          className="btn-history-icon btn-history-delete"
                          title="Remove from history"
                          onClick={(e) => handleRemoveParty(party.roomId, e)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Anime Avatar Picker Modal */}
      {isAvatarModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAvatarModalOpen(false)}>
          <div
            className="glass-panel modal-card avatar-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Sparkles size={20} color="var(--accent)" />
                <h2 className="modal-title">Choose Your Anime Character</h2>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsAvatarModalOpen(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.1rem', lineHeight: 1.5 }}>
                Select an anime character to represent you in the watch party and live chat:
              </p>
              <AvatarPicker
                selectedId={selectedAvatarId}
                username={createUsername || joinUsername || 'Player'}
                onSelect={(id) => {
                  setSelectedAvatarId(id);
                  saveUserAvatar(createUsername || joinUsername || 'Viewer', id);
                  const char = getAvatarById(id);
                  onNotify(`Selected ${char?.name || id}!`, 'success');
                  setIsAvatarModalOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* How It Works Modal */}
      {isHowItWorksOpen && (
        <div className="modal-backdrop" onClick={() => setIsHowItWorksOpen(false)}>
          <div className="glass-panel modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <HelpCircle size={20} color="var(--accent)" />
                <h2 className="modal-title">How SyncTube Works</h2>
              </div>
              <button type="button" className="btn-icon" onClick={() => setIsHowItWorksOpen(false)} title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="how-it-works-step">
                <span className="step-num">1</span>
                <div>
                  <h4 style={{ margin: '0 0 0.2rem 0', color: 'var(--text-main)' }}>Pick Your Identity</h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>Choose an anime character avatar and enter your display name.</p>
                </div>
              </div>
              <div className="how-it-works-step">
                <span className="step-num">2</span>
                <div>
                  <h4 style={{ margin: '0 0 0.2rem 0', color: 'var(--text-main)' }}>Create or Join a Room</h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>Start a new room as Host or enter an invite code to join your friends.</p>
                </div>
              </div>
              <div className="how-it-works-step">
                <span className="step-num">3</span>
                <div>
                  <h4 style={{ margin: '0 0 0.2rem 0', color: 'var(--text-main)' }}>Enjoy Perfectly Synced Streams</h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>Watch videos in real-time sync with floating reactions, live chat, and party sound effects!</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Features Modal */}
      {isFeaturesOpen && (
        <div className="modal-backdrop" onClick={() => setIsFeaturesOpen(false)}>
          <div className="glass-panel modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Sparkles size={20} color="var(--accent)" />
                <h2 className="modal-title">SyncTube Features</h2>
              </div>
              <button type="button" className="btn-icon" onClick={() => setIsFeaturesOpen(false)} title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <div className="feature-item-card">
                <span className="feature-emoji">⚡</span>
                <h4 style={{ margin: '0.3rem 0 0.1rem 0', fontSize: '0.9rem' }}>Millisecond Sync</h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Authoritative server engine keeps playback within ±0.1s drift.</p>
              </div>
              <div className="feature-item-card">
                <span className="feature-emoji">🎨</span>
                <h4 style={{ margin: '0.3rem 0 0.1rem 0', fontSize: '0.9rem' }}>Anime Avatars</h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>16 official popular anime character profile photos.</p>
              </div>
              <div className="feature-item-card">
                <span className="feature-emoji">🎉</span>
                <h4 style={{ margin: '0.3rem 0 0.1rem 0', fontSize: '0.9rem' }}>Floating Reactions</h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Twitch & Instagram live style rising emoji explosions.</p>
              </div>
              <div className="feature-item-card">
                <span className="feature-emoji">🔍</span>
                <h4 style={{ margin: '0.3rem 0 0.1rem 0', fontSize: '0.9rem' }}>In-App Search</h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Search and queue any YouTube video without leaving the app.</p>
              </div>
              <div className="feature-item-card">
                <span className="feature-emoji">🎭</span>
                <h4 style={{ margin: '0.3rem 0 0.1rem 0', fontSize: '0.9rem' }}>Anime Identity</h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Consistent anime character, remembered across viewers, chat, and requests.</p>
              </div>
              <div className="feature-item-card">
                <span className="feature-emoji">📱</span>
                <h4 style={{ margin: '0.3rem 0 0.1rem 0', fontSize: '0.9rem' }}>QR Code Invite</h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Scan with phone camera to join any room instantly.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
