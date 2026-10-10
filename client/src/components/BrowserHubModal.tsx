import React, { useState } from 'react';
import {
  X,
  Globe,
  ExternalLink,
  Film,
} from 'lucide-react';
import { detectClientMedia } from '../utils/media.js';
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
        {/* Header - without descriptions or removed platform tabs */}
        <div className="modal-header">
          <div className="browser-hub-header-title">
            <Film size={20} color="var(--accent)" />
            <div>
              <h2>Cinema & Movies</h2>
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

        {/* Modal Body */}
        <div className="modal-body browser-hub-modal-body">
          {/* Quick URL / Direct Video Address Bar */}
          <form onSubmit={handleCustomSubmit} className="browser-hub-url-bar">
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

          {/* Movies, Series & Anime Catalogue */}
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
        </div>
      </div>
    </div>
  );
};
