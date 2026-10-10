import React, { useState } from 'react';
import {
  ExternalLink,
  Chrome,
  ShieldCheck,
  Film,
  Sparkles,
  Share2,
  Tv,
  Loader2,
  Globe,
  Radio,
} from 'lucide-react';
import type { DetectedClientMedia } from '../utils/media.js';
import type { Role } from '../types.js';
import { createBrowserSession } from '../services/tempBrowserApi.js';
import { emitStartBrowserStream, emitStartTabStream } from '../services/socket.js';

interface CinemaStageCardProps {
  media: DetectedClientMedia;
  roomId?: string;
  userRole?: Role;
  extensionInstalled: boolean;
  onOpenBrowserHub: () => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

export const CinemaStageCard: React.FC<CinemaStageCardProps> = ({
  media,
  roomId,
  userRole = 'PARTICIPANT',
  extensionInstalled,
  onOpenBrowserHub,
  onNotify,
}) => {
  const [isLaunchingBrowser, setIsLaunchingBrowser] = useState(false);
  const isHost = userRole === 'HOST' || userRole === 'MODERATOR';

  const handleLaunchCloudBrowser = async () => {
    if (!isHost) {
      onNotify('Only the Host can launch and cast a Temporary Browser to this room.', 'info');
      return;
    }
    setIsLaunchingBrowser(true);
    try {
      onNotify('Spawning isolated Temporary Browser container...', 'info');
      const targetUrl = media.url || 'https://duckduckgo.com';
      const { session, token } = await createBrowserSession(targetUrl);

      // Start streaming into room
      emitStartBrowserStream(session.id, token, false, (res) => {
        setIsLaunchingBrowser(false);
        if (res.success) {
          onNotify(`Temporary Browser is now live streaming to Room ${roomId}!`, 'success');
        } else {
          onNotify(`Stream error: ${res.error || 'Unknown error'}`, 'error');
        }
      });
    } catch (err: any) {
      setIsLaunchingBrowser(false);
      onNotify(`Failed to launch temporary browser: ${err.message}`, 'error');
    }
  };

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
          Universal Watch Party: Watch movies, anime, and series together with your friends in real-time. Choose your preferred way to stream below:
        </p>

        {/* 2 Streaming Paths Cards */}
        <div className="cinema-stream-choices-grid">
          {/* Choice 1: Cloud Temporary Browser */}
          <div className="cinema-stream-choice-card choice-card-cloud">
            <div className="choice-card-header">
              <div className="choice-icon-wrap icon-cyan">
                <Globe size={22} />
              </div>
              <div className="choice-badge">RECOMMENDED • ZERO INSTALL</div>
            </div>
            <h3 className="choice-title">Cloud Temporary Browser</h3>
            <p className="choice-desc">
              Launches an isolated Chromium browser in the cloud. Log in to your movie/series account safely and your screen streams live to all friends in this room!
            </p>
            <div className="choice-features">
              <span>🛡️ In-flight SSRF Firewall</span>
              <span>👥 Co-browse Remote Control</span>
              <span>🔒 Auto-purged Cookies</span>
            </div>
            {isHost && (
              <button
                type="button"
                className="btn btn-primary choice-action-btn"
                onClick={handleLaunchCloudBrowser}
                disabled={isLaunchingBrowser}
              >
                {isLaunchingBrowser ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Launching Cloud Browser...</span>
                  </>
                ) : (
                  <>
                    <Radio size={16} />
                    <span>Stream via Temporary Browser</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Choice 2: Local Tab Share with Audio */}
          <div className="cinema-stream-choice-card choice-card-local">
            <div className="choice-card-header">
              <div className="choice-icon-wrap icon-purple">
                <Tv size={22} />
              </div>
              <div className="choice-badge">LOCAL TAB & AUDIO</div>
            </div>
            <h3 className="choice-title">Share Browser Tab (With Audio)</h3>
            <p className="choice-desc">
              Don't want to use the cloud browser? Share your personal Netflix, Prime, or Crunchyroll browser tab directly with crystal-clear audio so friends can watch together.
            </p>
            <div className="choice-features">
              <span>🔊 HD Tab Audio Included</span>
              <span>⚡ Zero Cloud Latency</span>
              <span>🧩 Extension Sync Compatible</span>
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

        {/* Extension / Alternate Actions */}
        <div className="cinema-stage-secondary-actions">
          <button
            type="button"
            className="btn btn-subtle cinema-open-tab-btn"
            onClick={handleOpenPersonalTab}
          >
            <ExternalLink size={15} />
            <span>Open {media.badge.label.split(' ')[0]} in Local Tab</span>
          </button>

          <button
            type="button"
            className="btn btn-subtle cinema-change-btn"
            onClick={onOpenBrowserHub}
          >
            <Film size={15} />
            <span>Change Movie / Platform</span>
          </button>
        </div>

        {/* Privacy & Extension Status Footer */}
        <div className="cinema-extension-status-box">
          <div className="cinema-status-row">
            <Chrome size={16} className={extensionInstalled ? 'text-green' : 'text-purple'} />
            <span className="cinema-status-text">
              {extensionInstalled ? (
                <><strong>SyncTube Extension Active:</strong> Ready for tab-to-tab sync and local sharing.</>
              ) : (
                <><strong>SyncTube Extension:</strong> If everyone has their own streaming subscription, you can also use our extension to keep your separate tabs in sync.</>
              )}
            </span>
          </div>

          <div className="cinema-privacy-note">
            <ShieldCheck size={14} className="text-cyan" />
            <span>
              <strong>100% Secure & Ephemeral:</strong> Temporary browser sessions run in sandboxed containers with strict SSRF defense. No user credentials or session tokens are ever stored permanently.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
