import React, { useState } from 'react';
import {
  X,
  Globe,
  Film,
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

// Real platform brand logos as crisp vectors
const NetflixLogo: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <path d="M4.5 2h3.8v20H4.5z" fill="#B81D24" />
    <path d="M15.7 2h3.8v20h-3.8z" fill="#B81D24" />
    <path d="M4.5 2h4l7.2 20h-4z" fill="#E50914" />
  </svg>
);

const PrimeVideoLogo: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <path
      d="M3.5 15.5c4.8 2.9 11.2 2.9 16 0"
      stroke="#00A8E1"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <path
      d="M17.8 13.8l2.2 1.8-1 2.2"
      stroke="#00A8E1"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 7.5h3.2c1.7 0 2.6.8 2.6 2.2 0 1.4-1 2.3-2.7 2.3H7.6V14H6V7.5zm1.6 3.1h1.4c.8 0 1.2-.4 1.2-1.1 0-.6-.5-1-1.2-1H7.6v2.1z"
      fill="#FFFFFF"
    />
    <path
      d="M13.8 9.2h1.5v4.8h-1.5V9.2zm0-2h1.5v1.4h-1.5V7.2z"
      fill="#FFFFFF"
    />
  </svg>
);

const DisneyPlusLogo: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <path
      d="M3.5 17.5C3.5 10 9 4 19.5 4.5"
      stroke="#40C4FF"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M7 6.5h3.8c3.2 0 4.8 1.8 4.8 4.6 0 2.9-1.8 4.7-4.8 4.7H7V6.5zm3.4 7.2c1.7 0 2.4-1 2.4-2.6 0-1.5-.7-2.5-2.4-2.5H9.2v5.1h1.2z"
      fill="#FFFFFF"
    />
    <path
      d="M18 10v4M16 12h4"
      stroke="#40C4FF"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <circle cx="19.5" cy="4.5" r="1" fill="#40C4FF" />
  </svg>
);

const CrunchyrollLogo: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <circle cx="12" cy="12" r="10" fill="#F47521" />
    <path
      d="M12.5 5.5c3.6 0 6.5 2.9 6.5 6.5s-2.9 6.5-6.5 6.5c-1.8 0-3.5-.7-4.7-2 2-1 3.5-3 3.5-5.5s-1.5-4.5-3.5-5.5c1.2-1.3 2.9-2 4.7-2z"
      fill="#FFFFFF"
    />
    <ellipse cx="14.5" cy="12" rx="2" ry="2.5" fill="#F47521" />
  </svg>
);

const TwitchLogo: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="#9146FF">
    <path fillRule="evenodd" clipRule="evenodd" d="M3 2L1.5 6v14h5v3l3-3h3.5L21 12V2H3zm16 9.5l-2.5 2.5H12l-2.5 2.5V14H5V4h14v7.5zM14.5 6.5h2v5h-2v-5zm-5 0h2v5h-2v-5z" />
  </svg>
);

const YouTubeLogo: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22">
    <path
      fill="#FF0000"
      d="M23.5 6.2c-.3-1.1-1.1-1.9-2.2-2.2C19.3 3.5 12 3.5 12 3.5s-7.3 0-9.3.5c-1.1.3-1.9 1.1-2.2 2.2C0 8.2 0 12 0 12s0 3.8.5 5.8c.3 1.1 1.1 1.9 2.2 2.2 2 .5 9.3.5 9.3.5s7.3 0 9.3-.5c1.1-.3 1.9-1.1 2.2-2.2.5-2 .5-5.8.5-5.8s0-3.8-.5-5.8z"
    />
    <polygon fill="#FFFFFF" points="9.5,15.5 15.5,12 9.5,8.5" />
  </svg>
);

const ScreenShareLogo: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <rect x="2" y="3.5" width="20" height="13" rx="2.5" fill="#8B5CF6" fillOpacity="0.25" stroke="#A78BFA" strokeWidth="1.8" />
    <path d="M8 20.5h8M12 16.5v4" stroke="#A78BFA" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M7 10l3-3 2 2 4-4" stroke="#C4B5FD" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DirectStreamLogo: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <rect x="2.5" y="3.5" width="19" height="17" rx="3" fill="#10B981" fillOpacity="0.2" stroke="#34D399" strokeWidth="1.8" />
    <circle cx="6.5" cy="7.5" r="1.3" fill="#34D399" />
    <circle cx="17.5" cy="7.5" r="1.3" fill="#34D399" />
    <circle cx="6.5" cy="16.5" r="1.3" fill="#34D399" />
    <circle cx="17.5" cy="16.5" r="1.3" fill="#34D399" />
    <polygon points="10,9.5 15.5,12 10,14.5" fill="#34D399" />
  </svg>
);

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

  const platforms = [
    {
      name: 'YouTube',
      url: 'https://youtube.com',
      category: 'Video & Live Streams',
      desc: 'Watch YouTube videos, music & livestreams in real-time sync.',
      logo: <YouTubeLogo />,
      color: 'rgba(255, 0, 0, 0.18)',
    },
    {
      name: 'Netflix',
      url: 'https://netflix.com',
      category: 'Cinema & TV Series',
      desc: 'Synchronize Netflix shows and movies in full sync with your room.',
      logo: <NetflixLogo />,
      color: 'rgba(229, 9, 20, 0.2)',
    },
    {
      name: 'Prime Video',
      url: 'https://primevideo.com',
      category: 'Blockbusters & Originals',
      desc: 'Watch Amazon Prime Originals & blockbusters with friends.',
      logo: <PrimeVideoLogo />,
      color: 'rgba(0, 168, 225, 0.2)',
    },
    {
      name: 'Disney+',
      url: 'https://disneyplus.com',
      category: 'Animation & Marvel',
      desc: 'Stream Disney, Pixar, Marvel, Star Wars & National Geographic.',
      logo: <DisneyPlusLogo />,
      color: 'rgba(17, 60, 207, 0.2)',
    },
    {
      name: 'Crunchyroll',
      url: 'https://crunchyroll.com',
      category: 'Anime Streaming',
      desc: 'Stream newest anime simulcasts with your room.',
      logo: <CrunchyrollLogo />,
      color: 'rgba(244, 117, 33, 0.2)',
    },
    {
      name: 'Twitch',
      url: 'https://twitch.tv',
      category: 'Live Broadcasts',
      desc: 'Co-watch gaming, esports & live streamer broadcasts.',
      logo: <TwitchLogo />,
      color: 'rgba(145, 70, 255, 0.2)',
    },
    {
      name: 'Live Screen & Tab Share',
      url: 'tab:share',
      category: 'Device Screen / Browser Tab',
      desc: 'Share your device screen or browser tab directly to the room in real time.',
      logo: <ScreenShareLogo />,
      color: 'rgba(139, 92, 246, 0.25)',
    },
    {
      name: 'Direct MP4 Stream',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      category: 'Direct Video URL',
      desc: 'Direct video file link (MP4, WebM, HLS m3u8).',
      logo: <DirectStreamLogo />,
      color: 'rgba(16, 185, 129, 0.2)',
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card browser-hub-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="browser-hub-header-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Film size={20} color="#38bdf8" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Direct Stream & Web Media</h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Play direct MP4, HLS m3u8, screen share, or streaming platforms</span>
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
              {platforms.map((p) => (
                <div
                  key={p.name}
                  className="browser-platform-card"
                  onClick={() => {
                    if (p.url === 'tab:share') {
                      try {
                        sessionStorage.setItem('synctube_pending_screen_share', 'true');
                      } catch {}
                      window.postMessage({ type: 'SYNCTUBE_START_TAB_SHARE', tabTitle: "Live Screen" }, '*');
                      onSelectMedia('tab:share', 'Live Screen Share', 'tab_share');
                    } else if (p.url === 'https://youtube.com') {
                      onSelectMedia('https://www.youtube.com', 'YouTube', 'youtube');
                    } else {
                      onSelectMedia(p.url, p.name, 'netflix');
                    }
                    onClose();
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="browser-platform-top">
                    <div className="browser-platform-icon-wrap" style={{ background: p.color }}>
                      {p.logo}
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
                        try {
                          sessionStorage.setItem('synctube_pending_screen_share', 'true');
                        } catch {}
                        window.postMessage({ type: 'SYNCTUBE_START_TAB_SHARE', tabTitle: "Live Screen" }, '*');
                        onSelectMedia('tab:share', 'Live Screen Share', 'tab_share');
                      } else if (p.url === 'https://youtube.com') {
                        onSelectMedia('https://www.youtube.com', 'YouTube', 'youtube');
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
