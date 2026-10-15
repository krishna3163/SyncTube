import React, { useState } from 'react';
import {
  X,
  Globe,
  ExternalLink,
} from 'lucide-react';
import { detectClientMedia } from '../utils/media.js';
import { Role } from '../types.js';

interface BrowserHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: Role;
  extensionInstalled?: boolean;
  onSelectMedia: (mediaUrl: string, title?: string, platform?: string) => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

export const BrowserHubModal: React.FC<BrowserHubModalProps> = ({
  isOpen,
  onClose,
  userRole,
  onSelectMedia,
  onNotify,
}) => {
  const [urlInput, setUrlInput] = useState('');

  if (!isOpen) return null;

  const detected = urlInput.trim() ? detectClientMedia(urlInput.trim()) : null;
  const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    const media = detectClientMedia(urlInput.trim());
    if (!media) {
      onNotify('Please enter a valid URL or video link.', 'error');
      return;
    }

    if (!canControl) {
      window.open(media.url || urlInput.trim(), '_blank', 'noopener,noreferrer');
      onNotify(`Opened ${media.title} in your browser!`, 'info');
      return;
    }

    onSelectMedia(media.mediaId, media.title, media.platform);
    if (media.platform !== 'youtube' && media.url) {
      window.open(media.url, '_blank', 'noopener,noreferrer');
    }
    onNotify(`Party media set to: ${media.title}!`, 'success');
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card browser-hub-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="browser-hub-header-title">
            <Globe size={20} color="var(--accent)" />
            <div>
              <h2>Direct Stream & Web Media</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            title="Close modal"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body browser-hub-modal-body">
          <form onSubmit={handleCustomSubmit} className="browser-hub-url-bar" style={{ marginBottom: '1.25rem' }}>
            <div className="browser-hub-input-wrap">
              <Globe size={16} className="browser-hub-input-icon" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste any video stream link, MP4 URL, or YouTube link..."
                className="browser-hub-input"
              />
              {urlInput && (
                <button
                  type="button"
                  className="browser-hub-clear-btn"
                  onClick={() => setUrlInput('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary browser-hub-go-btn"
              disabled={!urlInput.trim()}
            >
              <ExternalLink size={15} />
              <span>{canControl ? 'Play Stream' : 'Open in Tab'}</span>
            </button>
          </form>

          {detected && (
            <div className="browser-hub-detected-preview" style={{ marginBottom: '1.25rem' }}>
              <div className="detected-left">
                <span className="detected-icon">{detected.badge.icon}</span>
                <div>
                  <div className="detected-badge">{detected.badge.label}</div>
                  <div className="detected-title">{detected.title}</div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleCustomSubmit}
              >
                Set as Party Media
              </button>
            </div>
          )}

          <div className="browser-hub-platforms">
            <h4 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Curated Streaming Platforms
            </h4>
            <div className="browser-platform-grid">
              {[
                {
                  name: 'Netflix',
                  url: 'https://netflix.com',
                  category: 'Cinema & TV Series',
                  desc: 'Synchronize Netflix shows and movies in full sync with your room.',
                  icon: '🍿',
                  color: 'rgba(229, 9, 20, 0.2)',
                },
                {
                  name: 'Prime Video',
                  url: 'https://primevideo.com',
                  category: 'Blockbusters & Originals',
                  desc: 'Watch Amazon Prime Originals & blockbusters with friends.',
                  icon: '🎬',
                  color: 'rgba(0, 168, 225, 0.2)',
                },
                {
                  name: 'Disney+',
                  url: 'https://disneyplus.com',
                  category: 'Animation & Marvel',
                  desc: 'Stream Disney, Pixar, Marvel, Star Wars & National Geographic.',
                  icon: '✨',
                  color: 'rgba(17, 60, 207, 0.2)',
                },
                {
                  name: 'Crunchyroll',
                  url: 'https://crunchyroll.com',
                  category: 'Anime Streaming',
                  desc: 'Stream newest anime simulcasts with your room.',
                  icon: '🍥',
                  color: 'rgba(244, 117, 33, 0.2)',
                },
                {
                  name: 'Twitch',
                  url: 'https://twitch.tv',
                  category: 'Live Broadcasts',
                  desc: 'Co-watch gaming, esports & live streamer broadcasts.',
                  icon: '👾',
                  color: 'rgba(145, 70, 255, 0.2)',
                },
                {
                  name: 'Live Screen & Tab Share',
                  url: 'tab:share',
                  category: 'Device Screen / Browser Tab',
                  desc: 'Share your device screen or browser tab directly to the room in real time.',
                  icon: '🖥️',
                  color: 'rgba(139, 92, 246, 0.25)',
                },
                {
                  name: 'Direct MP4 Stream',
                  url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                  category: 'Direct Video URL',
                  desc: 'Direct video file link (MP4, WebM, HLS m3u8).',
                  icon: '🌐',
                  color: 'rgba(16, 185, 129, 0.2)',
                },
              ].map((p) => (
                <div
                  key={p.name}
                  className="browser-platform-card"
                  onClick={() => {
                    if (p.url === 'tab:share') {
                      window.postMessage({ type: 'SYNCTUBE_START_TAB_SHARE', tabTitle: "Live Screen" }, '*');
                      onSelectMedia('tab:share', 'Live Screen Share', 'tab_share');
                    } else {
                      onSelectMedia(p.url, p.name, 'netflix');
                    }
                    onClose();
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="browser-platform-top">
                    <div className="browser-platform-icon-wrap" style={{ background: p.color }}>
                      <span>{p.icon}</span>
                    </div>
                    <span className="browser-platform-category">{p.category}</span>
                  </div>
                  <div className="browser-platform-body">
                    <h3 className="browser-platform-name">{p.name}</h3>
                    <p className="browser-platform-desc">{p.desc}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary browser-platform-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (p.url === 'tab:share') {
                        window.postMessage({ type: 'SYNCTUBE_START_TAB_SHARE', tabTitle: "Live Screen" }, '*');
                        onSelectMedia('tab:share', 'Live Screen Share', 'tab_share');
                      } else {
                        onSelectMedia(p.url, p.name, 'netflix');
                      }
                      onClose();
                    }}
                  >
                    <ExternalLink size={13} />
                    <span>Select Platform</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
