import React, { useState } from 'react';
import { Tv, Copy, Check, LogOut, Link2 } from 'lucide-react';
import { ConnectionStatus } from '../types.js';

interface RoomHeaderProps {
  roomId: string;
  connectionStatus: ConnectionStatus;
  onLeaveRoom: () => void;
  onNotify: (msg: string, type: 'success' | 'error') => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomId,
  connectionStatus,
  onLeaveRoom,
  onNotify,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    onNotify(`Room code ${roomId} copied!`, 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    onNotify('Room invite link copied to clipboard!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <header className="app-header">
      <div className="brand" onClick={onLeaveRoom}>
        <div className="brand-icon">
          <Tv size={20} color="#fff" />
        </div>
        <span className="brand-title">SyncTube</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div className="status-pill">
          <span className={`status-dot ${connectionStatus}`} />
          <span style={{ textTransform: 'capitalize' }}>{connectionStatus}</span>
        </div>

        <button
          className="btn btn-secondary"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
          onClick={handleCopyCode}
          title="Click to copy room code"
        >
          {copiedCode ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
          Room: <strong style={{ color: 'var(--text-main)', letterSpacing: '0.05em' }}>{roomId}</strong>
        </button>

        <button
          className="btn btn-secondary"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
          onClick={handleCopyLink}
          title="Click to copy invite link"
        >
          {copiedLink ? <Check size={14} color="var(--accent-emerald)" /> : <Link2 size={14} />}
          Share Link
        </button>

        <button
          className="btn btn-danger"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
          onClick={onLeaveRoom}
          title="Leave Room"
        >
          <LogOut size={14} />
          Leave
        </button>
      </div>
    </header>
  );
};
