import React from 'react';
import { Tv, RotateCcw, Home, Sparkles, CheckCircle2, Eye, Clock } from 'lucide-react';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';

export interface StreamEndedOverlayProps {
  streamTitle?: string;
  hostUsername: string;
  hostAvatarId?: string;
  durationSeconds?: number;
  peakViewers?: number;
  onReplay?: () => void;
  onReturnHome?: () => void;
}

export const StreamEndedOverlay: React.FC<StreamEndedOverlayProps> = ({
  streamTitle = 'Live Watch Party',
  hostUsername,
  hostAvatarId,
  durationSeconds = 3450,
  peakViewers = 18,
  onReplay,
  onReturnHome,
}) => {
  const formatDuration = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hours > 0) return `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
    return `${pad(mins)}m ${pad(secs)}s`;
  };

  return (
    <div className="stream-ended-overlay">
      <div className="stream-ended-card card glass">
        <div className="stream-ended-badge">
          <span className="ended-dot" />
          <span>BROADCAST ENDED</span>
        </div>

        <h2 className="stream-ended-title">{streamTitle}</h2>
        <p className="stream-ended-subtitle">This live watch party has concluded.</p>

        {/* Host Info */}
        <div className="stream-ended-host-box">
          <AnimeAvatarDisplay username={hostUsername} avatarId={hostAvatarId || 'avatar-1'} size={48} />
          <div className="ended-host-meta">
            <div className="ended-host-name">
              <span>{hostUsername}</span>
              <CheckCircle2 size={15} color="#38bdf8" />
            </div>
            <span className="ended-host-sub">Stream Host</span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="stream-ended-stats-grid">
          <div className="ended-stat-card">
            <Clock size={16} color="#f59e0b" />
            <div className="ended-stat-val">{formatDuration(durationSeconds)}</div>
            <div className="ended-stat-lbl">Stream Duration</div>
          </div>
          <div className="ended-stat-card">
            <Eye size={16} color="#10b981" />
            <div className="ended-stat-val">{peakViewers}</div>
            <div className="ended-stat-lbl">Peak Viewers</div>
          </div>
          <div className="ended-stat-card">
            <Sparkles size={16} color="#ec4899" />
            <div className="ended-stat-val">100%</div>
            <div className="ended-stat-lbl">Sync Accuracy</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="stream-ended-actions">
          {onReplay && (
            <button type="button" className="btn btn-secondary btn-sm ended-action-btn" onClick={onReplay}>
              <RotateCcw size={15} />
              <span>Watch Replay</span>
            </button>
          )}

          {onReturnHome && (
            <button type="button" className="btn btn-primary btn-sm ended-action-btn" onClick={onReturnHome}>
              <Home size={15} />
              <span>Back to Home</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
