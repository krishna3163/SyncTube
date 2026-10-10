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
  Volume1,
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
  Smile,
  PictureInPicture,
  Tv,
  Zap,
  Radio,
  Sparkles,
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
  isTheaterMode?: boolean;
  onToggleTheater?: () => void;
  ambientMode?: boolean;
  onToggleAmbient?: () => void;
  onToggleMute?: () => void;
  onResync?: () => void;
  isMuted?: boolean;
  volume?: number;
  onSetVolume?: (volume: number) => void;
  onTogglePiP?: () => void;
  onGoLive?: () => void;
  isLive?: boolean;
  latencyMode?: 'ultra_low' | 'low' | 'normal';
  onSetLatencyMode?: (mode: 'ultra_low' | 'low' | 'normal') => void;
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
  roomUptimeSeconds?: number;
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
  isTheaterMode = false,
  onToggleTheater,
  ambientMode = true,
  onToggleAmbient,
  onToggleMute,
  onResync,
  isMuted = false,
  volume = 100,
  onSetVolume,
  onTogglePiP,
  onGoLive,
  isLive = false,
  latencyMode = 'low',
  onSetLatencyMode,
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
  roomUptimeSeconds,
}) => {
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showQualityOptions, setShowQualityOptions] = useState(false);
  const [showLatencyOptions, setShowLatencyOptions] = useState(false);
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);
  const isHost = userRole === 'HOST' || userRole === 'MODERATOR';
  const canControl = isHost;
  const effectiveIsLive = Boolean(isLive || (playState === 'playing'));

  const handleLiveEdgeClick = () => {
    if (effectiveIsLive) {
      // Already live: click does nothing
      return;
    }
    if (isHost && onGoLive) {
      onGoLive();
    }
  };

  useEffect(() => {
    if (!showSettingsMenu && !showReactionMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (showSettingsMenu && !settingsRef.current?.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
      if (showReactionMenu && !reactionRef.current?.contains(event.target as Node)) {
        setShowReactionMenu(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSettingsMenu(false);
        setShowReactionMenu(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showSettingsMenu, showReactionMenu]);

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
        <span className="controls-role-badge host">
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

  const hasVideo = duration > 0;

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
          disabled={!hasVideo}
          onChange={handleSliderChange}
          className="timeline-slider"
          aria-label="Video timeline seek"
          aria-valuemin={0}
          aria-valuemax={duration > 0 ? duration : 100}
          aria-valuenow={currentTime}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          style={{ '--progress': `${progressPercent}%` } as React.CSSProperties}
          title={!hasVideo ? 'No video selected' : canControl ? 'Seek to position' : 'Click to request seek position'}
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
            disabled={!hasVideo}
            title={
              !hasVideo
                ? 'No video selected'
                : canControl
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
            disabled={!hasVideo}
            title={!hasVideo ? 'No video selected' : canControl ? 'Jump back 10 seconds' : 'Request seek -10s'}
            aria-label="Back 10 seconds"
          >
            <RotateCcw size={15} />
            <span>-10s</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary control-btn-jump"
            onClick={() => handleJump(10)}
            disabled={!hasVideo}
            title={!hasVideo ? 'No video selected' : canControl ? 'Jump forward 10 seconds' : 'Request seek +10s'}
            aria-label="Forward 10 seconds"
          >
            <RotateCw size={15} />
            <span>+10s</span>
          </button>

          {/* Live Broadcast / GO LIVE Badge Button */}
          {effectiveIsLive ? (
            <div
              className="live-edge-badge-btn is-live"
              title={`Broadcasting Live • Active for ${formatTime(roomUptimeSeconds || 0)}`}
              aria-label="Live broadcast"
            >
              <span className="live-badge-dot live-dot-pulse" />
              <span className="live-badge-title">
                LIVE{typeof roomUptimeSeconds === 'number' && roomUptimeSeconds > 0
                  ? ` • ${formatTime(roomUptimeSeconds)}`
                  : ''}
              </span>
            </div>
          ) : isHost ? (
            <button
              type="button"
              className="live-edge-badge-btn is-go-live"
              onClick={handleLiveEdgeClick}
              title="Start the live watch party broadcast for all viewers"
              aria-label="Go Live"
            >
              <span className="live-badge-dot live-dot-dvr" />
              <span className="live-badge-title">GO LIVE</span>
            </button>
          ) : (
            <div
              className="live-edge-badge-btn is-waiting"
              title="Waiting for the host to go live"
              aria-label="Stream starting soon"
            >
              <span className="live-badge-dot live-dot-dvr" />
              <span className="live-badge-title">STARTING SOON</span>
            </div>
          )}

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

        {/* Right Group: Volume Cluster, Sync, Role, Settings, PiP, Theater, Fullscreen */}
        <div className="controls-right-group">
          {renderRoleBadge()}

          {/* Interactive Volume Cluster with expandable slider */}
          <div
            className="volume-cluster"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            {onToggleMute && (
              <button
                type="button"
                className="btn-icon control-btn-icon"
                onClick={onToggleMute}
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                style={{ color: isMuted ? 'var(--red)' : 'var(--text-main)' }}
                aria-label="Toggle Mute"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={18} />
                ) : volume < 50 ? (
                  <Volume1 size={18} />
                ) : (
                  <Volume2 size={18} />
                )}
              </button>
            )}

            {onSetVolume && (
              <div className={`volume-slider-box ${showVolumeSlider ? 'slider-open' : ''}`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onSetVolume(Number(e.target.value))}
                  className="volume-range-slider"
                  aria-label="Volume slider"
                  title={`Volume: ${isMuted ? 0 : volume}%`}
                />
              </div>
            )}
          </div>

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

          {/* Dedicated Live Reactions Trigger Button */}
          {reactionControl && (
            <div ref={reactionRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className={`btn-icon control-btn-icon reaction-bar-btn ${showReactionMenu ? 'active' : ''}`}
                onClick={() => {
                  setShowReactionMenu(!showReactionMenu);
                  setShowSettingsMenu(false);
                }}
                title="Send Live Reaction"
                aria-label="Send Live Reaction"
              >
                <Smile size={18} />
              </button>

              {showReactionMenu && (
                <div className="local-reactions-popover card glass">
                  <div className="local-reactions-popover-header">
                    <span>Live Reactions</span>
                    <button
                      type="button"
                      className="popover-close-btn"
                      onClick={() => setShowReactionMenu(false)}
                      aria-label="Close reactions"
                    >
                      ×
                    </button>
                  </div>
                  <div className="controls-reaction-slot">{reactionControl}</div>
                </div>
              )}
            </div>
          )}

          {/* Local Video Settings Popover */}
          {(onSetQuality || onToggleCaptions || onSetPlaybackSpeed || onSetLatencyMode || onToggleAmbient) && (
            <div ref={settingsRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className={`btn-icon control-btn-icon ${showSettingsMenu ? 'active' : ''}`}
                onClick={() => {
                  setShowSettingsMenu(!showSettingsMenu);
                  setShowReactionMenu(false);
                }}
                title="Video & Latency Settings"
                aria-label="Video Settings"
              >
                <Settings2 size={18} />
              </button>

              {showSettingsMenu && (
                <div className="local-video-settings card glass">
                  <div className="settings-panel-title">
                    <Radio size={13} color="var(--accent)" />
                    <span>Player & Stream Settings</span>
                  </div>

                  {/* Latency Mode Selector */}
                  {onSetLatencyMode && (
                    <div className="local-latency-section">
                      <button
                        type="button"
                        className="local-latency-toggle"
                        onClick={() => setShowLatencyOptions((shown) => !shown)}
                        aria-expanded={showLatencyOptions}
                      >
                        <span className="setting-label">
                          <Zap size={14} color="#f59e0b" /> Latency Mode
                        </span>
                        <span className="setting-val-tag">
                          {latencyMode === 'ultra_low'
                            ? 'Ultra-Low (<1s)'
                            : latencyMode === 'normal'
                            ? 'Normal'
                            : 'Low (Balanced)'}
                        </span>
                        <ChevronDown size={14} className={showLatencyOptions ? 'is-expanded' : ''} />
                      </button>
                      {showLatencyOptions && (
                        <div className="local-latency-options">
                          {[
                            { id: 'ultra_low', title: 'Ultra-Low Latency', desc: 'Sub-second real-time chat & reactions' },
                            { id: 'low', title: 'Low Latency (Balanced)', desc: 'Optimal ~2s sync with buffer stability' },
                            { id: 'normal', title: 'Normal Latency', desc: 'Buffered stream for slow connections' },
                          ].map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className={`latency-option-item ${latencyMode === item.id ? 'is-selected' : ''}`}
                              onClick={() => {
                                onSetLatencyMode(item.id as any);
                                setShowLatencyOptions(false);
                              }}
                            >
                              <div className="latency-opt-meta">
                                <strong>{item.title}</strong>
                                <small>{item.desc}</small>
                              </div>
                              {latencyMode === item.id && <Check size={14} color="var(--accent)" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Captions Toggle */}
                  {onToggleCaptions && (
                    <button
                      type="button"
                      className="btn btn-secondary setting-row-btn"
                      onClick={() => {
                        onToggleCaptions();
                        setShowSettingsMenu(false);
                      }}
                    >
                      <span className="setting-label">
                        <Subtitles size={15} /> Captions / Subtitles
                      </span>
                      <span className="setting-toggle-status" style={{ color: isCaptionsOn ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {isCaptionsOn ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  )}

                  {/* Ambient Mode Toggle */}
                  {onToggleAmbient && (
                    <button
                      type="button"
                      className="btn btn-secondary setting-row-btn"
                      onClick={() => {
                        onToggleAmbient();
                        setShowSettingsMenu(false);
                      }}
                    >
                      <span className="setting-label">
                        <Sparkles size={15} color="#ec4899" /> Ambient Lighting
                      </span>
                      <span className="setting-toggle-status" style={{ color: ambientMode ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {ambientMode ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  )}

                  {/* Quality Selector */}
                  {onSetQuality && (
                    <div className="local-quality-section">
                      <button
                        type="button"
                        className="local-quality-toggle"
                        onClick={() => setShowQualityOptions((shown) => !shown)}
                        aria-expanded={showQualityOptions}
                      >
                        <span className="setting-label">Video Quality</span>
                        <span className="local-quality-current">
                          {QUALITIES.find((quality) => quality.value === currentQuality)?.label || 'Auto'}
                        </span>
                        <ChevronDown size={14} className={showQualityOptions ? 'is-expanded' : ''} />
                      </button>
                      {showQualityOptions && (
                        <div className="local-quality-options">
                          {QUALITIES.map((q) => (
                            <button
                              key={q.value}
                              type="button"
                              className={`quality-opt-btn ${currentQuality === q.value ? 'is-selected' : ''}`}
                              onClick={() => {
                                onSetQuality(q.value);
                                setShowSettingsMenu(false);
                              }}
                            >
                              <span>{q.label}</span>
                              {currentQuality === q.value && <Check size={14} color="var(--accent)" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Playback Speed Slider */}
                  {onSetPlaybackSpeed && (
                    <div className="playback-speed-block">
                      <div className="speed-block-header">
                        <Gauge size={13} />
                        <span>Playback Speed</span>
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

          {/* Picture-in-Picture Button */}
          {onTogglePiP && (
            <button
              type="button"
              className="btn-icon control-btn-icon pip-btn"
              onClick={onTogglePiP}
              title="Picture-in-Picture (PiP)"
              aria-label="Toggle Picture in Picture"
            >
              <PictureInPicture size={18} />
            </button>
          )}

          {/* Theater Mode Button */}
          {onToggleTheater && (
            <button
              type="button"
              className={`btn-icon control-btn-icon theater-btn ${isTheaterMode ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleTheater();
              }}
              title={isTheaterMode ? 'Exit Theater Mode (T)' : 'Theater Mode (T)'}
              aria-label="Toggle Theater Mode"
            >
              <Tv size={18} />
            </button>
          )}

          {/* Fullscreen Button */}
          {onToggleFullscreen && (
            <button
              type="button"
              className="btn-icon fullscreen-btn"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
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
