import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, Reply, X, BarChart3, Plus } from 'lucide-react';
import { ChatMessage, ChatReplyPreview, Role, RoomPoll } from '../types.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import { EmojiPicker } from './EmojiPicker.js';
import { getParticipantCharacterId } from '../utils/characterMemory.js';

interface ChatProps {
  messages: ChatMessage[];
  currentUserId: string;
  currentUserAvatarId?: string;
  viewerCount?: number;
  userRole?: Role;
  activePoll: RoomPoll | null;
  typingUsers?: string[];
  onTypingChange?: (isTyping: boolean) => void;
  onVotePoll: (optionIndex: number) => void;
  onCreatePoll?: (question: string, options: string[]) => void;
  onSendMessage: (text: string, replyTo?: ChatReplyPreview) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onSendReaction: (emoji: string) => void;
}

const MSG_EMOJIS = ['❤️', '🔥', '😂', '👍', '😮', '🎉'];

const QUICK_REACTION_EMOJIS = [
  '❤️', '🔥', '😂', '👏', '😮', '🎉',
  '🍿', '🎬', '🥳', '😍', '💯', '🚀',
  '🙌', '👀', '✨', '⚡', '😎', '🤩',
  '😭', '🤯', '💡', '💖', '⭐', '💀',
  '😱', '👍', '👎', '😴', '🫡', '🤝'
];

const ROLE_COLORS: Record<Role, string> = {
  HOST: '#FFD21F',
  MODERATOR: '#38bdf8',
  PARTICIPANT: '#a3a3a3',
};

const ROLE_LABELS: Record<Role, string> = {
  HOST: 'HOST',
  MODERATOR: 'MOD',
  PARTICIPANT: '',
};

export const Chat: React.FC<ChatProps> = ({
  messages,
  currentUserId,
  currentUserAvatarId,
  userRole,
  activePoll,
  typingUsers,
  onTypingChange,
  onVotePoll,
  onCreatePoll,
  onSendMessage,
  onToggleReaction,
  onSendReaction,
}) => {
  const [inputText, setInputText] = useState('');
  const [showReactionBar, setShowReactionBar] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatReplyPreview | null>(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const quickRxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = quickRxRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rowHeight = 29;
      const step = e.deltaY > 0 ? rowHeight : -rowHeight;
      el.scrollBy({
        top: step,
        behavior: 'smooth',
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handleAddOption = () => {
    if (pollOptions.length < 5) {
      setPollOptions((prev) => [...prev, '']);
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    setPollOptions((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const handleRemoveOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleLaunchPoll = (e: React.FormEvent) => {
    e.preventDefault();
    const validOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || validOptions.length < 2) return;
    if (onCreatePoll) {
      onCreatePoll(pollQuestion.trim(), validOptions);
    }
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowPollCreator(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activePoll?.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (onTypingChange) {
      if (val.trim().length > 0) {
        onTypingChange(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          onTypingChange(false);
        }, 2000);
      } else {
        onTypingChange(false);
      }
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    if (onTypingChange) onTypingChange(false);
    onSendMessage(inputText.trim(), replyingTo || undefined);
    setInputText('');
    setReplyingTo(null);
    inputRef.current?.focus();
  };

  const handleReplyClick = (msg: ChatMessage) => {
    setReplyingTo({
      messageId: msg.id,
      username: msg.username,
      text: msg.text,
      avatarId: msg.avatarId,
    });
    setActiveReactionMsgId(null);
    inputRef.current?.focus();
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Group consecutive messages from same user
  const groupedMessages = messages.reduce<{ msg: ChatMessage; isFirst: boolean }[]>((acc, msg, i) => {
    const prev = messages[i - 1];
    const isFirst = !prev || prev.userId !== msg.userId || (msg.timestamp - prev.timestamp) > 90_000 || Boolean(msg.replyTo);
    acc.push({ msg, isFirst });
    return acc;
  }, []);

  return (
    <div className="chat-panel-v2">
      {/* Top Action Toolbar: Quick Reactions & Create Poll CTA */}
      <div className="chat-action-toolbar">
        <div
          ref={quickRxRef}
          className="chat-quick-rx-row"
          title="Scroll mouse wheel to see more reactions"
        >
          {QUICK_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="chat-rx-mini-btn"
              onClick={() => onSendReaction(emoji)}
              title={`Send ${emoji} to room`}
            >
              {emoji}
            </button>
          ))}
        </div>

        {onCreatePoll && (
          <button
            type="button"
            className={`chat-poll-cta-btn ${showPollCreator ? 'active' : ''}`}
            onClick={() => setShowPollCreator((prev) => !prev)}
            title={showPollCreator ? 'Close poll creator' : 'Create room poll'}
            aria-expanded={showPollCreator}
          >
            <BarChart3 size={13} />
            <span>Poll</span>
          </button>
        )}
      </div>

      {/* Inline Poll Composer */}
      {showPollCreator && (
        <form onSubmit={handleLaunchPoll} className="chat-poll-composer-card">
          <div className="chat-poll-composer-header">
            <div className="composer-title">
              <BarChart3 size={15} color="var(--accent)" />
              <span>Create Room Poll</span>
            </div>
            <button
              type="button"
              className="composer-close-btn"
              onClick={() => setShowPollCreator(false)}
              aria-label="Close poll creator"
            >
              <X size={14} />
            </button>
          </div>

          <div className="composer-field">
            <label>Question</label>
            <input
              type="text"
              placeholder="e.g. Which movie should we watch next?"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </div>

          <div className="composer-field">
            <div className="composer-label-row">
              <label>Options ({pollOptions.length}/5)</label>
              {pollOptions.length < 5 && (
                <button
                  type="button"
                  className="composer-add-opt-link"
                  onClick={handleAddOption}
                >
                  <Plus size={12} /> Add option
                </button>
              )}
            </div>
            <div className="composer-options-list">
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="composer-option-row">
                  <input
                    type="text"
                    placeholder={`Option ${idx + 1}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    maxLength={100}
                    required
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      className="composer-remove-opt-btn"
                      onClick={() => handleRemoveOption(idx)}
                      title="Remove option"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary composer-submit-btn"
            disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
          >
            <BarChart3 size={14} />
            <span>Launch Live Poll</span>
          </button>
        </form>
      )}

      {/* Messages Area */}
      <div className="chat-messages-v2">
        {messages.length === 0 ? (
          <div className="chat-empty-v2">
            <div className="chat-empty-icon">💬</div>
            <p className="chat-empty-title">No messages yet</p>
            <p className="chat-empty-sub">Say hello to your watch party!</p>
          </div>
        ) : (
          groupedMessages.map(({ msg, isFirst }) => {
            const isMe = msg.userId === currentUserId;
            const roleColor = ROLE_COLORS[msg.role] || '#a3a3a3';
            const roleLabel = ROLE_LABELS[msg.role];
            const isReactionPickerOpen = activeReactionMsgId === msg.id;

            return (
              <div
                key={msg.id}
                className={`chat-row-v2 ${isMe ? 'chat-row-me' : ''} ${!isFirst ? 'chat-row-continued' : ''}`}
              >
                {/* Avatar — only on first message in a group, left side for others */}
                {!isMe && (
                  <div className="chat-avatar-col">
                    {isFirst ? (
                      <AnimeAvatarDisplay
                        username={msg.username}
                        avatarId={getParticipantCharacterId(msg.username, msg.userId, msg.avatarId)}
                        size={34}
                        showTooltip
                      />
                    ) : (
                      <div style={{ width: 34 }} />
                    )}
                  </div>
                )}

                <div className="chat-content-col">
                  {/* Name & role — only on first message */}
                  {isFirst && (
                    <div className={`chat-name-row ${isMe ? 'chat-name-row-me' : ''}`}>
                      {!isMe && (
                        <>
                          <span className="chat-username-v2" style={{ color: msg.userColor || roleColor }}>
                            {msg.username}
                          </span>
                          {roleLabel && (
                            <span
                              className="chat-role-pill"
                              style={{
                                background: `${roleColor}22`,
                                color: roleColor,
                                border: `1px solid ${roleColor}55`,
                              }}
                            >
                              {roleLabel}
                            </span>
                          )}
                        </>
                      )}
                      <span className="chat-time-v2">{formatTime(msg.timestamp)}</span>
                    </div>
                  )}

                  {/* Quoted reply preview inside the bubble wrapper */}
                  <div className="chat-bubble-wrapper">
                    {/* Hover Action Bar */}
                    <div className={`chat-action-bar ${isMe ? 'chat-action-bar-me' : 'chat-action-bar-other'}`}>
                      <button
                        type="button"
                        className="chat-action-btn"
                        onClick={() => setActiveReactionMsgId((id) => (id === msg.id ? null : msg.id))}
                        title="React to message"
                      >
                        <Smile size={13} />
                      </button>
                      <button
                        type="button"
                        className="chat-action-btn"
                        onClick={() => handleReplyClick(msg)}
                        title="Reply to message"
                      >
                        <Reply size={13} />
                      </button>
                    </div>

                    {/* Emoji Reaction Popover Menu */}
                    {isReactionPickerOpen && (
                      <div className="chat-msg-emoji-picker">
                        {MSG_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="chat-msg-emoji-item"
                            onClick={() => {
                              onToggleReaction?.(msg.id, emoji);
                              setActiveReactionMsgId(null);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={`chat-bubble-v2 ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}`}>
                      {/* Quoted Reply Header */}
                      {msg.replyTo && (
                        <div className="chat-reply-quote">
                          <div className="chat-reply-quote-bar" />
                          <div className="chat-reply-quote-content">
                            <span className="chat-reply-quote-username">
                              @{msg.replyTo.username}
                            </span>
                            <span className="chat-reply-quote-text">
                              {msg.replyTo.text}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Main Message Text */}
                      <div className="chat-bubble-text">{msg.text}</div>

                      {/* Message Reactions Badges */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="chat-msg-reactions">
                          {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                            if (!userIds || userIds.length === 0) return null;
                            const hasReacted = userIds.includes(currentUserId);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                className={`chat-msg-reaction-tag ${hasReacted ? 'active' : ''}`}
                                onClick={() => onToggleReaction?.(msg.id, emoji)}
                                title={`${userIds.length} reaction${userIds.length > 1 ? 's' : ''}`}
                              >
                                <span className="emoji">{emoji}</span>
                                <span className="count">{userIds.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* My avatar on the right */}
                {isMe && (
                  <div className="chat-avatar-col">
                    {isFirst ? (
                      <AnimeAvatarDisplay
                        username={msg.username}
                        avatarId={currentUserAvatarId || getParticipantCharacterId(msg.username, msg.userId, msg.avatarId)}
                        size={34}
                        showTooltip
                      />
                    ) : (
                      <div style={{ width: 34 }} />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        {activePoll && (
          <section className="chat-poll-card" aria-label="Room poll">
            <div className="chat-poll-heading">
              <div>
                <BarChart3 size={16} />
                <span>LIVE POLL</span>
              </div>
              <span className="chat-poll-total">
                {Object.values(activePoll.votes).reduce((total, voters) => total + voters.length, 0)} votes
              </span>
            </div>
            <h3>{activePoll.question}</h3>
            <div className="chat-poll-options">
              {activePoll.options.map((option, index) => {
                const voters = activePoll.votes[String(index)] || [];
                const voteCount = voters.length;
                const totalVotes = Object.values(activePoll.votes).reduce((total, list) => total + list.length, 0);
                const percentage = totalVotes ? Math.round((voteCount / totalVotes) * 100) : 0;
                const isSelected = voters.includes(currentUserId);

                return (
                  <button
                    key={`${activePoll.id}-${index}`}
                    type="button"
                    className={`chat-poll-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => onVotePoll(index)}
                    aria-pressed={isSelected}
                    aria-label={`${option}, ${percentage} percent, ${voteCount} votes${isSelected ? ', your vote' : ''}`}
                  >
                    <span className="chat-poll-option-fill" style={{ width: `${percentage}%` }} />
                    <span className="chat-poll-option-content">
                      <span>{option}</span>
                      <small>{percentage}% · {voteCount}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="chat-poll-hint">
              {Object.values(activePoll.votes).some((voters) => voters.includes(currentUserId))
                ? 'Your vote is recorded. Select another option to change it.'
                : 'Select an option to vote.'}
            </p>
          </section>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Full Android Emoji Picker Panel */}
      <EmojiPicker
        isOpen={showReactionBar}
        onClose={() => setShowReactionBar(false)}
        onSelectEmoji={(emoji) => {
          setInputText((prev) => prev + emoji);
          inputRef.current?.focus();
        }}
        onSendFloatingReaction={(emoji) => {
          onSendReaction(emoji);
        }}
      />

      {/* Replying Banner Bar above Input */}
      {replyingTo && (
        <div className="chat-reply-banner">
          <div className="chat-reply-banner-left">
            <Reply size={14} className="chat-reply-banner-icon" />
            <div className="chat-reply-banner-details">
              <span className="chat-reply-banner-target">Replying to <strong>@{replyingTo.username}</strong></span>
              <span className="chat-reply-banner-snippet">{replyingTo.text}</span>
            </div>
          </div>
          <button
            type="button"
            className="chat-reply-banner-close"
            onClick={() => setReplyingTo(null)}
            title="Cancel reply"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Typing Indicator */}
      {typingUsers && typingUsers.length > 0 && (
        <div style={{ padding: '0.2rem 0.8rem', fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#38bdf8', animation: 'pulse 1.5s infinite' }} />
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is typing...' : 'are typing...'}
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSend} className="chat-input-bar">
        <div className="chat-input-capsule">
          <input
            ref={inputRef}
            type="text"
            className="chat-input-v2"
            placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : "Type a message..."}
            value={inputText}
            onChange={handleInputChange}
            maxLength={500}
            autoComplete="off"
          />

          {inputText.trim() ? (
            <button
              type="submit"
              className="chat-send-v2 active"
              title="Send Message"
            >
              <Send size={16} />
            </button>
          ) : (
            <div className="chat-inline-reactions">
              <button
                type="button"
                className="chat-inline-emoji-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSendReaction('❤️')}
                title="Send ❤️"
                aria-label="Send love reaction"
              >
                ❤️
              </button>
              <button
                type="button"
                className="chat-inline-emoji-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSendReaction('😂')}
                title="Send 😂"
                aria-label="Send laughing reaction"
              >
                😂
              </button>
              <button
                type="button"
                className="chat-inline-emoji-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSendReaction('😢')}
                title="Send 😢"
                aria-label="Send crying reaction"
              >
                😢
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
