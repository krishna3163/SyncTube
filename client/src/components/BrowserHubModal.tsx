import React, { useState } from 'react';
import {
  X,
  Globe,
  Compass,
  ExternalLink,
  Film,
  Play,
  Layers,
  Sparkles,
} from 'lucide-react';
import { detectClientMedia, CINEMA_SAMPLE_PRESETS } from '../utils/media.js';
import { Role } from '../types.js';
import { MovieSearchTab } from './MovieSearchTab.js';

interface BrowserHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: Role;
  extensionInstalled?: boolean;
  onSelectMedia: (mediaUrl: string, title?: string, platform?: string) => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

interface PlatformShortcut {
  id: string;
  name: string;
  url: string;
  icon: string;
  badge: string;
  category: 'streaming' | 'anime' | 'gaming' | 'cinema';
  color: string;
  description: string;
}

const STREAMING_PLATFORMS: PlatformShortcut[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    url: 'https://www.netflix.com',
    icon: '🍿',
    badge: 'Movies & Series',
    category: 'streaming',
    color: '#e50914',
    description: 'Log in and watch movies, series, and shows in sync with your friends.',
  },
  {
    id: 'prime',
    name: 'Amazon Prime Video',
    url: 'https://www.primevideo.com',
    icon: '🎬',
    badge: 'Cinema & TV',
    category: 'streaming',
    color: '#00a8e1',
    description: 'Synchronized Prime Video playback with party members.',
  },
  {
    id: 'disney',
    name: 'Disney+ / Hotstar',
    url: 'https://www.hotstar.com',
    icon: '✨',
    badge: 'Disney & Marvel',
    category: 'streaming',
    color: '#113ccf',
    description: 'Watch Marvel, Disney, Star Wars, and live sports together.',
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll',
    url: 'https://www.crunchyroll.com',
    icon: '🍥',
    badge: 'Anime Stream',
    category: 'anime',
    color: '#f47521',
    description: 'Stream latest anime episodes with anime avatar character reactions.',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    url: 'https://www.twitch.tv',
    icon: '🎮',
    badge: 'Live Gaming',
    category: 'gaming',
    color: '#9146ff',
    description: 'Watch live gaming tournaments and streamer broadcasts in sync.',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://www.youtube.com',
    icon: '▶️',
    badge: 'Native Embed',
    category: 'streaming',
    color: '#ff0000',
    description: 'Full YouTube watch party with search, playlists, and instant scrubbing.',
  },
];

export const BrowserHubModal: React.FC<BrowserHubModalProps> = ({
  isOpen,
  onClose,
  userRole,
  extensionInstalled,
  onSelectMedia,
  onNotify,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [activeTab, setActiveTab] = useState<'movies' | 'platforms' | 'direct'>('movies');

  if (!isOpen) return null;

  const detected = urlInput.trim() ? detectClientMedia(urlInput.trim()) : null;
  const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

  const handleLaunchPlatform = (shortcut: PlatformShortcut) => {
    if (!canControl) {
      window.open(shortcut.url, '_blank', 'noopener,noreferrer');
      onNotify(`Opened ${shortcut.name} in a new tab!`, 'info');
      return;
    }

    onSelectMedia(shortcut.url, `${shortcut.name} Watch Party`, shortcut.id);
    window.open(shortcut.url, '_blank', 'noopener,noreferrer');
    onNotify(`Set room party to ${shortcut.name} and opened in a new tab!`, 'success');
    onClose();
  };

  const handleLaunchDirectPreset = (preset: typeof CINEMA_SAMPLE_PRESETS[0]) => {
    if (!canControl) {
      onNotify('Only the host or moderator can set party media.', 'error');
      return;
    }

    onSelectMedia(preset.url, preset.name, 'direct');
    onNotify(`Loaded ${preset.name} on the watch party stage!`, 'success');
    onClose();
  };

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
        {/* Header */}
        <div className="modal-header">
          <div className="browser-hub-header-title">
            <Compass size={20} color="var(--accent)" />
            <div>
              <h2>Cinema & Streaming Hub</h2>
              <span className="browser-hub-subtitle">
                Watch MovieBox Cinema, YouTube, Netflix, Prime, Disney+, Crunchyroll, or any video stream with friends
              </span>
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

        {/* Modal Navigation Tabs */}
        <div className="browser-hub-tabs">
          <button
            type="button"
            className={`browser-hub-tab-btn ${activeTab === 'movies' ? 'active' : ''}`}
            onClick={() => setActiveTab('movies')}
          >
            <Film size={14} />
            <span>Movies & Series (MovieBox HD)</span>
          </button>

          <button
            type="button"
            className={`browser-hub-tab-btn ${activeTab === 'platforms' ? 'active' : ''}`}
            onClick={() => setActiveTab('platforms')}
          >
            <Globe size={14} />
            <span>Streaming Platforms</span>
          </button>

          <button
            type="button"
            className={`browser-hub-tab-btn ${activeTab === 'direct' ? 'active' : ''}`}
            onClick={() => setActiveTab('direct')}
          >
            <Compass size={14} />
            <span>Direct Movie Streams (4K)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body browser-hub-modal-body">
          {/* URL Search / Address Bar Row */}
          <form onSubmit={handleCustomSubmit} className="browser-hub-url-bar">
            <div className="browser-hub-input-wrap">
              <Globe size={16} className="browser-hub-input-icon" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter any streaming website URL, movie link, or YouTube video..."
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
              <span>{canControl ? 'Launch Party' : 'Open in Tab'}</span>
            </button>
          </form>

          {/* Real-time URL Detection Preview */}
          {detected && (
            <div className="browser-hub-detected-preview">
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

          {/* Tab 0: Movies & TV Shows (MovieBox) */}
          {activeTab === 'movies' && (
            <div style={{ marginTop: '0.5rem' }}>
              <MovieSearchTab
                userRole={userRole}
                onPlayStream={(streamUrl, title) => {
                  onSelectMedia(streamUrl, title, 'direct');
                  onClose();
                }}
                onAddToPlaylist={(streamUrl, title) => {
                  onSelectMedia(streamUrl, title, 'direct');
                  onClose();
                }}
                onNotify={onNotify}
                onCloseModal={onClose}
              />
            </div>
          )}

          {/* Tab 1: Streaming Platforms */}
          {activeTab === 'platforms' && (
            <div className="browser-hub-platforms-grid">
              {STREAMING_PLATFORMS.map((platform) => (
                <div
                  key={platform.id}
                  className="browser-platform-card"
                  onClick={() => handleLaunchPlatform(platform)}
                >
                  <div className="browser-platform-header">
                    <span className="platform-icon" style={{ borderColor: platform.color }}>
                      {platform.icon}
                    </span>
                    <div>
                      <h3 className="platform-name">{platform.name}</h3>
                      <span className="platform-badge">{platform.badge}</span>
                    </div>
                  </div>

                  <p className="platform-desc">{platform.description}</p>

                  <div className="browser-platform-action">
                    <span className="action-text">
                      {canControl ? 'Launch Watch Party' : 'Open in Tab'}
                    </span>
                    <ExternalLink size={13} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Direct Movie Streams */}
          {activeTab === 'direct' && (
            <div className="browser-hub-direct-section">
              <div className="direct-intro-box">
                <Film size={18} color="var(--accent)" />
                <p>
                  Direct cinema streams (.mp4, .webm, .m3u8) play <strong>directly inside your room stage</strong> with synchronized timeline scrubbing and zero installation needed!
                </p>
              </div>

              <div className="browser-hub-presets-grid">
                {CINEMA_SAMPLE_PRESETS.map((preset) => (
                  <div
                    key={preset.name}
                    className="browser-preset-card"
                    onClick={() => handleLaunchDirectPreset(preset)}
                  >
                    <div className="preset-card-left">
                      <span className="preset-card-icon">{preset.icon}</span>
                      <div>
                        <h4 className="preset-card-name">{preset.name}</h4>
                        <span className="preset-card-badge">{preset.badge}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLaunchDirectPreset(preset);
                      }}
                    >
                      <Play size={13} fill="currentColor" />
                      <span>Play in Room</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
