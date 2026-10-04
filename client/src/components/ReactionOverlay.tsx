import React from 'react';
import { EmojiReaction } from '../types.js';

interface ReactionOverlayProps {
  reactions: EmojiReaction[];
}

export const ReactionOverlay: React.FC<ReactionOverlayProps> = ({ reactions }) => {
  return (
    <div className="reaction-overlay-container" aria-hidden="true">
      {reactions.map((rx) => {
        // pseudo-random horizontal offset based on timestamp/id
        const offsetPct = (Math.abs(rx.timestamp % 80) + 10);
        return (
          <div
            key={rx.id}
            className="floating-emoji"
            style={{ left: `${offsetPct}%` }}
          >
            <span className="emoji-char">{rx.emoji}</span>
            <span className="emoji-sender">{rx.username}</span>
          </div>
        );
      })}
    </div>
  );
};
