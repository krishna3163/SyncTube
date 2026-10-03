import React from 'react';
import { Play, Pause, RotateCcw, RotateCw, Lock } from 'lucide-react';
import { Role, PlayState } from '../types.js';
import { formatTime } from '../utils/youtube.js';

interface PlaybackControlsProps {
  playState: PlayState;
  currentTime: number;
  duration: number;
  userRole: Role;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  playState,
  currentTime,
  duration,
  userRole,
  onPlay,
  onPause,
  onSeek,
}) => {
  const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canControl) return;
    const target = parseFloat(e.target.value);
    onSeek(target);
  };

  const handleJump = (delta: number) => {
    if (!canControl) return;
    const nextTime = Math.max(0, Math.min(duration || 9999, currentTime + delta));
    onSeek(nextTime);
  };

  return (
    <div className="controls-bar">
      <div className="timeline-container">
        <span className="time-text">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 100}
          step={0.5}
          value={currentTime}
          disabled={!canControl}
          onChange={handleSliderChange}
          className="timeline-slider"
          aria-label="Video timeline seek"
        />
        <span className="time-text">{formatTime(duration)}</span>
      </div>

      <div className="buttons-row">
        <div className="playback-buttons">
          {playState === 'playing' ? (
            <button
              className="btn btn-primary"
              disabled={!canControl}
              onClick={onPause}
              title={canControl ? 'Pause Video' : 'Only Host/Moderator can pause'}
            >
              <Pause size={18} />
              Pause
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={!canControl}
              onClick={onPlay}
              title={canControl ? 'Play Video' : 'Only Host/Moderator can play'}
            >
              <Play size={18} />
              Play
            </button>
          )}

          <button
            className="btn btn-secondary"
            disabled={!canControl}
            onClick={() => handleJump(-10)}
            title="Jump back 10 seconds"
          >
            <RotateCcw size={16} />
            -10s
          </button>

          <button
            className="btn btn-secondary"
            disabled={!canControl}
            onClick={() => handleJump(10)}
            title="Jump forward 10 seconds"
          >
            <RotateCw size={16} />
            +10s
          </button>
        </div>

        {!canControl && (
          <div className="role-notice">
            <Lock size={15} />
            <span>Playback controlled by Host & Moderators</span>
          </div>
        )}
      </div>
    </div>
  );
};
