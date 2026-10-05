import React from 'react';
import { AnimeAvatar, ANIME_AVATARS, getAvatarForUsername } from '../utils/animeAvatars.js';

interface AnimeAvatarDisplayProps {
  username: string;
  avatarId?: string;
  size?: number;
  className?: string;
  showTooltip?: boolean;
}

export const AnimeAvatarDisplay: React.FC<AnimeAvatarDisplayProps> = ({
  username,
  avatarId,
  size = 36,
  className = '',
  showTooltip = false,
}) => {
  const avatar = avatarId
    ? (ANIME_AVATARS.find((a) => a.id === avatarId) ?? getAvatarForUsername(username))
    : getAvatarForUsername(username);

  const [imgError, setImgError] = React.useState(false);

  return (
    <div
      className={`anime-avatar-display ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${avatar.bgFrom}, ${avatar.bgTo})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.45,
        flexShrink: 0,
        boxShadow: `0 0 0 2px rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.45)`,
        position: 'relative',
        cursor: showTooltip ? 'default' : undefined,
      }}
      title={showTooltip ? avatar.name : undefined}
    >
      {!imgError ? (
        <img
          src={`/avatars/${avatar.id}.png`}
          alt={avatar.name}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            borderRadius: '50%',
          }}
          loading="lazy"
        />
      ) : (
        <span>{avatar.emoji}</span>
      )}
    </div>
  );
};

// Avatar picker grid for settings
interface AvatarPickerProps {
  selectedId?: string;
  username: string;
  onSelect: (id: string) => void;
}

export const AvatarPicker: React.FC<AvatarPickerProps> = ({ selectedId, username, onSelect }) => {
  const current = selectedId
    ? (ANIME_AVATARS.find((a) => a.id === selectedId) ?? getAvatarForUsername(username))
    : getAvatarForUsername(username);

  return (
    <div className="avatar-picker">
      <div className="avatar-picker-preview">
        <AnimeAvatarDisplay username={username} avatarId={selectedId} size={72} showTooltip />
        <div className="avatar-picker-preview-info">
          <span className="avatar-picker-name">{current.name}</span>
        </div>
      </div>
      <div className="avatar-picker-grid">
        {ANIME_AVATARS.map((av: AnimeAvatar) => {
          const isSelected = selectedId ? av.id === selectedId : av.id === current.id;

          return (
            <button
              key={av.id}
              type="button"
              className={`avatar-picker-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(av.id)}
              title={`${av.name} · ${av.series}`}
              style={{
                background: `linear-gradient(135deg, ${av.bgFrom}, ${av.bgTo})`,
                overflow: 'hidden',
                padding: 0,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={`/avatars/${av.id}.png`}
                alt={av.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '50%',
                  display: 'block',
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
                loading="lazy"
              />
              <span className="avatar-picker-emoji" style={{ position: 'absolute', pointerEvents: 'none' }}>
                {av.emoji}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
