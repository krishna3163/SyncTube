import React, { useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  X,
  MessageSquare,
  Send,
  QrCode,
  Globe,
} from 'lucide-react';

export interface ShareStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  streamTitle?: string;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const ShareStreamModal: React.FC<ShareStreamModalProps> = ({
  isOpen,
  onClose,
  roomId,
  streamTitle = 'Live Watch Party',
  onNotify,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);

  if (!isOpen) return null;

  const roomUrl = `${window.location.origin}/room/${roomId}`;
  const encodedUrl = encodeURIComponent(roomUrl);
  const shareText = encodeURIComponent(`🍿 Watch "${streamTitle}" live with me on SyncTube! Room code: ${roomId}`);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(roomUrl);
    setCopiedLink(true);
    onNotify('Stream link copied to clipboard!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    onNotify(`Room code ${roomId} copied!`, 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const socialLinks = [
    {
      name: 'WhatsApp',
      url: `https://api.whatsapp.com/send?text=${shareText}%20${encodedUrl}`,
      color: '#25D366',
      icon: MessageSquare,
    },
    {
      name: 'Telegram',
      url: `https://t.me/share/url?url=${encodedUrl}&text=${shareText}`,
      color: '#0088cc',
      icon: Send,
    },
    {
      name: 'X (Twitter)',
      url: `https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`,
      color: '#1DA1F2',
      icon: Globe,
    },
    {
      name: 'Reddit',
      url: `https://reddit.com/submit?url=${encodedUrl}&title=${shareText}`,
      color: '#FF4500',
      icon: MessageSquare,
    },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content share-stream-modal glass card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <div className="modal-icon-badge">
              <Share2 size={20} color="var(--accent)" />
            </div>
            <div>
              <h3>Share Live Stream</h3>
              <p className="modal-subtitle">Invite friends to watch synchronized in real-time</p>
            </div>
          </div>
          <button type="button" className="btn-icon modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body share-modal-body">
          {/* Stream Summary Card */}
          <div className="share-stream-preview-card">
            <div className="share-preview-live-pill">
              <span className="live-pulse-dot" />
              <span>LIVE BROADCAST</span>
            </div>
            <h4 className="share-preview-title">{streamTitle}</h4>
            <div className="share-preview-meta">Room Code: <strong>{roomId}</strong></div>
          </div>

          {/* Copy Link Section */}
          <div className="share-input-group">
            <label className="share-label">Stream Link</label>
            <div className="share-input-row">
              <input type="text" readOnly value={roomUrl} className="share-url-input" />
              <button
                type="button"
                className="btn btn-primary share-copy-btn"
                onClick={handleCopyLink}
              >
                {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Quick Room Code Copy */}
          <div className="share-code-box">
            <div className="share-code-meta">
              <span>Quick Room Code</span>
              <span className="share-code-value">{roomId}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCopyCode}
            >
              {copiedCode ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>

          {/* Social Platforms Row */}
          <div className="share-social-section">
            <span className="share-social-label">Share directly to apps</span>
            <div className="share-social-grid">
              {socialLinks.map((s) => {
                const Icon = s.icon;
                return (
                  <a
                    key={s.name}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="share-social-item"
                    style={{ '--brand-color': s.color } as React.CSSProperties}
                  >
                    <Icon size={18} style={{ color: s.color }} />
                    <span>{s.name}</span>
                  </a>
                );
              })}
            </div>
          </div>

          {/* QR Code Toggle for TV & Mobile */}
          <div className="share-qr-section">
            <button
              type="button"
              className="btn btn-secondary btn-block share-qr-toggle"
              onClick={() => setShowQR((prev) => !prev)}
            >
              <QrCode size={16} />
              <span>{showQR ? 'Hide Mobile & TV QR Code' : 'Show Mobile & TV QR Code'}</span>
            </button>

            {showQR && (
              <div className="share-qr-display-box card glass">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodedUrl}&bgcolor=18181b&color=ffd21f`}
                  alt="Room QR Code"
                  className="share-qr-img"
                />
                <p className="share-qr-hint">Scan with phone camera to instantly join the watch party</p>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
