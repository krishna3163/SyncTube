import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Lock,
  SkipForward,
  Maximize,
  Minimize,
  Sparkles,
  Volume2,
  VolumeX,
  RefreshCw,
  Bell,
  Crown,
  Shield,
  User,
  Settings2,
  Subtitles,
  Check,
  Gauge,
} from 'lucide-react';
import { Role, PlayState } from '../types.js';
import { formatTime } from '../utils/youtube.js';

export interface PlaybackControlsProps {
  playState: PlayState;
  currentTime: number;
  duration: number;
  userRole: Role;
  visible?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onNextVideo?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  ambientMode?: boolean;
  onToggleAmbient?: () => void;
  onToggleMute?: () => void;
  onResync?: () => void;
  isMuted?: boolean;
  onSetQuality?: (quality: string) => void;
  onToggleCaptions?: () => void;
  currentQuality?: string;
  isCaptionsOn?: boolean;
  playbackSpeed?: number;
  onSetPlaybackSpeed?: (speed: number) => void;
  onRequestAction?: (
    type: 'play' | 'pause' | 'seek' | 'change_video',
    data?: { time?: number; videoId?: string }
  ) => void;
  onOpenRequestsTab?: () => void;
  isDockMode?: boolean;
}

const PLAYBACK_SPEEDS = [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1x', value: 1 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
];

const QUALITIES = [
  { label: 'Auto', value: 'auto' },
  { label: '1080p HD', value: 'hd1080' },
  { label: '720p HD', value: 'hd720' },
  { label: '480p', value: 'large' },
  { label: '360p', value: 'medium' },
  { label: '240p', value: 'small' },
];

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  playState,
  currentTime,
  duration,
  userRole,
  visible = true,
  onPlay,
  onPause,
  onSeek,
  onNextVideo,
  onToggleFullscreen,
  isFullscreen = false,
  ambientMode = true,
  onToggleAmbient,
  onToggleMute,
  onResync,
  isMuted = false,
  onSetQuality,
  onToggleCaptions,
  currentQuality = 'auto',
  isCaptionsOn = false,
  playbackSpeed = 1,
  onSetPlaybackSpeed,
  onRequestAction,
  onOpenRequestsTab,
  isDockMode = false,
}) => {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    if (canControl) {
      onSeek(target);
    } else if (onRequestAction) {
      onRequestAction('seek', { time: target });
    }
  };

  const handleJump = (delta: number) => {
    const nextTime = Math.max(0, Math.min(duration || 9999, currentTime + delta));
    if (canControl) {
      onSeek(nextTime);
    } else if (onRequestAction) {
      onRequestAction('seek', { time: nextTime });
    }
  };

  const handlePlayPause = () => {
    if (canControl) {
      if (playState === 'playing') onPause();
      else onPlay();
    } else if (onRequestAction) {
      if (playState === 'playing') onRequestAction('pause');
      else onRequestAction('play');
    }
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const renderRoleBadge = () => {
    if (userRole === 'HOST') {
      return (
        <span className="controls-role-badge host host-badge role-badge">
          <Crown size={12} /> Host
        </span>
      );
    }
    if (userRole === 'MODERATOR') {
      return (
        <span className="controls-role-badge mod">
          <Shield size={12} /> Moderator
        </span>
      );
    }
    return (
      <span className="controls-role-badge viewer">
        <User size={12} /> Viewer
      </span>
    );
  };

  const containerClass = isDockMode
    ? 'controls-dock-panel'
    : `controls-overlay ${visible ? 'controls-visible' : 'controls-hidden'}`;

  return (
    <div className={containerClass}>
      {/* Timeline Slider with glowing progress */}
      <div className="timeline-container">
        <span className="time-text current">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 100}
          step={0.5}
          value={currentTime}
          onChange={handleSliderChange}
          className="timeline-slider"
          aria-label="Video timeline seek"
          aria-valuemin={0}
          aria-valuemax={duration > 0 ? duration : 100}
          aria-valuenow={currentTime}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          style={{ '--progress': `${progressPercent}%` } as React.CSSProperties}
          title={canControl ? 'Seek to position' : 'Click to request seek position'}
        />
        <span className="time-text total">{formatTime(duration)}</span>
      </div>

      {/* Button controls row */}
      <div className="buttons-row">
        {/* Playback Buttons Group */}
        <div className="playback-buttons">
          <button
            type="button"
            className="btn btn-primary control-btn-play"
            onClick={handlePlayPause}
            title={
              canControl
                ? playState === 'playing'
                  ? 'Pause Video'
                  : 'Play Video'
                : playState === 'playing'
                ? 'Request Host to Pause'
                : 'Request Host to Play'
            }
            aria-label={playState === 'playing' ? 'Pause' : 'Play'}
          >
            {playState === 'playing' ? <Pause size={18} /> : <Play size={18} />}
            <span>
              {canControl
                ? playState === 'playing'
                  ? 'Pause'
                  : 'Play'
                : playState === 'playing'
                ? 'Request Pause'
                : 'Request Play'}
            </span>
          </button>

          <button
            type="button"
            className="btn btn-secondary control-btn-jump"
            onClick={() => handleJump(-10)}
            title={canControl ? 'Jump back 10 seconds' : 'Request seek -10s'}
            aria-label="Back 10 seconds"
          >
            <RotateCcw size={15} />
            <span>-10s</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary control-btn-jump"
            onClick={() => handleJump(10)}
            title={canControl ? 'Jump forward 10 seconds' : 'Request seek +10s'}
            aria-label="Forward 10 seconds"
          >
            <RotateCw size={15} />
            <span>+10s</span>
          </button>

          {onNextVideo && canControl && (
            <button
              type="button"
              className="btn btn-secondary control-btn-next"
              onClick={onNextVideo}
              title="Skip to next video in playlist"
              aria-label="Next Video"
            >
              <SkipForward size={16} />
              <span>Next</span>
            </button>
          )}

          {/* Viewer Quick Request Button */}
          {!canControl && onOpenRequestsTab && (
            <button
              type="button"
              className="btn btn-request-quick"
              onClick={onOpenRequestsTab}
              title="Request a video change or seek from Host"
            >
              <Bell size={14} />
              <span>Request</span>
            </button>
          )}
        </div>

        {/* Right Group: Mute, Sync, Role Notice, Settings, Fullscreen */}
        <div className="controls-right-group">
          {renderRoleBadge()}

          {onToggleMute && (
            <button
              type="button"
              className="btn-icon control-btn-icon"
              onClick={onToggleMute}
              title={isMuted ? 'Unmute Video' : 'Mute Video'}
              style={{ color: isMuted ? 'var(--red)' : 'var(--text-main)' }}
              aria-label="Toggle Mute"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}

          {onResync && (
            <button
              type="button"
              className="btn-icon control-btn-icon"
              onClick={onResync}
              title="Force sync with Host"
              aria-label="Resync Video"
            >
              <RefreshCw size={17} />
            </button>
          )}

          {/* Quick Playback Speed Cycle Button */}
          {onSetPlaybackSpeed && (
            <button
              type="button"
              className="btn-icon control-btn-icon speed-pill-btn"
              onClick={() => {
                const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
                const idx = speeds.indexOf(playbackSpeed);
                const nextSpeed = speeds[(idx + 1) % speeds.length];
                onSetPlaybackSpeed(nextSpeed);
              }}
              title={`Playback Speed: ${playbackSpeed}x (Click to cycle)`}
              aria-label="Change Playback Speed"
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                fontFamily: 'var(--mono)',
                color: playbackSpeed !== 1 ? 'var(--accent)' : 'var(--text-muted)',
                padding: '0.2rem 0.45rem',
                borderRadius: 'var(--r-sm)',
                border: playbackSpeed !== 1 ? '1px solid var(--accent-dim)' : '1px solid rgba(255,255,255,0.08)',
                background: playbackSpeed !== 1 ? 'rgba(255, 210, 31, 0.14)' : 'rgba(255,255,255,0.03)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.2rem',
              }}
            >
              <Gauge size={13} />
              <span>{playbackSpeed}x</span>
            </button>
          )}

          {/* Local Video Settings (Quality, Speed & Captions) */}
          {(onSetQuality || onToggleCaptions || onSetPlaybackSpeed) && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className={`btn-icon control-btn-icon ${showSettingsMenu ? 'active' : ''}`}
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                title="Local Video Settings (Quality & Captions)"
                aria-label="Video Settings"
              >
                <Settings2 size={18} />
              </button>

              {showSettingsMenu && (
                <div
                  className="card glass"
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 10px)',
                    right: 0,
                    width: '200px',
                    padding: '0.6rem',
                    zIndex: 100,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                    background: 'rgba(20, 16, 32, 0.96)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Local Video Settings
                  </div>

                  {onToggleCaptions && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        onToggleCaptions();
                        setShowSettingsMenu(false);
                      }}
                      style={{
                        width: '100%',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.8rem',
                        marginBottom: '0.5rem',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Subtitles size={15} /> Captions / CC
                      </span>
                      <span style={{ fontSize: '0.75rem', color: isCaptionsOn ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700 }}>
                        {isCaptionsOn ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  )}

                  {onSetQuality && (
                    <>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                        Local Quality
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {QUALITIES.map((q) => (
                          <button
                            key={q.value}
                            type="button"
                            onClick={() => {
                              onSetQuality(q.value);
                              setShowSettingsMenu(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.35rem 0.6rem',
                              borderRadius: '6px',
                              border: 'none',
                              background: currentQuality === q.value ? 'rgba(255, 210, 31, 0.15)' : 'transparent',
                              color: currentQuality === q.value ? 'var(--accent)' : 'var(--text-main)',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              fontWeight: currentQuality === q.value ? 700 : 500,
                            }}
                          >
                            <span>{q.label}</span>
                            {currentQuality === q.value && <Check size={14} color="var(--accent)" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {onSetPlaybackSpeed && (
                    <div style={{ marginTop: '0.55rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.45rem' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Gauge size={13} /> Playback Speed
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem' }}>
                        {PLAYBACK_SPEEDS.map((s) => (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => {
                              onSetPlaybackSpeed(s.value);
                              setShowSettingsMenu(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '0.32rem 0.2rem',
                              borderRadius: '6px',
                              border: '1px solid',
                              borderColor: playbackSpeed === s.value ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                              background: playbackSpeed === s.value ? 'rgba(255, 210, 31, 0.16)' : 'rgba(255,255,255,0.03)',
                              color: playbackSpeed === s.value ? 'var(--accent)' : 'var(--text-main)',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              fontWeight: playbackSpeed === s.value ? 700 : 500,
                            }}
                          >
                            <span>{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {onToggleFullscreen && (
            <button
              type="button"
              className="btn-icon fullscreen-btn"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
