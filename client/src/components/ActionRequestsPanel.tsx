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
  SkipForward,
} from 'lucide-react';
import { PendingActionRequest, Role } from '../types.js';
import { formatTime } from '../utils/youtube.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { getParticipantCharacterId } from '../utils/characterMemory.js';

interface ActionRequestsPanelProps {
  pendingRequests: PendingActionRequest[];
  currentUserRole: Role;
  currentUserId: string;
  currentTime: number;
  onRequestAction: (
    type: 'play' | 'pause' | 'seek' | 'change_video' | 'request_next_video',
    data?: { time?: number; videoId?: string; title?: string; duration?: string; channel?: string }
  ) => void;
  onRespondRequest: (requestId: string, approved: boolean, mode?: 'now' | 'next') => void;
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

  const handleRequestVideoNow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoInput.trim()) return;
    onRequestAction('change_video', { videoId: videoInput.trim() });
    setVideoInput('');
  };

  const handleRequestVideoNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoInput.trim()) return;
    onRequestAction('request_next_video', { videoId: videoInput.trim() });
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
      case 'request_next_video':
        return (
          <span className="req-desc">
            <SkipForward size={14} className="req-type-icon next-icon" />
            Requested to queue as <strong>Next Video</strong>:{' '}
            <strong className="req-video-title">{req.data?.title || req.data?.videoId}</strong>
          </span>
        );
      case 'change_video':
        return (
          <span className="req-desc">
            <Tv size={14} className="req-type-icon video-icon" />
            Requested to <strong>Play Now</strong>:{' '}
            <strong className="req-video-title">{req.data?.title || req.data?.videoId}</strong>
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
            <span>Need a change? Ask Host/Mod to approve:</span>
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

          {/* Request Video Change / Play Next */}
          <div className="request-video-section" style={{ marginTop: '0.6rem' }}>
            <input
              type="text"
              className="chat-input"
              style={{ fontSize: '0.82rem', width: '100%', marginBottom: '0.35rem' }}
              placeholder="Paste YouTube URL or ID..."
              value={videoInput}
              onChange={(e) => setVideoInput(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!videoInput.trim()}
                onClick={handleRequestVideoNext}
                title="Request this video to play next in playlist"
                style={{ flex: 1, fontSize: '0.78rem', justifyContent: 'center' }}
              >
                <SkipForward size={13} /> Request Next
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!videoInput.trim()}
                onClick={handleRequestVideoNow}
                title="Request to switch video immediately"
                style={{ flex: 1, fontSize: '0.78rem', justifyContent: 'center' }}
              >
                <Send size={13} /> Play Now
              </button>
            </div>
          </div>

          {/* Request Seek */}
          <form onSubmit={handleRequestSeek} className="request-field-form" style={{ marginTop: '0.6rem' }}>
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
              const isVideoReq = req.type === 'change_video' || req.type === 'request_next_video';

              return (
                <div key={req.id} className="request-card-item">
                  <div className="request-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                      <AnimeAvatarDisplay
                        username={req.requesterName}
                        avatarId={getParticipantCharacterId(req.requesterName, req.requesterId, req.requesterAvatarId)}
                        size={24}
                        showTooltip
                      />
                      <span className="request-requester">
                        {req.requesterName} {isMine && <span className="req-you-tag">(You)</span>}
                      </span>
                    </div>
                    <span className="request-time">
                      {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="request-card-body">{renderActionDescription(req)}</div>

                  {/* Actions: Approve / Reject for Host & Moderator */}
                  {isPrivileged ? (
                    <div className="request-card-actions" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
                      {isVideoReq ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-approve btn-sm"
                            onClick={() => onRespondRequest(req.id, true, 'next')}
                            title="Add to top of playlist as next video"
                          >
                            <SkipForward size={13} /> Add Next
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => onRespondRequest(req.id, true, 'now')}
                            title="Play this video immediately"
                          >
                            <Play size={13} /> Play Now
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-approve btn-sm"
                          onClick={() => onRespondRequest(req.id, true)}
                          title="Approve and execute this action"
                        >
                          <Check size={14} /> Approve
                        </button>
                      )}

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
