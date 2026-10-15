import React, { useState } from 'react';
import {
  ExternalLink,
  Globe,
  Share2,
  Tv,
} from 'lucide-react';
import type { DetectedClientMedia } from '../utils/media.js';
import type { Role } from '../types.js';
import { emitStartTabStream, emitStartBrowserStream } from '../services/socket.js';
import { createBrowserSession } from '../services/tempBrowserApi.js';

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
  const [isLaunchingCloud, setIsLaunchingCloud] = useState(false);

  const handleLaunchTemporaryBrowser = async () => {
    try {
      setIsLaunchingCloud(true);
      const targetUrl = media.url || 'https://duckduckgo.com';
      const { session, token } = await createBrowserSession(targetUrl);
      emitStartBrowserStream(session.id, token, false, (res) => {
        if (res?.success) {
          onNotify('Cloud temporary browser streaming live to room stage!', 'success');
        } else {
          onNotify(res?.error || 'Failed to attach browser stream to room.', 'error');
        }
      });
    } catch (err: any) {
      onNotify(err?.message || 'Failed to start temporary browser session.', 'error');
    } finally {
      setIsLaunchingCloud(false);
    }
  };

  const handleStartTabShare = () => {
    if (!isHost) {
      onNotify('Only the Host can start Tab Sharing in this room.', 'info');
      return;
    }
    emitStartTabStream(media.title, (res) => {
      if (res?.success) {
        onNotify('Switched room stage to Browser Tab Stream!', 'success');
      } else if (res?.error) {
        onNotify(res.error, 'error');
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
          Universal Watch Party: Stream synchronized media with your friends with live chat, floating emoji reactions, and millisecond sync.
        </p>

        <div className="cinema-stream-choices-grid">
          <div className="cinema-stream-choice-card choice-card-cloud">
            <div className="choice-card-header">
              <div className="choice-icon-wrap icon-cyan">
                <Globe size={22} />
              </div>
              <div className="choice-badge">ISOLATED CLOUD SANDBOX</div>
            </div>
            <h3 className="choice-title">Stream via Temporary Browser</h3>
            <p className="choice-desc">
              Run an isolated Chromium browser in the cloud. Synchronize video directly to the room stage without installing anything or sharing your personal screen.
            </p>
            <div className="choice-features">
              <span>Zero Local CPU / Bandwidth</span>
              <span>Audio &amp; Video Synced to Room</span>
            </div>
            <button
              type="button"
              className="btn btn-primary choice-action-btn"
              onClick={handleLaunchTemporaryBrowser}
              disabled={isLaunchingCloud}
            >
              <Globe size={16} />
              <span>{isLaunchingCloud ? 'Launching Browser...' : 'Stream via Temporary Browser'}</span>
            </button>
          </div>

          <div className="cinema-stream-choice-card choice-card-local">
            <div className="choice-card-header">
              <div className="choice-icon-wrap icon-purple">
                <Tv size={22} />
              </div>
              <div className="choice-badge">BROWSER TAB &amp; AUDIO</div>
            </div>
            <h3 className="choice-title">Share Browser Tab (With Audio)</h3>
            <p className="choice-desc">
              Share your personal streaming browser tab directly with crystal-clear audio so friends can watch together.
            </p>
            <div className="choice-features">
              <span>HD Tab Audio Included</span>
              <span>Zero Drift Sync</span>
              <span>Group Watch Mode</span>
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
            <Globe size={15} />
            <span>Change Stream URL</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CinemaStageCard;
