import React, { useState, useEffect } from 'react';
import { Tv, Sparkles, PlusCircle, LogIn, ArrowRight, PlaySquare } from 'lucide-react';
import { extractYouTubeId } from '../utils/youtube.js';

interface HomePageProps {
  onEnterRoom: (roomId: string, username: string, isCreator?: boolean) => void;
  onNotify: (msg: string, type: 'success' | 'error') => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onEnterRoom, onNotify }) => {
  const [createUsername, setCreateUsername] = useState('');
  const [createVideoUrl, setCreateVideoUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [joinUsername, setJoinUsername] = useState('');
  const [joinRoomCode, setJoinRoomCode] = useState('');

  // Check if URL has ?room=ABC123
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setJoinRoomCode(roomParam.toUpperCase());
    }
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUsername.trim()) {
      onNotify('Please enter your name.', 'error');
      return;
    }

    let initialVideoId = 'dQw4w9WgXcQ';
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
      const apiUrl = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:10000' : window.location.origin);
      const res = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initialVideoId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create room');
      }

      const data = await res.json();
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
      const apiUrl = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:10000' : window.location.origin);
      const res = await fetch(`${apiUrl}/api/rooms/${normalizedRoom}`);
      if (!res.ok) {
        throw new Error(`Room "${normalizedRoom}" was not found.`);
      }

      onEnterRoom(normalizedRoom, joinUsername.trim(), false);
    } catch (err) {
      onNotify((err as Error).message, 'error');
    }
  };

  return (
    <div className="home-container">
      <div className="hero">
        <div className="hero-pill">
          <Sparkles size={14} />
          Real-Time Watch Party System
        </div>
        <h1 className="hero-title">Watch YouTube Together in Real-Time</h1>
        <p className="hero-desc">
          Synchronize playback, invite your group, and stream videos simultaneously with authoritative role-based controls.
        </p>
      </div>

      <div className="home-grid">
        {/* Create Room Card */}
        <div className="glass-panel home-card">
          <h2 className="card-title">
            <PlusCircle size={22} color="var(--primary)" />
            Create a Room
          </h2>
          <p className="card-subtitle">
            Start a new watch party. As the creator, you will automatically have the Host role with full playback controls.
          </p>

          <form onSubmit={handleCreateRoom}>
            <div className="input-group">
              <label className="input-label">Your Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Alice"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                maxLength={50}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">YouTube URL or Video ID (Optional)</label>
              <input
                type="text"
                className="input-field"
                placeholder="https://www.youtube.com/watch?v=..."
                value={createVideoUrl}
                onChange={(e) => setCreateVideoUrl(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={isCreating}
            >
              {isCreating ? 'Creating Room...' : 'Start Watch Party'}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>

        {/* Join Room Card */}
        <div className="glass-panel home-card">
          <h2 className="card-title">
            <LogIn size={22} color="var(--accent-purple)" />
            Join a Room
          </h2>
          <p className="card-subtitle">
            Enter an existing room code or link to join an active watch party with your friends.
          </p>

          <form onSubmit={handleJoinRoom}>
            <div className="input-group">
              <label className="input-label">Your Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Bob"
                value={joinUsername}
                onChange={(e) => setJoinUsername(e.target.value)}
                maxLength={50}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Room Code</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. ABC123"
                value={joinRoomCode}
                onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                maxLength={16}
                required
                style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              Join Room
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
