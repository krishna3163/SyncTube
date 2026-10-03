import React from 'react';
import { Crown, Shield, User, ShieldCheck, ShieldAlert, UserMinus, Users } from 'lucide-react';
import { ParticipantPublic, Role } from '../types.js';

interface ParticipantListProps {
  participants: ParticipantPublic[];
  currentUserId: string;
  currentUserRole: Role;
  onAssignRole: (userId: string, role: Role) => void;
  onRemoveParticipant: (userId: string) => void;
}

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  currentUserId,
  currentUserRole,
  onAssignRole,
  onRemoveParticipant,
}) => {
  const isHost = currentUserRole === 'HOST';

  const renderRoleBadge = (role: Role) => {
    switch (role) {
      case 'HOST':
        return (
          <span className="badge badge-host">
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
          <span className="badge badge-participant">
            <User size={12} />
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

          return (
            <div key={p.userId} className="participant-item">
              <div className="participant-info">
                <span className="participant-name">
                  {p.username} {isCurrentUser && <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>(You)</span>}
                </span>
                {renderRoleBadge(p.role)}
              </div>

              {isHost && !isCurrentUser && (
                <div className="participant-actions">
                  {p.role === 'PARTICIPANT' && (
                    <button
                      className="btn-icon"
                      onClick={() => onAssignRole(p.userId, 'MODERATOR')}
                      title="Promote to Moderator"
                    >
                      <ShieldCheck size={16} color="var(--accent-cyan)" />
                    </button>
                  )}

                  {p.role === 'MODERATOR' && (
                    <button
                      className="btn-icon"
                      onClick={() => onAssignRole(p.userId, 'PARTICIPANT')}
                      title="Demote to Participant"
                    >
                      <ShieldAlert size={16} color="var(--text-muted)" />
                    </button>
                  )}

                  <button
                    className="btn-icon"
                    onClick={() => onRemoveParticipant(p.userId)}
                    title="Remove user from room"
                  >
                    <UserMinus size={16} color="var(--accent-rose)" />
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
