import React from 'react';
import { Crown, Shield, ShieldCheck, ShieldAlert, UserMinus, Users } from 'lucide-react';
import { ParticipantPublic, Role } from '../types.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { getParticipantCharacterId } from '../utils/characterMemory.js';

interface ParticipantListProps {
  participants: ParticipantPublic[];
  currentUserId: string;
  currentUserRole: Role;
  currentUserAvatarId?: string;
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

  return (
    <div className="glass-panel sidebar-card">
      <div className="sidebar-title">
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={18} />
          Participants ({participants.length})
        </span>
      </div>

      <div className="participant-list">
        {participants.map((p) => {
          const isCurrentUser = p.userId === currentUserId;
          const glowColor = ROLE_GLOW[p.role];

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
                  {renderRoleBadge(p.role)}
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
