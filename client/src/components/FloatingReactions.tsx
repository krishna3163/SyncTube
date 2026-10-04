import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { GripVertical } from 'lucide-react';

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
const STORAGE_KEY = 'synctube_reaction_btn_pos_v2';

export const FloatingReactions: React.FC<FloatingReactionsProps> = ({ socket, username }) => {
  const [particles, setParticles] = useState<ReactionParticle[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const launcherRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
  } | null>(null);

  // Initialize and restore position (remembers user preference across views)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const clampToScreen = (x: number, y: number) => {
      const width = launcherRef.current?.offsetWidth || 115;
      const height = launcherRef.current?.offsetHeight || 38;
      const minX = 8;
      const maxX = Math.max(minX, window.innerWidth - width - 8);
      const minY = 54;
      const maxY = Math.max(minY, window.innerHeight - height - 8);
      return {
        x: Math.min(Math.max(minX, x), maxX),
        y: Math.min(Math.max(minY, y), maxY),
      };
    };

    let initialPosition = {
      x: Math.max(8, window.innerWidth - 125),
      y: window.innerWidth <= 768 ? 64 : 70,
    };

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          initialPosition = clampToScreen(parsed.x, parsed.y);
        }
      }
    } catch {
      // fallback to initial default
    }

    setPos(initialPosition);

    const handleResize = () => {
      setPos((prev) => (prev ? clampToScreen(prev.x, prev.y) : null));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle incoming reactions from server
  useEffect(() => {
    if (!socket) return;

    const handleReactionReceived = (data: { emoji: string; username: string; id?: string }) => {
      const newParticle: ReactionParticle = {
        id: data.id || `rx_${Date.now()}_${Math.random()}`,
        emoji: data.emoji,
        username: data.username,
        x: Math.floor(Math.random() * 45) + 40, // 40% to 85%
        rotation: (Math.random() - 0.5) * 40,
        scale: 0.85 + Math.random() * 0.4,
      };

      setParticles((prev) => [...prev.slice(-25), newParticle]);

      // Remove after 2.4s animation
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

  // Pointer down handler for smooth dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    // If interacting with the palette buttons, do not initiate drag
    if ((e.target as HTMLElement).closest('.reaction-btn')) return;

    // Only respond to primary click / touch
    if (e.button !== 0) return;

    // Close palette immediately when drag starts to provide a clean, compact pill to drag
    if (isOpen) {
      setIsOpen(false);
    }

    const currentX = pos ? pos.x : Math.max(8, window.innerWidth - 125);
    const currentY = pos ? pos.y : 68;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: currentX,
      origY: currentY,
      hasMoved: false,
    };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = moveEvt.clientX - dragStartRef.current.startX;
      const dy = moveEvt.clientY - dragStartRef.current.startY;

      // Threshold check to differentiate between tap/click vs actual drag
      if (!dragStartRef.current.hasMoved && Math.hypot(dx, dy) > 4) {
        dragStartRef.current.hasMoved = true;
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      if (dragStartRef.current.hasMoved) {
        if (moveEvt.cancelable) {
          moveEvt.preventDefault();
        }

        const width = launcherRef.current?.offsetWidth || 115;
        const height = launcherRef.current?.offsetHeight || 38;
        const minX = 8;
        const maxX = Math.max(minX, window.innerWidth - width - 8);
        const minY = 52;
        const maxY = Math.max(minY, window.innerHeight - height - 8);

        const nextX = Math.min(Math.max(minX, dragStartRef.current.origX + dx), maxX);
        const nextY = Math.min(Math.max(minY, dragStartRef.current.origY + dy), maxY);

        setPos({ x: nextX, y: nextY });
      }
    };

    const handlePointerUp = (upEvt: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      const wasDragging = isDraggingRef.current || (dragStartRef.current && dragStartRef.current.hasMoved);
      const finalPos = pos;

      if (wasDragging && finalPos) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(finalPos));
        } catch {
          // Ignore storage error
        }
      }

      dragStartRef.current = null;
      isDraggingRef.current = false;
      setIsDragging(false);

      if (!wasDragging) {
        // Pure tap or click without dragging: toggle reactions palette
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Smart placement for emoji palette so it stays 100% visible on screen
  const isRightSide = !pos || pos.x > (typeof window !== 'undefined' ? window.innerWidth / 2 : 400);
  const isNearBottom = pos && pos.y > (typeof window !== 'undefined' ? window.innerHeight - 150 : 500);

  return (
    <>
      {/* Floating Animated Reaction Particles */}
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

      {/* Draggable React Button Dock */}
      <div
        ref={launcherRef}
        className={`floating-reactions-launcher ${isOpen ? 'open' : ''} ${isDragging ? 'is-dragging' : ''}`}
        style={{
          left: pos ? `${pos.x}px` : undefined,
          top: pos ? `${pos.y}px` : undefined,
          right: pos ? 'auto' : undefined,
          bottom: pos ? 'auto' : undefined,
          alignItems: isRightSide ? 'flex-end' : 'flex-start',
        }}
      >
        {/* If placed near bottom of screen, show emoji palette ABOVE the button */}
        {isOpen && isNearBottom && (
          <div className="reactions-palette" style={{ marginBottom: '0.4rem' }}>
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="reaction-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  sendReaction(emoji);
                }}
                title={`Send ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Draggable React Pill Button */}
        <button
          type="button"
          className="reaction-toggle-btn"
          onPointerDown={handlePointerDown}
          title={isOpen ? 'Close reactions · Drag anywhere to move' : 'Send live reactions · Drag anywhere to move'}
          aria-label="Toggle Live Reactions (Draggable)"
        >
          <span className="reaction-drag-handle" title="Drag to move">
            <GripVertical size={14} />
          </span>
          <span className="reaction-toggle-emoji">❤️</span>
          <span className="reaction-toggle-label">React</span>
        </button>

        {/* If placed in upper/middle of screen, show emoji palette BELOW the button */}
        {isOpen && !isNearBottom && (
          <div className="reactions-palette" style={{ marginTop: '0.4rem' }}>
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="reaction-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  sendReaction(emoji);
                }}
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
