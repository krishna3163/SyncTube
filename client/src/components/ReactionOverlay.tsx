import React from 'react';
import { EmojiReaction } from '../types.js';

interface ReactionOverlayProps {
  reactions: EmojiReaction[];
}

export const ReactionOverlay: React.FC<ReactionOverlayProps> = ({ reactions }) => {
  return (
    <div className="reaction-overlay-container" aria-hidden="true">
      {reactions.flatMap((rx) => {
        const burstCount = Math.min(6, Math.max(1, rx.burstCount || 4));
        const seed = Array.from(rx.id).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);

        return Array.from({ length: burstCount }, (_, index) => {
          const variation = (seed + index * 2654435761) >>> 0;
          const offsetPct = 12 + (variation % 76);
          const driftX = `${((variation >>> 8) % 181) - 90}px`;
          const rise = `${240 + ((variation >>> 16) % 141)}px`;
          const rotation = `${((variation >>> 4) % 61) - 30}deg`;
          const duration = `${2.4 + ((variation >>> 12) % 11) / 10}s`;
          const delay = `${(variation >>> 20) % 240}ms`;
          const scale = `${0.8 + ((variation >>> 24) % 61) / 100}`;

          return (
            <div
              key={`${rx.id}-${index}`}
              className="floating-emoji"
              style={{
                left: `${offsetPct}%`,
                bottom: `${8 + ((variation >>> 6) % 15)}%`,
                '--reaction-drift-x': driftX,
                '--reaction-rise': rise,
                '--reaction-rotation': rotation,
                '--reaction-duration': duration,
                '--reaction-delay': delay,
                '--reaction-scale': scale,
              } as React.CSSProperties}
            >
              <span className="emoji-char">{rx.emoji}</span>
              {index === 0 && <span className="emoji-sender">{rx.username}</span>}
            </div>
          );
        });
      })}
    </div>
  );
};
