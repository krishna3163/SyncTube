import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { BarChart3, Plus, X } from 'lucide-react';
import { getAvatarById } from '../utils/animeAvatars.js';

interface FloatingReactionsProps {
  socket: Socket | null;
  username: string;
  avatarId?: string;
  inline?: boolean;
  currentTime?: number;
  userRole?: string;
  alwaysExpanded?: boolean;
}

interface ReactionParticle {
  id: string;
  emoji: string;
  username: string;
  x: number; // percentage across screen
  rotation: number;
  scale: number;
}

const REACTION_EMOJIS = ['🦊', '🍥', '⚡', '🔥', '🏴‍☠️', '🍖', '🌊', '⚔️', '🧹', '🌙', '✨'];
const REACTION_GROUPS = {
  Basic: ['❤️', '😂', '🔥', '👏', '😮', '😢', '😡', '🎉', '🍿', '💀'],
  'Watch Party': ['⏪', '⏩', '🤯', '😱', '🥹', '🧠', '💤', '🎬', '🔊', '❓'],
  Character: REACTION_EMOJIS,
} as const;
const CHARACTER_REACTIONS: Record<string, string[]> = {
  naruto: ['🦊', '🍥'],
  goku: ['⚡', '🔥'],
  luffy: ['🏴‍☠️', '🍖'],
  tanjiro: ['🌊', '⚔️'],
  levi: ['⚔️', '🧹'],
  sailor: ['🌙', '✨'],
};
const STORAGE_KEY = 'synctube_reaction_btn_pos_v2';

export const FloatingReactions: React.FC<FloatingReactionsProps> = ({ socket, username, avatarId, inline = false, currentTime = 0, userRole, alwaysExpanded = false }) => {
  const [particles, setParticles] = useState<ReactionParticle[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [reactionGroup, setReactionGroup] = useState<keyof typeof REACTION_GROUPS>('Basic');
  const [recentCounts, setRecentCounts] = useState<Record<string, number>>({});
  const [recentReactions, setRecentReactions] = useState<string[]>([]);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('Yes, No');
  const lastSentAtRef = useRef(0);
  const recentCountsRef = useRef<Record<string, number>>({});
  const particleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const launcherRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    recentCountsRef.current = recentCounts;
  }, [recentCounts]);

  // Initialize and restore position (remembers user preference across views)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const clampToScreen = (x: number, y: number) => {
      const width = buttonRef.current?.offsetWidth || 115;
      const height = buttonRef.current?.offsetHeight || 38;
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
      y: Math.max(56, window.innerHeight - 125),
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

  // Re-clamp restored positions after the button has rendered and whenever
  // the viewport changes. The palette must not affect the button's bounds.
  useEffect(() => {
    if (!pos) return;

    const clampButtonPosition = () => {
      const width = buttonRef.current?.offsetWidth || 115;
      const height = buttonRef.current?.offsetHeight || 38;
      const next = {
        x: Math.min(Math.max(8, posRef.current.x), Math.max(8, window.innerWidth - width - 8)),
        y: Math.min(Math.max(56, posRef.current.y), Math.max(56, window.innerHeight - height - 12)),
      };
      if (next.x !== posRef.current.x || next.y !== posRef.current.y) {
        posRef.current = next;
        setPos(next);
      }
    };

    const frame = window.requestAnimationFrame(clampButtonPosition);
    window.addEventListener('resize', clampButtonPosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', clampButtonPosition);
    };
  }, [pos, isOpen]);

  // Clicking outside the launcher or pressing Escape closes the palette.
  useEffect(() => {
    if (!isOpen || alwaysExpanded) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!launcherRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, alwaysExpanded]);

  // Handle incoming reactions from server
  useEffect(() => {
    if (!socket) return;

    const handleReactionReceived = (data: { emoji?: string; username?: string; id?: string }) => {
      if (typeof data?.emoji !== 'string' || !data.emoji.trim()) return;

      const newParticle: ReactionParticle = {
        id: data.id || `rx_${Date.now()}_${Math.random()}`,
        emoji: data.emoji,
        username: typeof data.username === 'string' && data.username.trim() ? data.username : 'Guest',
        x: Math.floor(Math.random() * 45) + 40, // 40% to 85%
        rotation: (Math.random() - 0.5) * 40,
        scale: 0.85 + Math.random() * 0.4,
      };

      const activeCount = recentCountsRef.current[data.emoji] || 0;
      newParticle.scale = activeCount >= 2 ? 1.25 : newParticle.scale;
      setParticles((prev) => [...prev.slice(-25), newParticle]);
      setRecentCounts((prev) => {
        const next = { ...prev, [data.emoji as string]: (prev[data.emoji as string] || 0) + 1 };
        recentCountsRef.current = next;
        return next;
      });

      // Remove after 2.4s animation
      const timer = setTimeout(() => {
        setParticles((prev) => prev.filter((p) => p.id !== newParticle.id));
        setRecentCounts((prev) => {
          const next = { ...prev };
          const emoji = data.emoji as string;
          if (!next[emoji] || next[emoji] <= 1) delete next[emoji];
          else next[emoji] -= 1;
          recentCountsRef.current = next;
          return next;
        });
      }, 2400);
      particleTimersRef.current.push(timer);
    };

    socket.on('reaction_received', handleReactionReceived);
    return () => {
      socket.off('reaction_received', handleReactionReceived);
    };
  }, [socket]);

  useEffect(() => () => {
    particleTimersRef.current.forEach((timer) => clearTimeout(timer));
    particleTimersRef.current = [];
  }, []);

  const createPoll = () => {
    const options = pollOptions.split(',').map((item) => item.trim()).filter(Boolean);
    if (!socket || !pollQuestion.trim() || options.length < 2) return;
    socket.emit('create_poll', { question: pollQuestion.trim(), options });
    setPollQuestion('');
    setPollOptions('Yes, No');
    setShowPollComposer(false);
  };

  // Send reaction
  const sendReaction = useCallback((emoji: string) => {
    if (!socket) return;
    const now = Date.now();
    if (now - lastSentAtRef.current < 500) return;
    lastSentAtRef.current = now;
    setRecentReactions((prev) => {
      const next = [emoji, ...prev.filter((item) => item !== emoji)].slice(0, 5);
      localStorage.setItem('synctube_recent_reactions', JSON.stringify(next));
      return next;
    });
    socket.emit('send_reaction', { emoji, videoTime: currentTime });
    setIsOpen(false);
  }, [socket, currentTime]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('synctube_recent_reactions') || '[]');
      if (Array.isArray(saved)) setRecentReactions(saved.filter((item) => typeof item === 'string').slice(0, 5));
    } catch {
      setRecentReactions([]);
    }
  }, []);

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

        // Clamp against the draggable button, not the open palette. The
        // palette can be wider/taller and must not make the launcher stick.
        const width = state.target.offsetWidth || 115;
        const height = state.target.offsetHeight || 38;
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

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      targetEl.removeEventListener('lostpointercapture', handlePointerUp);
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
    targetEl.addEventListener('lostpointercapture', handlePointerUp);
  };

  // Smart placement for emoji palette so it stays 100% visible on screen
  const isRightSide = !pos || pos.x > (typeof window !== 'undefined' ? window.innerWidth / 2 : 400);
  const isNearBottom = pos && pos.y > (typeof window !== 'undefined' ? window.innerHeight - 150 : 500);
  const characterEmoji = getAvatarById(avatarId || '')?.emoji || '✨';
  const groupEmojis = reactionGroup === 'Basic' && recentReactions.length
    ? [...recentReactions, ...REACTION_GROUPS.Basic]
    : reactionGroup === 'Character'
      ? (CHARACTER_REACTIONS[avatarId || ''] || REACTION_GROUPS.Character)
      : REACTION_GROUPS[reactionGroup];
  const visibleReactionEmojis = [characterEmoji, ...groupEmojis.filter((emoji) => emoji !== characterEmoji)].filter((emoji, index, list) => list.indexOf(emoji) === index);
  const handleReactionOptionsWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const options = event.currentTarget;
    const scrollDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (options.scrollWidth <= options.clientWidth || scrollDelta === 0) return;

    options.scrollLeft += scrollDelta;
  }, []);

  const renderPalette = (marginStyle: React.CSSProperties) => (
    <div className="reactions-palette" style={marginStyle}>
      <div className="reaction-palette-header">
        <div className="reaction-group-tabs" role="tablist" aria-label="Reaction categories">
          {(Object.keys(REACTION_GROUPS) as Array<keyof typeof REACTION_GROUPS>).map((group) => (
            <button
              key={group}
              type="button"
              className={`reaction-group-tab ${reactionGroup === group ? 'active' : ''}`}
              onClick={() => setReactionGroup(group)}
              role="tab"
              aria-selected={reactionGroup === group}
            >
              {group}
            </button>
          ))}
        </div>
        {userRole === 'HOST' || userRole === 'MODERATOR' ? (
          <button
            type="button"
            className={`reaction-create-poll ${showPollComposer ? 'active' : ''}`}
            onClick={() => setShowPollComposer((value) => !value)}
            aria-expanded={showPollComposer}
          >
            <Plus size={14} />
            <span>{showPollComposer ? 'Cancel poll' : 'Create poll'}</span>
          </button>
        ) : null}
      </div>
      {showPollComposer && (
        <div className="reaction-poll-composer">
          <div className="poll-composer-heading">
            <BarChart3 size={15} />
            <span>Start a room poll</span>
            <button
              type="button"
              className="poll-composer-close"
              onClick={() => setShowPollComposer(false)}
              aria-label="Close poll composer"
            >
              <X size={15} />
            </button>
          </div>
          <label className="poll-composer-field">
            <span>Question</span>
            <input
              value={pollQuestion}
              onChange={(event) => setPollQuestion(event.target.value)}
              placeholder="What should we watch next?"
              maxLength={200}
              aria-label="Poll question"
            />
          </label>
          <label className="poll-composer-field">
            <span>Options <small>Separate with commas</small></span>
            <input
              value={pollOptions}
              onChange={(event) => setPollOptions(event.target.value)}
              placeholder="Yes, No"
              aria-label="Poll options"
            />
          </label>
          <div className="poll-composer-actions">
            <span className="poll-option-hint">
              {pollOptions.split(',').filter((item) => item.trim()).length} options
            </span>
            <button
              type="button"
              className="poll-create-submit"
              onClick={createPoll}
              disabled={!pollQuestion.trim() || pollOptions.split(',').filter((item) => item.trim()).length < 2}
            >
              <Plus size={14} />
              <span>Create poll</span>
            </button>
          </div>
        </div>
      )}
      <div className="reaction-options" onWheel={handleReactionOptionsWheel}>
        {!alwaysExpanded && (
          <button type="button" className="reaction-close-btn" onClick={() => setIsOpen(false)} aria-label="Close reactions">×</button>
        )}
        {visibleReactionEmojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="reaction-btn"
            onClick={(e) => { e.stopPropagation(); sendReaction(emoji); }}
            title={`Send ${emoji}`}
          >
            {emoji}
            {recentCounts[emoji] ? <span className="reaction-count">{recentCounts[emoji]}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );

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
        className={`${inline ? 'inline-reactions-launcher' : 'floating-reactions-launcher'} ${isOpen || alwaysExpanded ? 'open' : ''} ${isDragging ? 'is-dragging' : ''}`}
        style={{
          ...(inline
            ? {}
            : {
                left: pos ? `${pos.x}px` : undefined,
                top: pos ? `${pos.y}px` : undefined,
                right: pos ? 'auto' : undefined,
                bottom: pos ? 'auto' : undefined,
              }),
          alignItems: inline ? 'stretch' : isRightSide ? 'flex-end' : 'flex-start',
        }}
      >
        {Object.keys(recentCounts).length > 0 && (
          <div className="reaction-live-counters" aria-live="polite">
            {Object.entries(recentCounts).map(([emoji, count]) => (
              <span key={emoji}>{emoji} {count}</span>
            ))}
          </div>
        )}
        {/* If placed near bottom of screen, show emoji palette ABOVE the button */}
        {(isOpen || alwaysExpanded) && !inline && isNearBottom && (
          renderPalette({ marginBottom: '0.4rem' })
        )}

        {/* Draggable React Pill Button */}
        {!alwaysExpanded && <button
          type="button"
          className="reaction-toggle-btn"
          ref={buttonRef}
          onPointerDown={inline ? undefined : handlePointerDown}
          onClick={() => {
            if (ignoreNextClickRef.current) {
              ignoreNextClickRef.current = false;
              return;
            }
            if (!isDraggingRef.current) {
              setIsOpen((open) => !open);
            }
          }}
          title={isOpen ? 'Close live reactions' : 'Send live reactions'}
          aria-label={isOpen ? 'Close Live Reactions' : 'Open Live Reactions'}
          aria-expanded={isOpen}
        >
          <span className="reaction-toggle-emoji">{characterEmoji}</span>
          <span className="reaction-toggle-label">React</span>
        </button>}

        {/* If placed in upper/middle of screen, show emoji palette BELOW the button */}
        {(isOpen || alwaysExpanded) && (inline || !isNearBottom) && (
          renderPalette({ marginTop: '0.4rem' })
        )}
      </div>
    </>
  );
};
