import { io, Socket } from 'socket.io-client';
import { Role } from '../types.js';

const getSocketUrl = (): string => {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    // In Vite dev, connect same-origin — the dev server proxies /socket.io (ws) to the backend.
    if (isLocalhost || import.meta.env.DEV) {
      return window.location.origin;
    }
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    return 'https://youtube-watch-party-api-buaf.onrender.com';
  }
  return envUrl || 'https://youtube-watch-party-api-buaf.onrender.com';
};


export const socket: Socket = io(getSocketUrl(), {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export const emitJoinRoom = (roomId: string, username: string, userId: string, avatarId?: string, identityToken?: string) => {
  socket.emit('join_room', { roomId, username, userId, avatarId, identityToken });
};

export const emitLeaveRoom = (roomId: string) => {
  socket.emit('leave_room', { roomId });
};

export const emitPlay = (time?: number) => {
  socket.emit('play', time !== undefined ? { time } : {});
};

export const emitPause = (time?: number) => {
  socket.emit('pause', time !== undefined ? { time } : {});
};

export const emitSeek = (time: number) => {
  socket.emit('seek', { time });
};

export const emitChangeVideo = (videoId: string, play = false) => {
  socket.emit('change_video', { videoId, play });
};

export const emitAssignRole = (userId: string, role: Role) => {
  socket.emit('assign_role', { userId, role });
};

export const emitRemoveParticipant = (userId: string) => {
  socket.emit('remove_participant', { userId });
};

export const emitHostSyncPulse = (time: number) => {
  socket.emit('host_sync_pulse', { time });
};

export const emitPlaylistAdd = (
  videoId: string,
  title?: string,
  duration?: string,
  channel?: string,
  thumbnail?: string
) => {
  socket.emit('playlist_add', { videoId, title, duration, channel, thumbnail });
};

export const emitPlaylistVote = (itemId: string) => {
  socket.emit('playlist_vote', { itemId });
};

export const emitPlaylistShuffle = () => {
  socket.emit('playlist_shuffle', {});
};

export const emitPlaylistClear = () => {
  socket.emit('playlist_clear', {});
};

export const emitPlaylistRemove = (itemId: string) => {
  socket.emit('playlist_remove', { itemId });
};

export const emitPlaylistReorder = (fromIndex: number, toIndex: number) => {
  socket.emit('playlist_reorder', { fromIndex, toIndex });
};

export const emitPlaylistMoveTop = (itemId: string) => {
  socket.emit('playlist_move_top', { itemId });
};

export const emitRequestAction = (
  type: 'play' | 'pause' | 'seek' | 'change_video' | 'request_next_video',
  data?: { time?: number; videoId?: string; title?: string; duration?: string; channel?: string }
) => {
  socket.emit('request_action', { type, data });
};

export const emitRespondActionRequest = (requestId: string, approved: boolean, mode?: 'now' | 'next') => {
  socket.emit('respond_action_request', { requestId, approved, mode });
};

export const emitSendChat = (text: string, userColor?: string, avatarId?: string, replyTo?: any) => {
  socket.emit('chat_message', { text, userColor, avatarId, replyTo });
};

export const emitToggleMessageReaction = (messageId: string, emoji: string) => {
  socket.emit('toggle_message_reaction', { messageId, emoji });
};

export const emitExtensionStatus = (
  installed: boolean,
  version?: string,
  activeTabUrl?: string,
  platform?: string
) => {
  if (!socket) return;
  socket.emit('extension:status', {
    installed,
    version,
    activeTabUrl,
    platform,
  });
};

export const emitSendReaction = (emoji: string) => {
  socket.emit('send_reaction', { emoji });
};

export const emitUpdateAvatar = (avatarId: string) => {
  socket.emit('update_avatar', { avatarId });
};


// NTP-style clock & latency tracker
let estimatedOneWayLatencyMs = 25; // fallback 25ms
let serverClockOffsetMs = 0;

export const getNetworkLatency = () => ({
  oneWayLatencyMs: estimatedOneWayLatencyMs,
  serverClockOffsetMs,
});

export const startTimeSync = () => {
  const ping = () => {
    if (socket.connected) {
      socket.emit('time_sync_ping', { clientTime: Date.now() });
    }
  };

  const onPong = (data: { clientTime: number; serverTime: number }) => {
    const now = Date.now();
    const rtt = Math.max(2, now - data.clientTime);
    const oneWay = rtt / 2;
    const offset = (data.serverTime + oneWay) - now;

    // Smooth exponential moving average to filter out network spikes
    estimatedOneWayLatencyMs = Math.round(estimatedOneWayLatencyMs * 0.65 + oneWay * 0.35);
    serverClockOffsetMs = Math.round(serverClockOffsetMs * 0.65 + offset * 0.35);
  };

  socket.on('time_sync_pong', onPong);

  // Ping every 2 seconds for continuous precision calibration
  const interval = setInterval(ping, 2000);
  if (socket.connected) ping();

  return () => {
    clearInterval(interval);
    socket.off('time_sync_pong', onPong);
  };
};

// ── V2 Socket Emitters ──────────────────────────────────────
export const emitPartyReady = (
  status: 'ready' | 'loading' | 'buffering' | 'desynced' | 'not_connected',
  reportedPosition?: number,
  activePlatform?: string,
  activeMediaId?: string
) => {
  socket.emit('party:ready', {
    status,
    reportedPosition,
    activePlatform,
    activeMediaId,
  });
};

export const emitSyncPlay = (position?: number, eventId?: string, revision?: number) => {
  socket.emit('sync:play', { position, eventId, revision });
};

export const emitSyncPause = (position?: number, eventId?: string, revision?: number) => {
  socket.emit('sync:pause', { position, eventId, revision });
};

export const emitSyncSeek = (position: number, eventId?: string, revision?: number) => {
  socket.emit('sync:seek', { position, eventId, revision });
};

export const emitSyncDriftCheck = (clientPosition: number) => {
  socket.emit('sync:drift_check', {
    clientPosition,
    clientTimestamp: Date.now(),
  });
};

export const emitMediaChanged = (
  platform: string,
  mediaId: string,
  title?: string,
  url?: string,
  duration?: number
) => {
  socket.emit('media:changed', {
    platform,
    mediaId,
    title,
    url,
    duration,
  });
};

export const emitChatTyping = (isTyping: boolean) => {
  socket.emit('chat:typing', { isTyping });
};

// ── Room Browser Streaming Emitters ─────────────────────────
export const emitBrowserSetGuestControl = (guestControl: boolean) => {
  socket.emit('room:browser_set_guest_control', { guestControl });
};

export const emitStopCastBrowser = (
  sessionId: string,
  sessionToken: string,
  roomId: string,
  callback?: (res: { success: boolean }) => void
) => {
  socket.emit('browser:stop_cast', { sessionId, sessionToken, roomId }, callback);
};

export const emitStartTabStream = (
  title?: string,
  callback?: (res: { success: boolean; title?: string; error?: string }) => void
) => {
  socket.emit('room:start_tab_stream', { title }, callback);
};

export const emitStopTabStream = () => {
  socket.emit('room:stop_tab_stream', {});
};

export const emitToggleRoomLike = () => {
  socket.emit('room:like_toggle');
};

export const emitSetRoomCategory = (category: string) => {
  socket.emit('room:set_category', { category });
};

export const emitGoLive = () => {
  socket.emit('room:go_live');
};


