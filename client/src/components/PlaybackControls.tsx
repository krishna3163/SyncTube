import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipForward,
  Maximize,
  Minimize,
  Volume2,
  VolumeX,
  RefreshCw,
  Bell,
  Crown,
  Shield,
  User,
  Settings2,
  ChevronDown,
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
  reactionControl?: React.ReactNode;
}

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
  reactionControl,
}) => {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showQualityOptions, setShowQualityOptions] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

  useEffect(() => {
    if (!showSettingsMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSettingsMenu(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showSettingsMenu]);

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
      {playbackSpeed !== 1 && (
        <div className="current-speed-indicator" aria-live="polite">
          Speed {playbackSpeed.toFixed(2).replace(/\.00$/, '')}x
        </div>
      )}

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

          {/* Local Video Settings (Quality, Speed & Captions) */}
          {(onSetQuality || onToggleCaptions || onSetPlaybackSpeed) && (
            <div ref={settingsRef} style={{ position: 'relative' }}>
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
                <div className="local-video-settings card glass">
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Local Video Settings
                  </div>

                  {reactionControl && (
                    <div className="settings-reaction-control">
                      <div className="settings-reaction-label">Live Reactions</div>
                      <div className="controls-reaction-slot">{reactionControl}</div>
                    </div>
                  )}

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
                    <div className="local-quality-section">
                      <button
                        type="button"
                        className="local-quality-toggle"
                        onClick={() => setShowQualityOptions((shown) => !shown)}
                        aria-expanded={showQualityOptions}
                      >
                        <span>Local Quality</span>
                        <span className="local-quality-current">
                          {QUALITIES.find((quality) => quality.value === currentQuality)?.label || 'Auto'}
                        </span>
                        <ChevronDown size={14} className={showQualityOptions ? 'is-expanded' : ''} />
                      </button>
                      {showQualityOptions && <div className="local-quality-options">
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
                      </div>}
                    </div>
                  )}

                  {onSetPlaybackSpeed && (
                    <div style={{ marginTop: '0.55rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.45rem' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Gauge size={13} /> Playback Speed
                      </div>
                      <input
                        type="range"
                        min="0.25"
                        max="2"
                        step="0.05"
                        value={playbackSpeed}
                        onChange={(e) => onSetPlaybackSpeed(Number(e.target.value))}
                        className="playback-speed-slider"
                        aria-label="Playback speed"
                      />
                      <div className="playback-speed-scale">
                        <span>0.25x</span>
                        <strong>{playbackSpeed.toFixed(2).replace(/\.00$/, '')}x</strong>
                        <span>2x</span>
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
