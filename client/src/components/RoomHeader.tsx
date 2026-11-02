import React, { useState, useEffect, useRef } from 'react';
import { Tv, Copy, Check, LogOut, Settings, Share2, Search, Clapperboard, Activity, User, Globe, Film, SlidersHorizontal, Volume2, BookOpen, PartyPopper, ChevronDown } from 'lucide-react';
import { ConnectionStatus, SyncStatePayload, UserProfile } from '../types.js';
import { RoomExperienceMode } from '../types/study.js';
import { SyncQualityBadge } from './SyncQualityBadge.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { StudyHeaderClock } from './StudyHeaderClock.js';

interface RoomHeaderProps {
  roomId: string;
  connectionStatus: ConnectionStatus;
  onLeaveRoom: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
  onOpenSettings: () => void;
  onOpenFeatureControls?: () => void;
  onOpenSoundboard?: () => void;
  onOpenInvite?: () => void;
  onOpenSearch?: () => void;
  onOpenDiagnostics?: () => void;
  showDiagnostics?: boolean;
  onOpenAuth?: () => void;
  currentUser?: UserProfile | null;
  isTheaterMode?: boolean;
  onToggleTheater?: () => void;
  roomMode?: RoomExperienceMode;
  onSelectRoomMode?: (mode: RoomExperienceMode) => void;
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
  onOpenFeatureControls,
  onOpenSoundboard,
  onOpenInvite,
  onOpenSearch,
  onOpenDiagnostics,
  showDiagnostics = true,
  onOpenAuth,
  currentUser,
  isTheaterMode,
  onToggleTheater,
  roomMode = 'party',
  onSelectRoomMode,
  syncState = null,
  currentTime = 0,
  onResync,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setIsModeMenuOpen(false);
      }
    };
    if (isModeMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isModeMenuOpen]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    onNotify(`Room code ${roomId} copied!`, 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <header className="app-header">
      {/* Left Cluster: Brand & Room Code Chip OR Study Focus Clock */}
      <div className="header-left-cluster">
        <div className="brand" onClick={onLeaveRoom} title="SyncTube Home">
          <div className="brand-icon">
            <Tv size={18} color="#ffd21f" />
          </div>
          <span className="brand-title">SyncTube</span>
        </div>

        {roomMode === 'study' ? (
          <StudyHeaderClock
            roomId={roomId}
            onCopyRoomCode={handleCopyCode}
            copiedCode={copiedCode}
            onPomodoroEnd={(mode) => {
              if (mode === 'focus') {
                onNotify('☕ Great focus session! Time for a 5-minute break.', 'success');
              } else {
                onNotify('📚 Break over! Ready for the next focus sprint.', 'info');
              }
            }}
          />
        ) : (
          <button
            className={`header-room-chip ${copiedCode ? 'copied' : ''}`}
            onClick={handleCopyCode}
            title="Click to copy room code"
            aria-label={`Copy room code ${roomId}`}
          >
            <span className="room-chip-dot" />
            <span className="room-chip-label">Room</span>
            <strong className="room-chip-code">{roomId}</strong>
            {copiedCode ? <Check size={13} className="text-emerald animate-check-bounce" /> : <Copy size={13} />}
          </button>
        )}
      </div>

      {/* Center: Live Sync Quality Badge */}
      <div className="header-sync-center">
        {showDiagnostics && (
          <SyncQualityBadge
            syncState={syncState}
            currentTime={currentTime}
            isConnected={connectionStatus === 'connected'}
            onResync={onResync}
          />
        )}
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


        {/* Quick Tools Cluster with 3-Mode Switcher */}
        <div className="header-tools-group">
          {/* Mode Switcher: Party Mode (Default), Cinema Theater Mode, Study Mode */}
          <div className="header-mode-dropdown-wrap" ref={modeMenuRef}>
            <button
              type="button"
              className={`header-mode-pill-btn ${roomMode === 'study' ? 'mode-study-active' : roomMode === 'cinema' ? 'mode-cinema-active' : 'mode-party-active'}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsModeMenuOpen((prev) => !prev);
              }}
              title={`Mode: ${roomMode === 'study' ? 'Study & Focus' : roomMode === 'cinema' ? 'Cinema Theater' : 'Party Mode (Default)'}. Click to switch.`}
              aria-label="Toggle Watch Party Mode Menu"
            >
              {roomMode === 'study' ? (
                <>
                  <BookOpen size={14} color="#34d399" />
                  <span className="mode-pill-label">Study</span>
                </>
              ) : roomMode === 'cinema' ? (
                <>
                  <Clapperboard size={14} color="#ffd21f" />
                  <span className="mode-pill-label">Cinema</span>
                </>
              ) : (
                <>
                  <PartyPopper size={14} color="#f59e0b" />
                  <span className="mode-pill-label">Party</span>
                </>
              )}
              <ChevronDown size={12} className={`mode-pill-arrow ${isModeMenuOpen ? 'arrow-open' : ''}`} />
            </button>

            {isModeMenuOpen && (
              <div
                className="header-mode-menu-dropdown animate-scale-in"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mode-menu-header">
                  <span>Room Mode</span>
                </div>

                <button
                  type="button"
                  className={`mode-menu-option ${roomMode === 'party' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRoomMode?.('party');
                    setIsModeMenuOpen(false);
                    onNotify('🍿 Switched to Party Mode (Full Social Watch Party)', 'info');
                  }}
                >
                  <PartyPopper size={16} className="text-amber-400" />
                  <div className="mode-option-text">
                    <strong>Party Mode (Default)</strong>
                    <span>Live chat, queue, video call, and reactions</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`mode-menu-option ${roomMode === 'cinema' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRoomMode?.('cinema');
                    setIsModeMenuOpen(false);
                    onNotify('🎬 Switched to Cinema Mode (Dim Lights & Theater Stage)', 'info');
                  }}
                >
                  <Clapperboard size={16} className="text-yellow-400" />
                  <div className="mode-option-text">
                    <strong>Cinema Theater Mode</strong>
                    <span>Dim background lights & maximized player</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`mode-menu-option ${roomMode === 'study' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRoomMode?.('study');
                    setIsModeMenuOpen(false);
                    onNotify('📚 Switched to Study Mode: Distractions hidden, focus tools enabled!', 'success');
                  }}
                >
                  <BookOpen size={16} className="text-emerald-400" />
                  <div className="mode-option-text">
                    <strong>Study & Focus Mode</strong>
                    <span>Focus clock, timestamped notes, tasks & PDF</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {onOpenDiagnostics && showDiagnostics && (
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
            title="Unified Settings: Room, Profile, Soundboard & Feature Switches"
            aria-label="Settings"
            id="room-settings-header-btn"
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
