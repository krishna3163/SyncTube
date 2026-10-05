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
  const ignoreNextClickRef = useRef(false);
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 70 });
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    lastClientX: number;
    lastClientY: number;
    hasMoved: boolean;
    pointerId: number;
    target: HTMLElement;
  } | null>(null);

  // Initialize and restore position (remembers user preference across views)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const clampToScreen = (x: number, y: number) => {
      const width = launcherRef.current?.offsetWidth || 115;
      const height = launcherRef.current?.offsetHeight || 38;
      const minX = 8;
      const maxX = Math.max(minX, window.innerWidth - width - 8);
      const minY = 56;
      const maxY = Math.max(minY, window.innerHeight - height - 12);
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

    posRef.current = initialPosition;
    setPos(initialPosition);

    const handleResize = () => {
      const clamped = clampToScreen(posRef.current.x, posRef.current.y);
      posRef.current = clamped;
      setPos(clamped);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      document.body.classList.remove('is-dragging-reaction');
    };
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

  // Pointer down handler for smooth dragging and immediate response
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // If interacting with the palette buttons, do not initiate drag
    if ((e.target as HTMLElement).closest('.reaction-btn')) return;

    // Only respond to primary click / touch
    if (e.button !== 0) return;

    const targetEl = e.currentTarget;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture unsupported
    }

    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      hasMoved: false,
      pointerId: e.pointerId,
      target: targetEl,
    };

    const handlePointerMove = (moveEvt: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const totalDist = Math.hypot(moveEvt.clientX - state.startX, moveEvt.clientY - state.startY);

      // Threshold check to differentiate between tap/click vs actual drag
      if (!state.hasMoved && totalDist > 4) {
        state.hasMoved = true;
        isDraggingRef.current = true;
        setIsDragging(true);
        setIsOpen(false);
        document.body.classList.add('is-dragging-reaction');
      }

      if (state.hasMoved) {
        if (moveEvt.cancelable) {
          moveEvt.preventDefault();
        }

        const width = launcherRef.current?.offsetWidth || 115;
        const height = launcherRef.current?.offsetHeight || 38;
        const minX = 8;
        const maxX = Math.max(minX, window.innerWidth - width - 8);
        const minY = 54;
        const maxY = Math.max(minY, window.innerHeight - height - 12);

        const dx = moveEvt.clientX - state.lastClientX;
        const dy = moveEvt.clientY - state.lastClientY;

        // Apply delta to current clamped position so moving out of corner responds instantly
        const nextX = Math.min(Math.max(minX, posRef.current.x + dx), maxX);
        const nextY = Math.min(Math.max(minY, posRef.current.y + dy), maxY);

        posRef.current = { x: nextX, y: nextY };
        setPos({ x: nextX, y: nextY });

        state.lastClientX = moveEvt.clientX;
        state.lastClientY = moveEvt.clientY;
      }
    };

    const handlePointerUp = (upEvt: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.classList.remove('is-dragging-reaction');

      const state = dragStateRef.current;
      if (state) {
        try {
          state.target.releasePointerCapture(state.pointerId);
        } catch {
          // Ignore
        }

        if (state.hasMoved) {
          ignoreNextClickRef.current = true;
          setTimeout(() => {
            ignoreNextClickRef.current = false;
          }, 150);

          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(posRef.current));
          } catch {
            // Ignore storage error
          }
        }
      }

      dragStateRef.current = null;
      isDraggingRef.current = false;
      setIsDragging(false);
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
          onClick={() => {
            if (ignoreNextClickRef.current) {
              ignoreNextClickRef.current = false;
              return;
            }
            if (!isDraggingRef.current) {
              setIsOpen((prev) => !prev);
            }
          }}
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
