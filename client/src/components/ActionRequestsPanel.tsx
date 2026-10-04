import React, { useState } from 'react';
import {
  Bell,
  Check,
  X,
  Play,
  Pause,
  Clock,
  Tv,
  Send,
  HelpCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { PendingActionRequest, Role } from '../types.js';
import { formatTime } from '../utils/youtube.js';

interface ActionRequestsPanelProps {
  pendingRequests: PendingActionRequest[];
  currentUserRole: Role;
  currentUserId: string;
  currentTime: number;
  onRequestAction: (
    type: 'play' | 'pause' | 'seek' | 'change_video',
    data?: { time?: number; videoId?: string }
  ) => void;
  onRespondRequest: (requestId: string, approved: boolean) => void;
}

export const ActionRequestsPanel: React.FC<ActionRequestsPanelProps> = ({
  pendingRequests,
  currentUserRole,
  currentUserId,
  currentTime,
  onRequestAction,
  onRespondRequest,
}) => {
  const isPrivileged = currentUserRole === 'HOST' || currentUserRole === 'MODERATOR';
  const [videoInput, setVideoInput] = useState('');
  const [seekSeconds, setSeekSeconds] = useState<string>(Math.floor(currentTime).toString());

  const handleRequestVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoInput.trim()) return;
    onRequestAction('change_video', { videoId: videoInput.trim() });
    setVideoInput('');
  };

  const handleRequestSeek = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(seekSeconds);
    if (isNaN(val) || val < 0) return;
    onRequestAction('seek', { time: val });
  };

  const renderActionDescription = (req: PendingActionRequest) => {
    switch (req.type) {
      case 'play':
        return (
          <span className="req-desc">
            <Play size={14} className="req-type-icon play-icon" />
            Requested to <strong>Play</strong> the video
          </span>
        );
      case 'pause':
        return (
          <span className="req-desc">
            <Pause size={14} className="req-type-icon pause-icon" />
            Requested to <strong>Pause</strong> the video
          </span>
        );
      case 'seek':
        return (
          <span className="req-desc">
            <Clock size={14} className="req-type-icon seek-icon" />
            Requested to <strong>Seek</strong> to {formatTime(req.data?.time || 0)}
          </span>
        );
      case 'change_video':
        return (
          <span className="req-desc">
            <Tv size={14} className="req-type-icon video-icon" />
            Requested to <strong>Change Video</strong> to{' '}
            <code className="req-video-code">{req.data?.videoId}</code>
          </span>
        );
      default:
        return <span>Requested action: {req.type}</span>;
    }
  };

  return (
    <div className="glass-panel sidebar-card requests-panel-container">
      <div className="sidebar-title" style={{ marginBottom: '0.75rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Bell size={18} />
          Requests & Approvals
          {pendingRequests.length > 0 && (
            <span className="badge-counter">{pendingRequests.length}</span>
          )}
        </span>
      </div>

      {/* Participant Request Form (Available to Viewers) */}
      {!isPrivileged && (
        <div className="participant-request-box">
          <div className="request-box-heading">
            <HelpCircle size={14} />
            <span>Need a change? Ask the Host/Mod to approve:</span>
          </div>

          <div className="quick-request-buttons">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onRequestAction('play')}
              title="Ask host to start playback"
            >
              <Play size={12} /> Play
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onRequestAction('pause')}
              title="Ask host to pause playback"
            >
              <Pause size={12} /> Pause
            </button>
          </div>

          {/* Request Video Change */}
          <form onSubmit={handleRequestVideo} className="request-field-form">
            <input
              type="text"
              className="chat-input"
              style={{ fontSize: '0.82rem' }}
              placeholder="Paste YouTube URL or ID..."
              value={videoInput}
              onChange={(e) => setVideoInput(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!videoInput.trim()}
              title="Request this video to be played"
            >
              <Send size={13} />
            </button>
          </form>

          {/* Request Seek */}
          <form onSubmit={handleRequestSeek} className="request-field-form" style={{ marginTop: '0.4rem' }}>
            <input
              type="number"
              min="0"
              className="chat-input"
              style={{ fontSize: '0.82rem' }}
              placeholder="Seek timestamp (seconds)..."
              value={seekSeconds}
              onChange={(e) => setSeekSeconds(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              title="Request jump to timestamp"
            >
              <Clock size={13} /> Seek
            </button>
          </form>
        </div>
      )}

      {/* Pending Requests List */}
      <div className="pending-requests-section">
        <h4 className="requests-subheading">
          Pending Queue ({pendingRequests.length})
        </h4>

        {pendingRequests.length === 0 ? (
          <div className="requests-empty-state">
            <CheckCircle2 size={24} style={{ opacity: 0.4, color: 'var(--green)' }} />
            <p style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              No pending requests right now.
            </p>
          </div>
        ) : (
          <div className="requests-list">
            {pendingRequests.map((req) => {
              const isMine = req.requesterId === currentUserId;
              return (
                <div key={req.id} className="request-card-item">
                  <div className="request-card-header">
                    <span className="request-requester">
                      {req.requesterName} {isMine && <span className="req-you-tag">(You)</span>}
                    </span>
                    <span className="request-time">
                      {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="request-card-body">{renderActionDescription(req)}</div>

                  {/* Actions: Approve / Reject for Host & Moderator */}
                  {isPrivileged ? (
                    <div className="request-card-actions">
                      <button
                        type="button"
                        className="btn btn-approve btn-sm"
                        onClick={() => onRespondRequest(req.id, true)}
                        title="Approve and execute this action"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-reject btn-sm"
                        onClick={() => onRespondRequest(req.id, false)}
                        title="Reject this request"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  ) : isMine ? (
                    <div className="request-pending-status">
                      <Clock size={12} className="spin-slow" />
                      <span>Awaiting Host/Mod review...</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
