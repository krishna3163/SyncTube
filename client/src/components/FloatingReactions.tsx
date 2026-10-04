import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { Smile, Sparkles } from 'lucide-react';

interface FloatingReactionsProps {
  socket: Socket | null;
  username: string;
}

interface ReactionParticle {
  id: string;
  emoji: string;
  username: string;
  x: number; // percentage across screen
  rotation: number;
  scale: number;
}

const REACTION_EMOJIS = ['❤️', '🔥', '😂', '🍿', '👏', '🥳', '💀', '⚡'];

export const FloatingReactions: React.FC<FloatingReactionsProps> = ({ socket, username }) => {
  const [particles, setParticles] = useState<ReactionParticle[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Handle incoming reaction from socket
  useEffect(() => {
    if (!socket) return;

    const handleReactionReceived = (data: { emoji: string; username: string; id?: string }) => {
      const newParticle: ReactionParticle = {
        id: data.id || `rx_${Date.now()}_${Math.random()}`,
        emoji: data.emoji,
        username: data.username,
        x: Math.floor(Math.random() * 45) + 40, // 40% to 85% (right side)
        rotation: (Math.random() - 0.5) * 40,
        scale: 0.85 + Math.random() * 0.4,
      };

      setParticles((prev) => [...prev.slice(-25), newParticle]);

      // Remove after animation completes (2.5s)
      setTimeout(() => {
        setParticles((prev) => prev.filter((p) => p.id !== newParticle.id));
      }, 2400);
    };

    socket.on('reaction_received', handleReactionReceived);
    return () => {
      socket.off('reaction_received', handleReactionReceived);
    };
  }, [socket]);

  // Send reaction
  const sendReaction = useCallback((emoji: string) => {
    if (!socket) return;
    socket.emit('send_reaction', { emoji });
  }, [socket]);

  return (
    <>
      {/* Floating Animated Reaction Particles Container */}
      <div className="floating-reactions-canvas" aria-hidden="true">
        {particles.map((p) => (
          <div
            key={p.id}
            className="floating-reaction-item"
            style={{
              left: `${p.x}%`,
              transform: `scale(${p.scale}) rotate(${p.rotation}deg)`,
            }}
          >
            <span className="reaction-emoji">{p.emoji}</span>
            <span className="reaction-sender">{p.username}</span>
          </div>
        ))}
      </div>

      {/* Floating Reaction Launcher Pill (Bottom-Right / Floating) */}
      <div className={`floating-reactions-launcher ${isOpen ? 'open' : ''}`}>
        <button
          type="button"
          className="reaction-toggle-btn"
          onClick={() => setIsOpen((prev) => !prev)}
          title={isOpen ? 'Close reactions' : 'Send live reactions'}
          aria-label="Toggle Live Reactions"
        >
          <span className="reaction-toggle-emoji">❤️</span>
          <span className="reaction-toggle-label">React</span>
        </button>

        {isOpen && (
          <div className="reactions-palette">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="reaction-btn"
                onClick={() => sendReaction(emoji)}
                title={`Send ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
