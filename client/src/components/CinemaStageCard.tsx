import React from 'react';
import {
  ExternalLink,
  Film,
  Share2,
  Tv,
} from 'lucide-react';
import type { DetectedClientMedia } from '../utils/media.js';
import type { Role } from '../types.js';
import { emitStartTabStream } from '../services/socket.js';

interface CinemaStageCardProps {
  media: DetectedClientMedia;
  roomId?: string;
  userRole?: Role;
  onOpenBrowserHub: () => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

export const CinemaStageCard: React.FC<CinemaStageCardProps> = ({
  media,
  userRole = 'PARTICIPANT',
  onOpenBrowserHub,
  onNotify,
}) => {
  const isHost = userRole === 'HOST' || userRole === 'MODERATOR';

  const handleStartTabShare = () => {
    if (!isHost) {
      onNotify('Only the Host can start Tab Sharing in this room.', 'info');
      return;
    }
    emitStartTabStream(media.title, (res) => {
      if (res.success) {
        onNotify('Switched room stage to Browser Tab Stream!', 'success');
      }
    });
  };

  const handleOpenPersonalTab = () => {
    if (media.url) {
      window.open(media.url, '_blank', 'noopener,noreferrer');
      onNotify(`Opened ${media.badge.label} in a new tab! Log in to watch.`, 'success');
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
          Universal Watch Party: Stream synchronized movies, series, or video with your friends with live chat, floating emoji reactions, and millisecond sync.
        </p>

        {/* Streaming Choices */}
        <div className="cinema-stream-choices-grid">
          {/* Choice 1: MovieBox Catalog */}
          <div className="cinema-stream-choice-card choice-card-cloud" onClick={onOpenBrowserHub} style={{ cursor: 'pointer' }}>
            <div className="choice-card-header">
              <div className="choice-icon-wrap icon-cyan">
                <Film size={22} />
              </div>
              <div className="choice-badge">RECOMMENDED • FREE HD</div>
            </div>
            <h3 className="choice-title">MovieBox Cinema Stream</h3>
            <p className="choice-desc">
              Search thousands of movies, TV series, and anime with full synchronized playback, multiple quality streams, and multi-language subtitles.
            </p>
            <div className="choice-features">
              <span>🎬 Full Movies &amp; Series</span>
              <span>⚡ Ultra-low drift sync</span>
              <span>📝 Multi-language subtitles</span>
            </div>
            <button
              type="button"
              className="btn btn-primary choice-action-btn"
              onClick={onOpenBrowserHub}
            >
              <Film size={16} />
              <span>Search MovieBox Catalog</span>
            </button>
          </div>

          {/* Choice 2: Local Tab Share with Audio */}
          <div className="cinema-stream-choice-card choice-card-local">
            <div className="choice-card-header">
              <div className="choice-icon-wrap icon-purple">
                <Tv size={22} />
              </div>
              <div className="choice-badge">BROWSER TAB &amp; AUDIO</div>
            </div>
            <h3 className="choice-title">Share Browser Tab (With Audio)</h3>
            <p className="choice-desc">
              Share your personal Netflix, Prime, Disney+, or Crunchyroll browser tab directly with crystal-clear audio so friends can watch together.
            </p>
            <div className="choice-features">
              <span>🔊 HD Tab Audio Included</span>
              <span>⚡ Zero Cloud Latency</span>
              <span>👥 Group Watch Mode</span>
            </div>
            {isHost && (
              <button
                type="button"
                className="btn btn-secondary choice-action-btn"
                onClick={handleStartTabShare}
              >
                <Share2 size={16} />
                <span>Share Local Browser Tab</span>
              </button>
            )}
          </div>
        </div>

        {/* Secondary Actions */}
        <div className="cinema-stage-secondary-actions">
          <button
            type="button"
            className="btn btn-subtle cinema-open-tab-btn"
            onClick={handleOpenPersonalTab}
          >
            <ExternalLink size={15} />
            <span>Open {media.badge.label.split(' ')[0]} in Tab</span>
          </button>

          <button
            type="button"
            className="btn btn-subtle cinema-change-btn"
            onClick={onOpenBrowserHub}
          >
            <Film size={15} />
            <span>Change Movie / Search Catalog</span>
          </button>
        </div>
      </div>
    </div>
  );
};
