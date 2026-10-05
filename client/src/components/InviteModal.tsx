import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Share2, Copy, Check, X, MessageSquare, Send } from 'lucide-react';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  roomId,
  onNotify,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Construct invite link pointing to home page with auto-fill room query param
  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?room=${encodeURIComponent(roomId)}`
    : '';

  useEffect(() => {
    if (isOpen && canvasRef.current && inviteUrl) {
      QRCode.toCanvas(
        canvasRef.current,
        inviteUrl,
        {
          width: 200,
          margin: 2,
          color: {
            dark: '#110e1b',
            light: '#ffd21f',
          },
        },
        (error) => {
          if (error) console.error('QR code generation error:', error);
        }
      );
    }
  }, [isOpen, inviteUrl]);

  if (!isOpen) return null;

  const copyToClipboard = async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
        onNotify('Invite link copied to clipboard!', 'success');
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
        onNotify('Room Code copied to clipboard!', 'success');
      }
    } catch {
      onNotify('Failed to copy to clipboard', 'error');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join my YouTube Watch Party (${roomId})!`,
          text: `Hey! Join my YouTube Watch Party and watch synchronized videos together:`,
          url: inviteUrl,
        });
        onNotify('Shared successfully!', 'success');
      } catch (err) {
        // User cancelled or unsupported
      }
    } else {
      copyToClipboard(inviteUrl, 'link');
    }
  };

  const shareToWhatsApp = () => {
    const text = `🍿 Join my YouTube Watch Party!\nRoom Code: ${roomId}\nJoin here: ${inviteUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareToTelegram = () => {
    const text = `🍿 Join my YouTube Watch Party! Room: ${roomId}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="glass-panel modal-card invite-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Share2 size={20} color="var(--accent)" />
            <h2 className="modal-title">Invite Friends to Party</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body invite-modal-body">
          {/* QR Code Section */}
          <div className="invite-qr-section">
            <div className="invite-qr-frame">
              <canvas ref={canvasRef} className="invite-qr-canvas" />
            </div>
            <p className="invite-qr-hint">Scan with mobile camera to join instantly</p>
          </div>

          {/* Room Code Card */}
          <div className="invite-code-card">
            <div className="invite-code-left">
              <span className="invite-code-label">ROOM CODE</span>
              <span className="invite-code-value">{roomId}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => copyToClipboard(roomId, 'code')}
              title="Copy Room Code"
            >
              {copiedCode ? <Check size={15} color="var(--success)" /> : <Copy size={15} />}
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* Direct Link Input */}
          <div className="invite-link-wrap">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              className="input-field invite-link-input"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              className="btn btn-primary invite-link-copy-btn"
              onClick={() => copyToClipboard(inviteUrl, 'link')}
            >
              {copiedLink ? <Check size={16} /> : <Copy size={16} />}
              <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>

          {/* Quick Share Buttons */}
          <div className="invite-social-row">
            <button
              type="button"
              className="btn invite-social-btn whatsapp-btn"
              onClick={shareToWhatsApp}
              title="Share via WhatsApp"
            >
              <MessageSquare size={16} />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              className="btn invite-social-btn telegram-btn"
              onClick={shareToTelegram}
              title="Share via Telegram"
            >
              <Send size={16} />
              <span>Telegram</span>
            </button>
            {'share' in navigator && (
              <button
                type="button"
                className="btn btn-secondary invite-social-btn"
                onClick={handleNativeShare}
                title="Share using device options"
              >
                <Share2 size={16} />
                <span>More</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
