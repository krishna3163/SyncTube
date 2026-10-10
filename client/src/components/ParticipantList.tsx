import React from 'react';
import { Crown, Shield, ShieldCheck, ShieldAlert, UserMinus, Users, CheckCircle, Clock } from 'lucide-react';
import { ParticipantPublic, Role, ParticipantReadiness } from '../types.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { getParticipantCharacterId } from '../utils/characterMemory.js';

interface ParticipantListProps {
  participants: ParticipantPublic[];
  currentUserId: string;
  currentUserRole: Role;
  currentUserAvatarId?: string;
  readinessList?: ParticipantReadiness[];
  isCurrentUserReady?: boolean;
  onToggleReady?: () => void;
  onAssignRole: (userId: string, role: Role) => void;
  onRemoveParticipant: (userId: string) => void;
}

const ROLE_GLOW: Record<Role, string> = {
  HOST: '#FFD21F',
  MODERATOR: '#38bdf8',
  PARTICIPANT: 'transparent',
};

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  currentUserId,
  currentUserRole,
  currentUserAvatarId,
  readinessList,
  isCurrentUserReady,
  onToggleReady,
  onAssignRole,
  onRemoveParticipant,
}) => {
  const isHost = currentUserRole === 'HOST';

  const renderRoleBadge = (role: Role) => {
    switch (role) {
      case 'HOST':
        return (
          <span className="badge badge-host host-badge role-badge">
            <Crown size={12} />
            Host
          </span>
        );
      case 'MODERATOR':
        return (
          <span className="badge badge-moderator">
            <Shield size={12} />
            Mod
          </span>
        );
      case 'PARTICIPANT':
      default:
        return (
          <span className="badge badge-participant" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
            Viewer
          </span>
        );
    }
  };

  const readyCount = readinessList
    ? readinessList.filter((r) => r.status === 'ready').length
    : participants.length;

  return (
    <div className="glass-panel sidebar-card">
      <div className="sidebar-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={18} />
          Participants ({participants.length})
        </span>
        {readinessList && (
          <span style={{ fontSize: '0.72rem', color: readyCount === participants.length ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
            {readyCount}/{participants.length} Ready
          </span>
        )}
      </div>

      {onToggleReady && (
        <div style={{ padding: '0 0.5rem 0.6rem 0.5rem' }}>
          <button
            type="button"
            onClick={onToggleReady}
            style={{
              width: '100%',
              padding: '0.35rem 0.6rem',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              cursor: 'pointer',
              border: isCurrentUserReady ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
              background: isCurrentUserReady ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: isCurrentUserReady ? '#34d399' : '#fbbf24',
              transition: 'all 0.15s ease',
            }}
          >
            {isCurrentUserReady ? <CheckCircle size={13} /> : <Clock size={13} />}
            {isCurrentUserReady ? 'You are Ready' : 'Mark Yourself Ready'}
          </button>
        </div>
      )}

      <div className="participant-list">
        {participants.map((p) => {
          const isCurrentUser = p.userId === currentUserId;
          const glowColor = ROLE_GLOW[p.role];
          const readiness = readinessList?.find((r) => r.userId === p.userId);

          return (
            <div key={p.userId} className="participant-item">
              <div className="participant-info">
                {/* Anime avatar */}
                <div
                  style={{
                    boxShadow: p.role !== 'PARTICIPANT' ? `0 0 0 2px ${glowColor}` : undefined,
                    borderRadius: '50%',
                  }}
                >
                  <AnimeAvatarDisplay
                    username={p.username}
                    avatarId={p.avatarId || getParticipantCharacterId(p.username, p.userId)}
                    size={32}
                    showTooltip
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1 }}>
                  <span className="participant-name">
                    {p.username}
                    {isCurrentUser && (
                      <span style={{ color: 'var(--accent)', fontSize: '0.72rem', marginLeft: '0.3rem' }}>
                        (You)
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    {renderRoleBadge(p.role)}
                    {readiness && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '0.5px 5px',
                          borderRadius: '10px',
                          fontWeight: 600,
                          backgroundColor:
                            readiness.status === 'ready'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : readiness.status === 'loading' || readiness.status === 'buffering'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color:
                            readiness.status === 'ready'
                              ? '#34d399'
                              : readiness.status === 'loading' || readiness.status === 'buffering'
                              ? '#fbbf24'
                              : '#f87171',
                        }}
                      >
                        {readiness.status === 'ready' ? '🟢' : readiness.status === 'desynced' ? '🔴' : '🟡'}{' '}
                        {readiness.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isHost && !isCurrentUser && (
                <div className="participant-actions">
                  {p.role === 'PARTICIPANT' && (
                    <button
                      type="button"
                      className="btn-icon action-promote"
                      onClick={() => onAssignRole(p.userId, 'MODERATOR')}
                      title="Promote to Moderator"
                      aria-label="Promote to Moderator"
                    >
                      <ShieldCheck size={18} color="#38bdf8" strokeWidth={2.2} />
                    </button>
                  )}

                  {p.role === 'MODERATOR' && (
                    <button
                      type="button"
                      className="btn-icon action-demote"
                      onClick={() => onAssignRole(p.userId, 'PARTICIPANT')}
                      title="Demote to Participant"
                      aria-label="Demote to Participant"
                    >
                      <ShieldAlert size={18} color="#f4a942" strokeWidth={2.2} />
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn-icon action-host"
                    onClick={() => {
                      if (window.confirm(`Transfer Host ownership to ${p.username}? You will become a Moderator.`)) {
                        onAssignRole(p.userId, 'HOST');
                      }
                    }}
                    title="Transfer Host Ownership"
                    aria-label="Transfer Host Ownership"
                  >
                    <Crown size={18} color="#ffd21f" strokeWidth={2.2} />
                  </button>

                  <button
                    type="button"
                    className="btn-icon action-remove"
                    onClick={() => onRemoveParticipant(p.userId)}
                    title="Remove user from room"
                    aria-label="Remove user from room"
                  >
                    <UserMinus size={18} color="#f25f5c" strokeWidth={2.2} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
