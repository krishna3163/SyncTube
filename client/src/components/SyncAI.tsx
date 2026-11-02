import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Key,
  Trash2,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Music,
  FastForward,
  Play,
  Pause,
  MessageSquare,
  Shield,
  Crown,
  User,
  Zap,
} from 'lucide-react';
import {
  Role,
  PlayState,
  PlaylistItem,
  ChatMessage,
  ParticipantPublic,
  RoomPoll,
  ActivityItem,
  RoomSettingsData,
} from '../types.js';
import { AnimeAvatarDisplay } from './AnimeAvatar.js';
import {
  getStoredGeminiApiKey,
  saveGeminiApiKey,
  clearGeminiApiKey,
  sendPromptToGemini,
  RoomContextSnapshot,
} from '../services/geminiService.js';
import { formatTime } from '../utils/youtube.js';

export interface SyncAIProps {
  roomId: string;
  roomName?: string;
  roomSettings: RoomSettingsData;

  currentUserId: string;
  currentUsername: string;
  currentUserRole: Role;
  currentUserAvatarId?: string;

  participants: ParticipantPublic[];
  currentVideoId?: string;
  currentVideoTitle?: string;
  currentVideoDuration?: number;
  currentPlaybackTime: number;
  playState: PlayState;
  playbackSpeed: number;
  volume: number;
  isMuted: boolean;

  playlist: PlaylistItem[];
  watchHistory?: { videoId: string; title: string; timestamp: number }[];
  chatMessages: ChatMessage[];
  activePoll: RoomPoll | null;
  recentActivities: ActivityItem[];

  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onSetPlaybackSpeed: (speed: number) => void;
  onSetVolume: (volume: number) => void;
  onToggleMute: () => void;
  onPlayVideo: (videoId: string, title?: string) => void;
  onNextVideo: () => void;
  onAddToPlaylist: (
    videoId: string,
    title?: string,
    duration?: string,
    channel?: string,
    thumbnail?: string
  ) => void;
  onMoveToTop?: (itemId: string) => void;
  onShufflePlaylist: () => void;
  onClearPlaylist: () => void;
  onSendMessage: (text: string) => void;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
}

interface MessageItem {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
  actions?: {
    action: string;
    description: string;
    success: boolean;
  }[];
}

const DEFAULT_SUGGESTIONS = [
  { label: '📝 Summarise chat', prompt: 'Summarise the room chat conversation so far in 3-4 bullet points.' },
  { label: '🎬 Play Hanumankind Squid Game track', prompt: 'Play the song that Hanumankind released or did for Squid Game.' },
  { label: '🎶 Add Hindi party song next', prompt: 'Add an upbeat Hindi party song to the playlist to play next.' },
  { label: '⚡ Set speed 1.25x', prompt: 'Set playback speed to 1.25x.' },
  { label: '⏩ Skip 30s forward', prompt: 'Fast forward 30 seconds.' },
  { label: '🔍 Explain current topic', prompt: 'What is this video about and what should we pay attention to?' },
];

export const SyncAI: React.FC<SyncAIProps> = ({
  roomId,
  roomName,
  roomSettings,
  currentUserId,
  currentUsername,
  currentUserRole,
  currentUserAvatarId,
  participants,
  currentVideoId,
  currentVideoTitle,
  currentVideoDuration,
  currentPlaybackTime,
  playState,
  playbackSpeed,
  volume,
  isMuted,
  playlist,
  watchHistory,
  chatMessages,
  activePoll,
  recentActivities,
  onPlay,
  onPause,
  onSeek,
  onSetPlaybackSpeed,
  onSetVolume,
  onToggleMute,
  onPlayVideo,
  onNextVideo,
  onAddToPlaylist,
  onMoveToTop,
  onShufflePlaylist,
  onClearPlaylist,
  onSendMessage,
  onNotify,
  initialPrompt,
  onClearInitialPrompt,
}) => {
  const [apiKey, setApiKey] = useState<string>(() => getStoredGeminiApiKey());
  const [keyInput, setKeyInput] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isEditingKey, setIsEditingKey] = useState<boolean>(!apiKey);
  const [apiError, setApiError] = useState<string | null>(null);

  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const storageKey = `synctube_ai_chat_${roomId}`;
  const [messages, setMessages] = useState<MessageItem[]>(() => {
    try {
      const stored = localStorage.getItem(`synctube_ai_chat_${roomId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse stored SyncAI chat messages', e);
    }
    return [
      {
        id: 'welcome',
        sender: 'ai',
        text: `Hello ${currentUsername}! ✨ I'm SyncAI, your intelligent room companion powered by Google AI Studio (Gemini).

I have full real-time awareness of:
• 📺 Current playback state & timing
• 📋 Room playlist & upcoming queue
• 💬 Live chat history & discussions
• 👥 Viewers & room permissions (${currentUserRole})

You can ask me to play any song (e.g. Hanumankind tracks, Bollywood, Lo-Fi), summarize the chat, adjust video speed, seek forward/back, or add songs to play next!`,
        timestamp: Date.now(),
      },
    ];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Persist messages whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (e) {
      console.warn('Failed to persist SyncAI chat to localStorage', e);
    }
  }, [messages, storageKey]);

  const handleSaveKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setApiError('Please enter a valid Google AI Studio API key.');
      return;
    }
    saveGeminiApiKey(trimmed);
    setApiKey(trimmed);
    setIsEditingKey(false);
    setApiError(null);
    onNotify('Google AI Studio API key saved successfully!', 'success');
  };

  const handleClearKey = () => {
    clearGeminiApiKey();
    setApiKey('');
    setKeyInput('');
    setIsEditingKey(true);
    setApiError(null);
    onNotify('API key cleared.', 'info');
  };

  const handleClearChat = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setMessages([
      {
        id: 'reset',
        sender: 'ai',
        text: `Chat cleared! How can I help with the room now?`,
        timestamp: Date.now(),
      },
    ]);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputPrompt).trim();
    if (!text || isLoading) return;

    if (!apiKey) {
      setIsEditingKey(true);
      setApiError('Please enter your Google AI Studio API key to chat with SyncAI.');
      return;
    }

    const userMsg: MessageItem = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);
    setApiError(null);

    // Build complete real-time room snapshot
    const contextSnapshot: RoomContextSnapshot = {
      roomId,
      roomName,
      roomSettings,
      currentUser: {
        userId: currentUserId,
        username: currentUsername,
        role: currentUserRole,
      },
      participants,
      currentMedia: {
        videoId: currentVideoId,
        title: currentVideoTitle,
        duration: currentVideoDuration,
        currentTime: currentPlaybackTime,
        playState,
        playbackSpeed,
        volume,
        isMuted,
      },
      playlist,
      watchHistory,
      chatMessages,
      activePoll,
      recentActivities,
    };

    // Format chat history for Gemini
    const chatHistory = messages
      .filter((m) => m.id !== 'welcome' && m.id !== 'reset')
      .slice(-6)
      .map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
        text: m.text,
      }));

    try {
      const result = await sendPromptToGemini(
        apiKey,
        text,
        chatHistory,
        contextSnapshot,
        {
          onPlay,
          onPause,
          onSeek,
          onSetPlaybackSpeed,
          onSetVolume,
          onToggleMute,
          onPlayVideo,
          onNextVideo,
          onAddToPlaylist,
          onMoveToTop,
          onShufflePlaylist,
          onClearPlaylist,
          onSendMessage,
          onNotify,
        }
      );

      const aiMsg: MessageItem = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: result.text,
        timestamp: Date.now(),
        actions: result.executedActions,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg = err.message || 'Error communicating with Google AI Studio.';
      setApiError(errorMsg);

      const errorReply: MessageItem = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: `⚠️ **Google AI Studio Error:** ${errorMsg}\n\nPlease verify your API key or re-enter a new key using the button above.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Automatically execute or populate initial prompt when passed from other views (like Study Suite)
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      const promptToRun = initialPrompt.trim();
      onClearInitialPrompt?.();
      if (!apiKey) {
        setInputPrompt(promptToRun);
        setIsEditingKey(true);
        setApiError('Please enter your Google AI Studio API key to chat with SyncAI.');
      } else {
        handleSendMessage(promptToRun);
      }
    }
  }, [initialPrompt, apiKey]);

  return (
    <div className="sync-ai-container">
      {/* AI Panel Header */}
      <div className="sync-ai-header">
        <div className="sync-ai-brand">
          <div className="sync-ai-icon-pulse">
            <Sparkles size={16} color="#ffd21f" />
          </div>
          <div className="sync-ai-title-wrap">
            <div className="sync-ai-title-row">
              <span className="sync-ai-title">SyncAI</span>
              <span className="sync-ai-badge">Gemini 2.5</span>
            </div>
            <span className="sync-ai-status-text">
              {apiKey ? (
                <span className="status-online">● Ready ({apiKey.slice(0, 4)}...{apiKey.slice(-4)})</span>
              ) : (
                <span className="status-offline">● API Key Needed</span>
              )}
            </span>
          </div>
        </div>

        <div className="sync-ai-actions">
          <button
            type="button"
            className="sync-ai-btn-ghost"
            onClick={() => {
              setKeyInput(apiKey);
              setIsEditingKey(!isEditingKey);
            }}
            title={apiKey ? 'Change Google AI Studio API Key' : 'Enter API Key'}
          >
            <Key size={14} />
          </button>
          <button
            type="button"
            className="sync-ai-btn-ghost"
            onClick={handleClearChat}
            title="Clear AI Conversation"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* API Key Modal / Setup Card */}
      {isEditingKey && (
        <div className="sync-ai-key-card">
          <div className="sync-ai-key-header">
            <div className="sync-ai-key-icon">
              <Sparkles size={16} />
            </div>
            <div>
              <h4>Connect Google AI Studio</h4>
              <p>Enter your Gemini API key to activate voice/chat actions & full room awareness.</p>
            </div>
          </div>

          <div className="sync-ai-key-link-row">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="sync-ai-link"
            >
              <span>Get a free API key at Google AI Studio</span>
              <ExternalLink size={12} />
            </a>
          </div>

          <div className="sync-ai-key-input-wrap">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder="Paste your AI Studio API key (AIzaSy...)"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveKey();
              }}
              className="sync-ai-key-input"
            />
            <button
              type="button"
              className="sync-ai-key-toggle-eye"
              onClick={() => setShowKey(!showKey)}
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {apiError && (
            <div className="sync-ai-key-error">
              <AlertCircle size={14} />
              <span>{apiError}</span>
            </div>
          )}

          <div className="sync-ai-key-btn-row">
            <button
              type="button"
              className="sync-ai-btn-save"
              onClick={handleSaveKey}
            >
              Save & Connect
            </button>
            {apiKey && (
              <button
                type="button"
                className="sync-ai-btn-cancel"
                onClick={() => setIsEditingKey(false)}
              >
                Cancel
              </button>
            )}
            {apiKey && (
              <button
                type="button"
                className="sync-ai-btn-delete"
                onClick={handleClearKey}
                title="Remove API Key"
              >
                Clear Key
              </button>
            )}
          </div>
        </div>
      )}

      {/* Global API Error Alert Banner with Re-enter Prompt */}
      {apiError && !isEditingKey && (
        <div className="sync-ai-error-banner">
          <div className="error-banner-text">
            <AlertCircle size={14} />
            <span>{apiError}</span>
          </div>
          <button
            type="button"
            className="error-banner-btn"
            onClick={() => {
              setKeyInput(apiKey);
              setIsEditingKey(true);
            }}
          >
            Update API Key
          </button>
        </div>
      )}

      {/* Real-time Room Snapshot Bar */}
      <div className="sync-ai-room-context-bar">
        <div className="context-item" title={currentVideoTitle || 'No active video'}>
          <Music size={12} />
          <span className="context-text">
            {currentVideoTitle ? currentVideoTitle.slice(0, 22) + (currentVideoTitle.length > 22 ? '…' : '') : 'No video'}
          </span>
        </div>
        <div className="context-item">
          <FastForward size={12} />
          <span>{formatTime(currentPlaybackTime)} / {formatTime(currentVideoDuration || 0)} ({playbackSpeed}x)</span>
        </div>
        <div className="context-item role-badge">
          {currentUserRole === 'HOST' ? <Crown size={12} color="#ffd21f" /> : currentUserRole === 'MODERATOR' ? <Shield size={12} color="#60a5fa" /> : <User size={12} />}
          <span>{currentUserRole}</span>
        </div>
      </div>

      {/* Quick Suggestion Chips */}
      <div className="sync-ai-chips-scroll">
        {DEFAULT_SUGGESTIONS.map((s, idx) => (
          <button
            key={idx}
            type="button"
            className="sync-ai-chip"
            onClick={() => handleSendMessage(s.prompt)}
            disabled={isLoading}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Chat Messages Feed */}
      <div className="sync-ai-feed">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div key={msg.id} className={`sync-ai-message-row ${isUser ? 'user-row' : 'ai-row'}`}>
              {!isUser && (
                <div className="sync-ai-avatar">
                  <Sparkles size={14} color="#ffd21f" />
                </div>
              )}

              <div className={`sync-ai-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`}>
                <div className="sync-ai-bubble-header">
                  <span className="bubble-sender">{isUser ? currentUsername : 'SyncAI'}</span>
                  <span className="bubble-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="sync-ai-bubble-content">
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>

                {/* Render Executed Actions */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="sync-ai-actions-executed">
                    {msg.actions.map((act, i) => (
                      <div
                        key={i}
                        className={`action-pill ${act.success ? 'action-success' : 'action-failed'}`}
                      >
                        {act.success ? (
                          <CheckCircle2 size={13} color="#34d399" />
                        ) : (
                          <AlertCircle size={13} color="#f87171" />
                        )}
                        <span>{act.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isUser && (
                <div className="sync-ai-user-avatar">
                  <AnimeAvatarDisplay
                    username={currentUsername}
                    avatarId={currentUserAvatarId}
                    size={28}
                  />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="sync-ai-message-row ai-row">
            <div className="sync-ai-avatar">
              <Sparkles size={14} color="#ffd21f" />
            </div>
            <div className="sync-ai-bubble ai-bubble loading-bubble">
              <Loader2 size={16} className="sync-ai-spin" />
              <span>SyncAI is analyzing room & executing actions...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form
        className="sync-ai-input-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder={
            apiKey
              ? 'Ask SyncAI to play songs, summarize chat, adjust speed...'
              : 'Add API key above to start chatting...'
          }
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          disabled={isLoading}
          className="sync-ai-input"
        />
        <button
          type="submit"
          disabled={!inputPrompt.trim() || isLoading}
          className="sync-ai-send-btn"
          title="Send message to SyncAI"
        >
          {isLoading ? <Loader2 size={15} className="sync-ai-spin" /> : <Send size={15} />}
        </button>
      </form>
    </div>
  );
};

