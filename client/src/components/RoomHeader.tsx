import React, { useState } from 'react';
import { Tv, Copy, Check, LogOut, Settings, Share2, Search, Clapperboard, Activity, User, Globe } from 'lucide-react';
import { ConnectionStatus, SyncStatePayload, UserProfile } from '../types.js';
import { SyncQualityBadge } from './SyncQualityBadge.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';

interface RoomHeaderProps {
  roomId: string;
  connectionStatus: ConnectionStatus;
  onLeaveRoom: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onOpenSettings: () => void;
  onOpenInvite?: () => void;
  onOpenSearch?: () => void;
  onOpenDiagnostics?: () => void;
  onOpenAuth?: () => void;
  onOpenBrowserHub?: () => void;
  currentUser?: UserProfile | null;
  isTheaterMode?: boolean;
  onToggleTheater?: () => void;
  syncState?: SyncStatePayload | null;
  currentTime?: number;
  onResync?: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomId,
  connectionStatus,
  onLeaveRoom,
  onNotify,
  onOpenSettings,
  onOpenInvite,
  onOpenSearch,
  onOpenDiagnostics,
  onOpenAuth,
  onOpenBrowserHub,
  currentUser,
  isTheaterMode,
  onToggleTheater,
  syncState = null,
  currentTime = 0,
  onResync,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    onNotify(`Room code ${roomId} copied!`, 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <header className="app-header">
      {/* Left Cluster: Brand & Room Code Chip */}
      <div className="header-left-cluster">
        <div className="brand" onClick={onLeaveRoom} title="SyncTube Home">
          <div className="brand-icon">
            <Tv size={18} color="#ffd21f" />
          </div>
          <span className="brand-title">SyncTube</span>
        </div>

        <button
          className="header-room-chip"
          onClick={handleCopyCode}
          title="Click to copy room code"
          aria-label={`Copy room code ${roomId}`}
        >
          <span className="room-chip-dot" />
          <span className="room-chip-label">Room</span>
          <strong className="room-chip-code">{roomId}</strong>
          {copiedCode ? <Check size={13} className="text-emerald" /> : <Copy size={13} />}
        </button>
      </div>

      {/* Center: Live Sync Quality Badge */}
      <div className="header-sync-center">
        <SyncQualityBadge
          syncState={syncState}
          currentTime={currentTime}
          isConnected={connectionStatus === 'connected'}
          onResync={onResync}
        />
      </div>

      {/* Right Cluster: Primary Invite + Media Actions + Quick Tools */}
      <div className="header-actions">
        {onOpenInvite && (
          <button
            className="btn btn-primary header-invite-btn"
            onClick={onOpenInvite}
            title="Invite friends & Show QR Code"
            aria-label="Invite Friends"
          >
            <Share2 size={14} />
            <span className="header-btn-text">Invite</span>
          </button>
        )}

        {onOpenSearch && (
          <button
            className="btn btn-secondary header-btn"
            onClick={onOpenSearch}
            title="Change Video or Search YouTube"
            aria-label="Change Video"
          >
            <Search size={14} color="var(--accent)" />
            <span className="header-btn-text">Change Video</span>
          </button>
        )}

        {onOpenBrowserHub && (
          <button
            className="btn btn-secondary header-btn"
            onClick={onOpenBrowserHub}
            title="Open Universal Browser & Cinema Hub (Netflix, Prime, Disney+, Crunchyroll, Twitch, Direct Links)"
            aria-label="Browser Hub"
            id="browser-hub-header-btn"
          >
            <Globe size={14} color="#60a5fa" />
            <span className="header-btn-text">Browser Hub</span>
          </button>
        )}

        {/* Quick Tools Cluster */}
        <div className="header-tools-group">
          {onToggleTheater && (
            <button
              className={`btn-icon header-tool-btn ${isTheaterMode ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleTheater();
              }}
              title={isTheaterMode ? 'Exit Cinema Theater Mode' : 'Cinema Theater Mode (Dim Lights)'}
              aria-label="Toggle Theater Mode"
            >
              <Clapperboard size={15} color={isTheaterMode ? 'var(--accent)' : 'currentColor'} />
            </button>
          )}

          {onOpenDiagnostics && (
            <button
              className="btn-icon header-tool-btn"
              onClick={onOpenDiagnostics}
              title="Sync Diagnostics & Telemetry"
              aria-label="Diagnostics"
            >
              <Activity size={15} color="#06b6d4" />
            </button>
          )}

          {onOpenAuth && (
            <button
              className="btn-icon header-tool-btn"
              onClick={onOpenAuth}
              title={currentUser ? `Profile: @${currentUser.username}` : 'Sign in or register'}
              aria-label="Account"
            >
              {currentUser ? (
                <AnimeAvatarDisplay username={currentUser.username} avatarId={currentUser.avatarId || 'pikachu'} size={20} />
              ) : (
                <User size={15} color="#c084fc" />
              )}
            </button>
          )}

          <button
            className="btn-icon header-tool-btn"
            onClick={onOpenSettings}
            title="Room & User Settings"
            aria-label="Settings"
          >
            <Settings size={15} />
          </button>

          <button
            className="btn-icon header-tool-btn header-leave-btn"
            onClick={onLeaveRoom}
            title="Leave Watch Party"
            aria-label="Leave room"
          >
            <LogOut size={15} color="#f87171" />
          </button>
        </div>
      </div>
    </header>
  );
};
