import React, { useState } from 'react';
import { Tv, Copy, Check, LogOut, Settings, Share2, Search, Clapperboard } from 'lucide-react';
import { ConnectionStatus, SyncStatePayload } from '../types.js';
import { SyncQualityBadge } from './SyncQualityBadge.js';

interface RoomHeaderProps {
  roomId: string;
  connectionStatus: ConnectionStatus;
  onLeaveRoom: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onOpenSettings: () => void;
  onOpenInvite?: () => void;
  onOpenSearch?: () => void;
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
      <div className="brand" onClick={onLeaveRoom}>
        <div className="brand-icon">
          <Tv size={20} color="#fff" />
        </div>
        <span className="brand-title">SyncTube</span>
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

      <div className="header-actions">
        {onOpenSearch && (
          <button
            className="btn btn-secondary header-btn"
            onClick={onOpenSearch}
            title="Search YouTube Videos"
            aria-label="Search YouTube"
          >
            <Search size={14} color="var(--accent)" />
            <span className="header-btn-text">Search</span>
          </button>
        )}

        {onToggleTheater && (
          <button
            className={`btn btn-secondary header-btn ${isTheaterMode ? 'btn-active' : ''}`}
            onClick={onToggleTheater}
            title={isTheaterMode ? 'Exit Cinema Theater Mode' : 'Cinema Theater Mode (Dim Lights)'}
            aria-label="Toggle Theater Mode"
          >
            <Clapperboard size={14} color={isTheaterMode ? 'var(--accent)' : 'currentColor'} />
            <span className="header-btn-text">Theater</span>
          </button>
        )}

        <button
          className="btn btn-secondary header-btn"
          onClick={handleCopyCode}
          title="Click to copy room code"
          aria-label={`Copy room code ${roomId}`}
        >
          {copiedCode ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
          <span className="header-btn-prefix">Room:</span>
          <strong className="header-room-code">{roomId}</strong>
        </button>

        {onOpenInvite && (
          <button
            className="btn btn-primary header-btn header-invite-btn"
            onClick={onOpenInvite}
            title="Invite friends & Show QR Code"
            aria-label="Invite Friends"
          >
            <Share2 size={14} />
            <span className="header-btn-text">Invite</span>
          </button>
        )}

        <button
          className="btn btn-secondary header-btn"
          onClick={onOpenSettings}
          title="Room & User Settings"
          aria-label="Settings"
        >
          <Settings size={14} />
          <span className="header-btn-text">Settings</span>
        </button>

        <button
          className="btn btn-danger header-btn"
          onClick={onLeaveRoom}
          title="Leave Room"
          aria-label="Leave room"
        >
          <LogOut size={14} />
          <span className="header-btn-text">Leave</span>
        </button>
      </div>
    </header>
  );
};
