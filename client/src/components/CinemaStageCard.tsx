import React from 'react';
import { ExternalLink, Chrome, ShieldCheck, Film, Sparkles, RefreshCw } from 'lucide-react';
import type { DetectedClientMedia } from '../utils/media.js';

interface CinemaStageCardProps {
  media: DetectedClientMedia;
  extensionInstalled: boolean;
  onOpenBrowserHub: () => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

export const CinemaStageCard: React.FC<CinemaStageCardProps> = ({
  media,
  extensionInstalled,
  onOpenBrowserHub,
  onNotify,
}) => {
  const handleOpenTab = () => {
    if (media.url) {
      window.open(media.url, '_blank', 'noopener,noreferrer');
      onNotify(`Opened ${media.badge.label} in a new tab! Make sure you are logged in.`, 'success');
    }
  };

  return (
    <div className="cinema-stage-card">
      <div className="cinema-stage-glow" />
      <div className="cinema-stage-content">
        <div className="cinema-platform-badge">
          <span className="cinema-platform-icon">{media.badge.icon}</span>
          <span className="cinema-platform-name">{media.badge.label}</span>
        </div>

        <h2 className="cinema-stage-title">{media.title}</h2>
        <p className="cinema-stage-desc">
          Universal Browser Watch Party: Open the streaming website in your browser tab, log in with your own account, and watch in sync!
        </p>

        <div className="cinema-stage-actions">
          <button
            type="button"
            className="btn btn-primary cinema-open-tab-btn"
            onClick={handleOpenTab}
          >
            <ExternalLink size={18} />
            <span>Open {media.badge.label.split(' ')[0]} in Browser Tab</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary cinema-change-btn"
            onClick={onOpenBrowserHub}
          >
            <Film size={15} />
            <span>Change Movie / Platform</span>
          </button>
        </div>

        {/* Extension sync status & guidance */}
        <div className="cinema-extension-status-box">
          <div className="cinema-status-row">
            <Chrome size={16} className={extensionInstalled ? 'text-green' : 'text-purple'} />
            <span className="cinema-status-text">
              {extensionInstalled ? (
                <><strong>Extension Active:</strong> Playback controls and time sync will coordinate automatically.</>
              ) : (
                <><strong>Browser Extension Recommended:</strong> Install the SyncTube extension to sync play/pause/seek across your tabs.</>
              )}
            </span>
          </div>

          <div className="cinema-privacy-note">
            <ShieldCheck size={14} className="text-cyan" />
            <span>
              <strong>100% Private:</strong> Your account credentials and video streams stay inside your browser tab. SyncTube only exchanges playback timeline metadata.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
