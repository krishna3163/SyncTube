import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile } from 'lucide-react';
import { ChatMessage, Role } from '../types.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';

interface ChatProps {
  messages: ChatMessage[];
  currentUserId: string;
  currentUserAvatarId?: string;
  viewerCount?: number;
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
}

const QUICK_REACTIONS = ['❤️', '🔥', '😂', '👏', '🎉', '🚀', '😍', '💯'];

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
  onSendMessage,
  onSendReaction,
}) => {
  const [inputText, setInputText] = useState('');
  const [showReactionBar, setShowReactionBar] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
    inputRef.current?.focus();
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Group consecutive messages from same user
  const groupedMessages = messages.reduce<{ msg: ChatMessage; isFirst: boolean }[]>((acc, msg, i) => {
    const prev = messages[i - 1];
    const isFirst = !prev || prev.userId !== msg.userId || (msg.timestamp - prev.timestamp) > 90_000;
    acc.push({ msg, isFirst });
    return acc;
  }, []);

  return (
    <div className="chat-panel-v2">
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
                        avatarId={msg.avatarId}
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

                  {/* Message bubble */}
                  <div className={`chat-bubble-v2 ${isMe ? 'chat-bubble-me' : 'chat-bubble-other'}`}>
                    {msg.text}
                  </div>
                </div>

                {/* My avatar on the right */}
                {isMe && (
                  <div className="chat-avatar-col">
                    {isFirst ? (
                      <AnimeAvatarDisplay
                        username={msg.username}
                        avatarId={msg.avatarId || currentUserAvatarId}
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
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reaction Panel */}
      {showReactionBar && (
        <div className="chat-reaction-panel">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="chat-react-btn"
              onClick={() => {
                onSendReaction(emoji);
                setShowReactionBar(false);
              }}
              title={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSend} className="chat-input-bar">
        <button
          type="button"
          className="chat-emoji-toggle"
          onClick={() => setShowReactionBar((v) => !v)}
          title="Quick reactions"
        >
          <Smile size={18} />
        </button>

        <input
          ref={inputRef}
          type="text"
          className="chat-input-v2"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          maxLength={500}
          autoComplete="off"
        />

        <button
          type="submit"
          className={`chat-send-v2 ${inputText.trim() ? 'active' : ''}`}
          disabled={!inputText.trim()}
          title="Send Message"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
