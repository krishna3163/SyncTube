import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  socket,
  emitJoinRoom,
  emitLeaveRoom,
  emitPlay,
  emitPause,
  emitSeek,
  emitChangeVideo,
  emitAssignRole,
  emitRemoveParticipant,
  emitHostSyncPulse,
  emitPlaylistAdd,
  emitPlaylistRemove,
  emitPlaylistReorder,
  emitPlaylistMoveTop,
  emitPlaylistVote,
  emitPlaylistShuffle,
  emitPlaylistClear,
  emitRequestAction,
  emitRespondActionRequest,
  emitSendChat,
  emitToggleMessageReaction,
  emitSendReaction,
  emitUpdateAvatar,
  startTimeSync,
} from '../services/socket.js';
import {
  Role,
  ParticipantPublic,
  SyncStatePayload,
  UserJoinedPayload,
  UserLeftPayload,
  RoleAssignedPayload,
  ParticipantRemovedPayload,
  ErrorPayload,
  ActivityItem,
  ConnectionStatus,
  PlaylistItem,
  UserSettings,
  RoomSettingsData,
  PendingActionRequest,
  ActionRequestResolvedPayload,
  ActionRequestType,
  ChatMessage,
  ChatReplyPreview,
  EmojiReaction,
  RoomPoll,
} from '../types.js';
import { YouTubePlayer, YouTubePlayerHandle } from '../components/YouTubePlayer.js';
import { PlaybackControls } from '../components/PlaybackControls.js';
import { ParticipantList } from '../components/ParticipantList.js';
import { Playlist } from '../components/Playlist.js';
import { ActivityFeed } from '../components/ActivityFeed.js';
import { RoomHeader } from '../components/RoomHeader.js';
import { SettingsModal } from '../components/SettingsModal.js';
import { Chat } from '../components/Chat.js';
import { ActionRequestsPanel } from '../components/ActionRequestsPanel.js';
import { ReactionOverlay } from '../components/ReactionOverlay.js';
import { FloatingReactions } from '../components/FloatingReactions.js';
import { YouTubeSearchModal } from '../components/YouTubeSearchModal.js';
import { InviteModal } from '../components/InviteModal.js';
import { getRoomIdentityToken, saveRoomIdentityToken } from '../utils/identity.js';
import { saveStoredParty } from '../utils/partyStorage.js';
import { rememberParticipantCharacter, subscribeCharacterUpdates, getParticipantCharacterId } from '../utils/characterMemory.js';
import { LucideIcon, Users, ListMusic, Activity, MessageSquare, Bell, Check, X } from 'lucide-react';

interface RoomPageProps {
  roomId: string;
  username: string;
  userId: string;
  onLeaveRoom: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type TabId = 'participants' | 'playlist' | 'chat' | 'requests' | 'activity';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'participants', label: 'Viewers', icon: Users },
  { id: 'playlist', label: 'Playlist', icon: ListMusic },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'requests', label: 'Requests', icon: Bell },
  { id: 'activity', label: 'Activity', icon: Activity },
];


export const RoomPage: React.FC<RoomPageProps> = ({
  roomId,
  username,
  userId,
  onLeaveRoom,
  onNotify,
}) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [videoId, setVideoId] = useState<string>('');
  const [syncState, setSyncState] = useState<SyncStatePayload | null>(null);
  const [userRole, setUserRole] = useState<Role>('PARTICIPANT');
  const [participants, setParticipants] = useState<ParticipantPublic[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const currentTimeRef = useRef<number>(0);

  // Active Sidebar Tab: 'participants' | 'playlist' | 'chat' | 'requests' | 'activity'
  const [activeSidebarTab, setActiveSidebarTab] = useState<TabId>('participants');
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view when changed
  useEffect(() => {
    const activeBtn = tabBarRef.current?.querySelector('.sidebar-tab-btn.active');
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeSidebarTab]);

  const handleTabBarWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const tabBar = event.currentTarget;
    const scrollDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (tabBar.scrollWidth <= tabBar.clientWidth || scrollDelta === 0) return;

    tabBar.scrollLeft += scrollDelta;
  }, []);

  // Real-time Chat, Reactions, and Action Requests
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activePoll, setActivePoll] = useState<RoomPoll | null>(null);
  const activePollIdRef = useRef<string | null>(null);
  const [activeReactions, setActiveReactions] = useState<EmojiReaction[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingActionRequest[]>([]);

  // Ambient Mode (YouTube-Style Dynamic Video Glow)
  const [ambientMode, setAmbientMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('synctube_ambient_mode');
    return saved !== null ? saved === 'true' : false;
  });
  const [ambientBlur, setAmbientBlur] = useState(() => {
    const saved = localStorage.getItem('synctube_ambient_blur');
    const value = saved === null ? 30 : Number(saved);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 30;
  });
  const [ambientSpread, setAmbientSpread] = useState(() => {
    const saved = localStorage.getItem('synctube_ambient_spread');
    const value = saved === null ? 100 : Number(saved);
    return Number.isFinite(value) && value >= 50 && value <= 150 ? value : 100;
  });
  const [ambientPalette, setAmbientPalette] = useState({
    primary: '#5b4bb7',
    secondary: '#1b5c72',
    tertiary: '#285b53',
  });

  const handleAmbientImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 24;
      canvas.height = 14;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const sampleRegion = (startX: number, endX: number, startY: number, endY: number) => {
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;
        for (let y = startY; y < endY; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            const index = (y * canvas.width + x) * 4;
            red += pixels[index];
            green += pixels[index + 1];
            blue += pixels[index + 2];
            count += 1;
          }
        }
        if (!count) return null;
        return `rgb(${Math.round(red / count)}, ${Math.round(green / count)}, ${Math.round(blue / count)})`;
      };
      const primary = sampleRegion(0, 8, 2, 12);
      const secondary = sampleRegion(16, 24, 2, 12);
      const tertiary = sampleRegion(7, 17, 8, 14);
      if (!primary || !secondary || !tertiary) return;
      setAmbientPalette({ primary, secondary, tertiary });
    } catch {
      // YouTube may disallow canvas sampling; the image backdrop remains the fallback.
    }
  }, []);

  const handleAmbientBlurChange = useCallback((value: number) => {
    setAmbientBlur(value);
    localStorage.setItem('synctube_ambient_blur', String(value));
  }, []);

  const handleAmbientSpreadChange = useCallback((value: number) => {
    setAmbientSpread(value);
    localStorage.setItem('synctube_ambient_spread', String(value));
  }, []);

  const handleToggleAmbientMode = useCallback(() => {
    setAmbientMode((prev) => {
      const next = !prev;
      localStorage.setItem('synctube_ambient_mode', String(next));
      onNotifyRef.current(next ? 'Ambient mode enabled' : 'Ambient mode disabled', 'success');
      return next;
    });
  }, []);

  // Overlay Controls 5s Auto-Hide
  const [isControlsVisible, setIsControlsVisible] = useState<boolean>(true);
  const controlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fullscreen support
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // New Features: Theater Mode, Invite Modal, YouTube Search Modal
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState<boolean>(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);

  const handleToggleTheaterMode = useCallback(() => {
    setIsTheaterMode((prev) => {
      const next = !prev;
      onNotifyRef.current(next ? 'Cinema Mode enabled: Lights Dimmed' : 'Cinema Mode: Lights On', 'info');
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTheaterMode) {
        setIsTheaterMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTheaterMode]);

  // User Settings state
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('synctube_user_settings');
    let parsed: any = null;
    if (saved) {
      try {
        parsed = JSON.parse(saved);
      } catch {}
    }
    const initialAvatar =
      parsed?.avatarId ||
      localStorage.getItem('synctube_avatar_id') ||
      getParticipantCharacterId(username) ||
      'luffy';

    return {
      name: parsed?.name || username || 'BrightStinkbug',
      color: parsed?.color || '#2f618f',
      rememberMe: parsed?.rememberMe ?? true,
      avatarId: initialAvatar,
    };
  });

  // Room Settings state
  const [roomSettings, setRoomSettings] = useState<RoomSettingsData>({
    name: `Room #${roomId}`,
    theme: 'midnight',
    accentColor: '#ffd21f',
    permissions: {
      add: { viewer: true, moderator: true, owner: true },
      remove: { viewer: false, moderator: true, owner: true },
      move: { viewer: false, moderator: true, owner: true },
      playPause: { viewer: false, moderator: true, owner: true },
      seek: { viewer: false, moderator: true, owner: true },
      skip: { viewer: false, moderator: true, owner: true },
      chatSend: { viewer: true, moderator: true, owner: true },
      chatDelete: { viewer: false, moderator: true, owner: true },
      ban: { viewer: false, moderator: false, owner: true },
    },
    autoRemovePlayed: false,
    shuffle: false,
    allowLinks: true,
    allowEmbeddedLinks: true,
  });

  // Playlist starts empty — server is the source of truth
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);

  // Re-render when any participant character updates
  const [, setCharacterVersion] = useState(0);
  useEffect(() => {
    return subscribeCharacterUpdates(() => setCharacterVersion((v) => v + 1));
  }, []);

  const addActivity = useCallback(
    (
      text: string,
      type: ActivityItem['type'],
      meta?: { username?: string; userId?: string; avatarId?: string }
    ) => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setActivities((prev) => [
        {
          id: `${Date.now()}_${Math.random()}`,
          time,
          text,
          type,
          username: meta?.username,
          userId: meta?.userId,
          avatarId: meta?.avatarId,
        },
        ...prev.slice(0, 49),
      ]);
    },
    []
  );

  const ytPlayerRef = useRef<YouTubePlayerHandle>(null);
  const [isMuted, setIsMuted] = useState(false);

  const handleToggleMute = useCallback(() => {
    setIsMuted((muted) => !muted);
  }, []);

  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  const [isCaptionsOn, setIsCaptionsOn] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const handleSetPlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    ytPlayerRef.current?.setPlaybackRate(speed);
    socket?.emit('set_playback_speed', { speed });
  }, [socket]);

  const handleResync = useCallback(() => {
    if (ytPlayerRef.current) {
      ytPlayerRef.current.resync();
      onNotify('Re-syncing with host...', 'success');
    }
  }, [onNotify]);

  const handleSetQuality = useCallback((q: string) => {
    setCurrentQuality(q);
    ytPlayerRef.current?.setQuality(q);
    onNotify(`Local video quality set to ${q.toUpperCase()}`, 'success');
  }, [onNotify]);

  const handleToggleCaptions = useCallback(() => {
    const nextState = ytPlayerRef.current?.toggleCaptions();
    const isOn = Boolean(nextState);
    setIsCaptionsOn(isOn);
    onNotify(isOn ? 'Captions enabled' : 'Captions disabled', 'success');
  }, [onNotify]);

  // Stable callback refs
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const onLeaveRoomRef = useRef(onLeaveRoom);
  onLeaveRoomRef.current = onLeaveRoom;

  const addActivityRef = useRef(addActivity);
  addActivityRef.current = addActivity;

  // Auto-hide controls activity handler
  const handleUserActivity = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    // Auto-hide after 5 seconds of inactivity if playing on non-touch devices
    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouch) {
      controlsTimerRef.current = setTimeout(() => {
        if (syncState?.playState === 'playing') {
          setIsControlsVisible(false);
        }
      }, 5000);
    }
  }, [syncState?.playState]);

  useEffect(() => {
    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (isTouch) {
      setIsControlsVisible(true);
      return;
    }
    if (syncState?.playState !== 'playing') {
      setIsControlsVisible(true);
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
    } else {
      handleUserActivity();
    }
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [syncState?.playState, handleUserActivity]);

  // Persist current watch party to browser storage
  useEffect(() => {
    if (roomId) {
      saveStoredParty({
        roomId,
        username: userSettings.name || username,
        role: userRole,
        videoId,
        avatarId: userSettings.avatarId,
        lastVisited: Date.now(),
      });
    }
  }, [roomId, username, userSettings.name, userSettings.avatarId, userRole, videoId]);

  // Connect socket and register listeners
  useEffect(() => {
    socket.connect();
    setActivePoll(null);
    activePollIdRef.current = null;

    const onConnect = () => {
      setConnectionStatus('connected');
      const activeAvatar =
        userSettings.avatarId ||
        localStorage.getItem('synctube_avatar_id') ||
        getParticipantCharacterId(userSettings.name || username) ||
        'luffy';

      rememberParticipantCharacter(userSettings.name || username, userId, activeAvatar);
      emitJoinRoom(roomId, userSettings.name || username, userId, activeAvatar, getRoomIdentityToken(roomId));
      addActivityRef.current('Connected to room session.', 'joined', {
        username: userSettings.name || username,
        userId,
        avatarId: activeAvatar,
      });
    };

    const onDisconnect = () => {
      setConnectionStatus('disconnected');
      addActivityRef.current('Disconnected from server.', 'error');
    };

    const onConnectError = () => {
      setConnectionStatus('disconnected');
    };

    const onSyncState = (data: SyncStatePayload) => {
      setSyncState(data);
      setVideoId(data.videoId);
    };

    const onUserJoined = (data: UserJoinedPayload) => {
      data.participants?.forEach((p) => {
        if (p.avatarId) {
          rememberParticipantCharacter(p.username, p.userId, p.avatarId);
        }
      });
      if (data.avatarId) {
        rememberParticipantCharacter(data.username, data.userId, data.avatarId);
      }
      setParticipants(data.participants);
      if (data.userId === userId) {
        setUserRole(data.role);
      }
      addActivityRef.current(`${data.username} joined the room`, 'joined', {
        username: data.username,
        userId: data.userId,
        avatarId: data.avatarId,
      });
    };

    const onUserLeft = (data: UserLeftPayload) => {
      data.participants?.forEach((p) => {
        rememberParticipantCharacter(p.username, p.userId, p.avatarId);
      });
      setParticipants(data.participants);
      const myParticipant = data.participants?.find((p) => p.userId === userId);
      if (myParticipant && myParticipant.role !== userRoleRef.current) {
        setUserRole(myParticipant.role);
        if (myParticipant.role === 'HOST') {
          onNotifyRef.current('You are now the Host of the room!', 'success');
        }
      }
      addActivityRef.current(`${data.username} left the room.`, 'left', {
        username: data.username,
        userId: data.userId,
      });
    };

    const onRoleAssigned = (data: RoleAssignedPayload) => {
      data.participants?.forEach((p) => {
        rememberParticipantCharacter(p.username, p.userId, p.avatarId);
      });
      setParticipants(data.participants);
      const myParticipant = data.participants.find((p) => p.userId === userId);
      if (myParticipant) {
        setUserRole(myParticipant.role);
      }
      if (data.userId === userId) {
        onNotifyRef.current(`Your role was updated to ${data.role}`, 'success');
      }
      addActivityRef.current(`${data.username} was assigned role ${data.role}`, 'role', {
        username: data.username,
        userId: data.userId,
      });
    };

    const onParticipantRemoved = (data: ParticipantRemovedPayload) => {
      setParticipants(data.participants);
      if (data.userId === userId) {
        onNotifyRef.current('You were removed from this room by the host.', 'error');
        onLeaveRoomRef.current();
      } else {
        const myParticipant = data.participants?.find((p) => p.userId === userId);
        if (myParticipant && myParticipant.role !== userRoleRef.current) {
          setUserRole(myParticipant.role);
          if (myParticipant.role === 'HOST') {
            onNotifyRef.current('You are now the Host of the room!', 'success');
          }
        }
        addActivityRef.current('A participant was removed by the host.', 'removed');
      }
    };

    const onError = (err: ErrorPayload) => {
      onNotifyRef.current(`[${err.code}] ${err.message}`, 'error');
      if (err.code === 'NOT_FOUND') {
        setTimeout(() => onLeaveRoomRef.current(), 1500);
      } else if (err.code === 'FORBIDDEN' && err.message.toLowerCase().includes('removed')) {
        setTimeout(() => onLeaveRoomRef.current(), 1500);
      }
    };

    const onIdentityCredential = (data: { roomId: string; userId: string; token: string }) => {
      if (data?.roomId === roomId && data.userId === userId && typeof data.token === 'string') {
        saveRoomIdentityToken(roomId, data.token);
      }
    };

    // playlist_sync: full playlist sent on join
    const onPlaylistSync = (data: { playlist: PlaylistItem[] }) => {
      setPlaylist(data.playlist);
    };

    // playlist_update: incremental update broadcast by server
    const onPlaylistUpdate = (data: { playlist: PlaylistItem[] }) => {
      setPlaylist(data.playlist);
    };

    // pending_requests_sync: full pending action request list on join
    const onPendingRequestsSync = (data: { requests: PendingActionRequest[] }) => {
      data.requests?.forEach((r) => {
        rememberParticipantCharacter(r.requesterName, r.requesterId, r.requesterAvatarId);
      });
      setPendingRequests(data.requests);
    };

    // action_requested: new request from a participant
    const onActionRequested = (data: { request: PendingActionRequest }) => {
      rememberParticipantCharacter(data.request.requesterName, data.request.requesterId, data.request.requesterAvatarId);
      setPendingRequests((prev) => [...prev.filter((r) => r.id !== data.request.id), data.request]);
      if (userRoleRef.current === 'HOST' || userRoleRef.current === 'MODERATOR') {
        const actionLabel = data.request.type === 'request_next_video' ? 'play next video' : data.request.type.replace('_', ' ');
        onNotifyRef.current(`${data.request.requesterName} requested to ${actionLabel}`, 'success');
      }
      const isVideoReq = data.request.type === 'request_next_video' || data.request.type === 'change_video';
      const actType = isVideoReq ? 'video_requested' : 'playback';
      const actText = isVideoReq
        ? `${data.request.requesterName} requested a video`
        : `${data.request.requesterName} requested: ${data.request.type.replace('_', ' ')}`;
      addActivityRef.current(actText, actType, {
        username: data.request.requesterName,
        userId: data.request.requesterId,
        avatarId: data.request.requesterAvatarId,
      });
    };

    // action_request_resolved: request approved or rejected
    const onActionRequestResolved = (data: ActionRequestResolvedPayload) => {
      setPendingRequests((prev) => prev.filter((r) => r.id !== data.requestId));
      if (data.request.requesterId === userId) {
        if (data.approved) {
          onNotifyRef.current(`Your request was approved by ${data.resolvedBy}!`, 'success');
        } else {
          onNotifyRef.current(`Your request was rejected by ${data.resolvedBy}.`, 'error');
        }
      }
      addActivityRef.current(
        data.approved
          ? `${data.request.requesterName}'s request was approved`
          : `Request from ${data.request.requesterName} was rejected`,
        data.approved ? 'request_approved' : 'playback',
        {
          username: data.request.requesterName,
          userId: data.request.requesterId,
          avatarId: data.request.requesterAvatarId,
        }
      );
    };

    // chat_message: real-time incoming chat message
    const onChatMessage = (data: ChatMessage) => {
      rememberParticipantCharacter(data.username, data.userId, data.avatarId);
      setChatMessages((prev) => [...prev.slice(-99), data]);
    };

    // chat_history: authoritative sync of room messages on joining
    const onChatHistory = (data: { messages: ChatMessage[] }) => {
      if (Array.isArray(data?.messages)) {
        setChatMessages(data.messages);
        data.messages.forEach((m) => {
          rememberParticipantCharacter(m.username, m.userId, m.avatarId);
        });
      }
    };

    const onPollUpdated = (data: RoomPoll) => {
      if (
        !data ||
        typeof data.id !== 'string' ||
        typeof data.question !== 'string' ||
        !Array.isArray(data.options) ||
        !data.options.every((option) => typeof option === 'string') ||
        !data.votes ||
        typeof data.votes !== 'object'
      ) return;

      if (activePollIdRef.current !== data.id) {
        activePollIdRef.current = data.id;
        setActiveSidebarTab('chat');
      }
      setActivePoll(data);
    };

    // participant_avatar_updated: user updated profile character
    const onAvatarUpdated = (data: { userId: string; username: string; avatarId: string; participants: ParticipantPublic[] }) => {
      rememberParticipantCharacter(data.username, data.userId, data.avatarId);
      data.participants?.forEach((p) => {
        if (p.avatarId) {
          rememberParticipantCharacter(p.username, p.userId, p.avatarId);
        }
      });
      setParticipants(data.participants);
    };

    // message_reaction_updated: real-time reaction toggle on a chat message
    const onMessageReactionUpdated = (data: {
      messageId: string;
      emoji: string;
      userId: string;
      username: string;
      reactions?: Record<string, string[]>;
    }) => {
      setChatMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== data.messageId) return msg;
          return { ...msg, reactions: data.reactions || {} };
        })
      );
    };

    // reaction_received: real-time emoji reaction from a viewer
    const onReactionReceived = (data: EmojiReaction) => {
      setActiveReactions((prev) => [...prev, data]);
      addActivity(
        `${data.username} reacted ${data.emoji}${data.videoTime !== undefined ? ` at ${Math.floor(data.videoTime / 60)}:${String(Math.floor(data.videoTime % 60)).padStart(2, '0')}` : ''}`,
        'reaction',
        { username: data.username, userId: data.userId }
      );
      setTimeout(() => {
        setActiveReactions((prev) => prev.filter((r) => r.id !== data.id));
      }, 2800);
    };

    const onPlaybackSpeedUpdated = (data: { speed: number }) => {
      if (!Number.isFinite(data.speed)) return;
      setPlaybackSpeed(data.speed);
      ytPlayerRef.current?.setPlaybackRate(data.speed);
    };

    // sync_pulse: lightweight real-time position update from host → re-anchor viewers
    const onSyncPulse = (data: { currentTime: number; serverTime: number }) => {
      setSyncState((prev) => {
        if (!prev || prev.playState !== 'playing') return prev;
        const receivedAt = Date.now();
        const transit = Math.max(0, (receivedAt - data.serverTime) / 1000);
        const anchoredTime = data.currentTime + transit;
        return { ...prev, currentTime: anchoredTime, updatedAt: receivedAt };
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('sync_state', onSyncState);
    socket.on('sync_pulse', onSyncPulse);
    socket.on('playlist_sync', onPlaylistSync);
    socket.on('playlist_update', onPlaylistUpdate);
    socket.on('pending_requests_sync', onPendingRequestsSync);
    socket.on('action_requested', onActionRequested);
    socket.on('action_request_resolved', onActionRequestResolved);
    socket.on('chat_message', onChatMessage);
    socket.on('chat_history', onChatHistory);
    socket.on('poll_updated', onPollUpdated);
    socket.on('message_reaction_updated', onMessageReactionUpdated);
    socket.on('reaction_received', onReactionReceived);
    socket.on('playback_speed_updated', onPlaybackSpeedUpdated);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('role_assigned', onRoleAssigned);
    socket.on('participant_removed', onParticipantRemoved);
    socket.on('participant_avatar_updated', onAvatarUpdated);
    socket.on('error', onError);
    socket.on('identity_credential', onIdentityCredential);

    const stopTimeSync = startTimeSync();

    if (socket.connected) {
      onConnect();
    }

    return () => {
      stopTimeSync();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('sync_state', onSyncState);
      socket.off('sync_pulse', onSyncPulse);
      socket.off('playlist_sync', onPlaylistSync);
      socket.off('playlist_update', onPlaylistUpdate);
      socket.off('pending_requests_sync', onPendingRequestsSync);
      socket.off('action_requested', onActionRequested);
      socket.off('action_request_resolved', onActionRequestResolved);
      socket.off('chat_message', onChatMessage);
      socket.off('chat_history', onChatHistory);
      socket.off('poll_updated', onPollUpdated);
      socket.off('message_reaction_updated', onMessageReactionUpdated);
      socket.off('reaction_received', onReactionReceived);
      socket.off('playback_speed_updated', onPlaybackSpeedUpdated);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('role_assigned', onRoleAssigned);
      socket.off('participant_removed', onParticipantRemoved);
      socket.off('participant_avatar_updated', onAvatarUpdated);
      socket.off('error', onError);
      socket.off('identity_credential', onIdentityCredential);
      emitLeaveRoom(roomId);
    };
  }, [roomId, username, userId, userSettings.name, userSettings.avatarId, addActivity]);

  // Actions
  const handlePlay = useCallback((time?: number) => {
    const target = typeof time === 'number' ? time : currentTimeRef.current;
    emitPlay(target);
    addActivity(`${username} started the video`, 'playback', {
      username,
      userId,
      avatarId: userSettings.avatarId,
    });
  }, [addActivity, username, userId, userSettings.avatarId]);

  const handlePause = useCallback((time?: number) => {
    const target = typeof time === 'number' ? time : currentTimeRef.current;
    emitPause(target);
    addActivity(`${username} paused the video`, 'playback', {
      username,
      userId,
      avatarId: userSettings.avatarId,
    });
  }, [addActivity, username, userId, userSettings.avatarId]);

  const handleSeek = useCallback((time: number) => {
    currentTimeRef.current = time;
    emitSeek(time);
    addActivity(`You seeked to ${Math.floor(time)}s.`, 'playback');
  }, [addActivity]);

  const handleAssignRole = useCallback((targetUserId: string, newRole: Role) => {
    emitAssignRole(targetUserId, newRole);
  }, []);

  const handleRemoveParticipant = useCallback((targetUserId: string) => {
    emitRemoveParticipant(targetUserId);
  }, []);

  const handleTimeChange = useCallback((time: number, dur: number) => {
    currentTimeRef.current = time;
    setCurrentTime(time);
    setDuration(dur);
  }, []);

  // Host sends position pulse every second while playing so viewers can re-anchor
  const userRoleRef = useRef(userRole);
  userRoleRef.current = userRole;
  const syncStateRef = useRef(syncState);
  syncStateRef.current = syncState;

  useEffect(() => {
    const interval = setInterval(() => {
      if (
        (userRoleRef.current === 'HOST' || userRoleRef.current === 'MODERATOR') &&
        syncStateRef.current?.playState === 'playing'
      ) {
        emitHostSyncPulse(currentTimeRef.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fullscreen Handler
  const handleToggleFullscreen = () => {
    if (!stageContainerRef.current) return;
    if (!document.fullscreenElement) {
      stageContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Playlist handlers — all mutations go through server (server is source of truth)
  const handleAddToPlaylist = (
    targetVideoId: string,
    title?: string,
    duration?: string,
    channel?: string,
    thumbnail?: string
  ) => {
    if (userRole !== 'HOST' && userRole !== 'MODERATOR') {
      onNotify('Only hosts and moderators can add videos directly.', 'error');
      return;
    }
    emitPlaylistAdd(targetVideoId, title, duration, channel, thumbnail);
    addActivity(`${username} added a video to playlist`, 'playlist', {
      username,
      userId,
      avatarId: userSettings.avatarId,
    });
    onNotify('Video added to playlist!', 'success');
  };

  const handleVoteItem = (itemId: string) => {
    emitPlaylistVote(itemId);
  };

  const handleShufflePlaylist = () => {
    if (userRole !== 'HOST' && userRole !== 'MODERATOR') return;
    emitPlaylistShuffle();
    addActivity('Playlist was shuffled', 'playlist');
  };

  const handleClearPlaylist = () => {
    if (userRole !== 'HOST' && userRole !== 'MODERATOR') return;
    emitPlaylistClear();
    addActivity('Playlist was cleared', 'playlist');
  };

  const handlePlayItem = (targetVideoId: string, itemId: string) => {
    if (userRole !== 'HOST' && userRole !== 'MODERATOR') {
      onNotify('Only hosts and moderators can change the video.', 'error');
      return;
    }
    emitChangeVideo(targetVideoId, true);
    addActivity(`Playing video: ${targetVideoId}`, 'playback');
    if (roomSettings.autoRemovePlayed) {
      setPlaylist((prev) => prev.filter((i) => i.id !== itemId));
    }
  };

  const handleNextVideo = useCallback(() => {
    if (userRole !== 'HOST' && userRole !== 'MODERATOR') {
      onNotify('Only hosts and moderators can change the video.', 'error');
      return;
    }
    if (playlist.length === 0) {
      onNotify('Playlist is empty.', 'error');
      return;
    }

    const currentIndex = playlist.findIndex((i) => i.videoId === videoId);
    let nextItem: PlaylistItem | undefined;

    if (roomSettings.shuffle && playlist.length > 1) {
      const remaining = playlist.filter((i) => i.videoId !== videoId);
      nextItem = remaining[Math.floor(Math.random() * remaining.length)];
    } else if (currentIndex >= 0 && currentIndex < playlist.length - 1) {
      nextItem = playlist[currentIndex + 1];
    } else {
      nextItem = playlist[0]; // loop back to first
    }

    if (nextItem) {
      emitChangeVideo(nextItem.videoId, true);
      addActivity(`Playing next video: ${nextItem.videoId}`, 'playback');
      onNotify(`Now playing: ${nextItem.videoId}`, 'success');
      if (roomSettings.autoRemovePlayed) {
        setPlaylist((prev) => prev.filter((i) => i.id !== nextItem?.id));
      }
    }
  }, [userRole, playlist, videoId, roomSettings.shuffle, roomSettings.autoRemovePlayed, addActivity, onNotify]);

  const handleRemovePlaylistItem = (itemId: string) => {
    if (userRole !== 'HOST' && userRole !== 'MODERATOR') return;
    emitPlaylistRemove(itemId);
    addActivity('Removed video from playlist', 'playback');
  };

  const handleMoveToTop = (itemId: string) => {
    if (userRole !== 'HOST' && userRole !== 'MODERATOR') return;
    emitPlaylistMoveTop(itemId);
    addActivity('Moved video to top of playlist', 'playback');
  };

  const handleReorderPlaylist = (fromIndex: number, toIndex: number) => {
    if (userRole !== 'HOST' && userRole !== 'MODERATOR') return;
    emitPlaylistReorder(fromIndex, toIndex);
  };

  // Video Ended callback -> auto advance playlist
  const handleVideoEnded = () => {
    addActivity('Current video finished playing.', 'playback');
    if (playlist.length > 0) {
      handleNextVideo();
    }
  };

  // Settings Handlers
  const handleUpdateUserSettings = (settings: UserSettings) => {
    setUserSettings(settings);
    if (settings.rememberMe) {
      localStorage.setItem('synctube_user_settings', JSON.stringify(settings));
    } else {
      localStorage.removeItem('synctube_user_settings');
    }
    if (settings.avatarId) {
      rememberParticipantCharacter(settings.name || username, userId, settings.avatarId);
      emitUpdateAvatar(settings.avatarId);
    }
    onNotify('User settings saved!', 'success');
  };

  const handleUpdateRoomSettings = (settings: RoomSettingsData) => {
    setRoomSettings(settings);
    onNotify('Room settings updated!', 'success');
  };

  const handleDeleteRoom = () => {
    onNotify('Room deleted by host.', 'error');
    onLeaveRoom();
  };

  // Participant Action Requests & Approvals
  const handleRequestAction = useCallback(
    (
      type: ActionRequestType,
      data?: { time?: number; videoId?: string; title?: string; duration?: string; channel?: string }
    ) => {
      emitRequestAction(type, data);
      const actionLabel = type === 'request_next_video' ? 'play next video' : type.replace('_', ' ');
      onNotify('Request submitted to Host/Moderators!', 'success');
      const isVideoReq = type === 'request_next_video' || type === 'change_video';
      const actType = isVideoReq ? 'video_requested' : 'playback';
      const actText = type === 'request_next_video'
        ? `${username} requested a video`
        : `You requested to ${actionLabel}`;
      addActivity(actText, actType, {
        username,
        userId,
        avatarId: userSettings.avatarId,
      });
    },
    [onNotify, addActivity, username, userId, userSettings.avatarId]
  );

  const handleRespondRequest = useCallback(
    (requestId: string, approved: boolean, mode?: 'now' | 'next') => {
      emitRespondActionRequest(requestId, approved, mode);
      if (approved) {
        onNotify(mode === 'next' ? 'Request approved and queued as Next Up!' : 'Request approved!', 'success');
      } else {
        onNotify('Request rejected.', 'error');
      }
    },
    [onNotify]
  );

  // Chat & Reaction Handlers
  const handleSendChat = useCallback(
    (text: string, replyTo?: ChatReplyPreview) => {
      emitSendChat(text, userSettings.color, userSettings.avatarId, replyTo);
    },
    [userSettings.color, userSettings.avatarId]
  );

  const handleToggleMessageReaction = useCallback((messageId: string, emoji: string) => {
    emitToggleMessageReaction(messageId, emoji);
  }, []);

  const handleSendReaction = useCallback((emoji: string) => {
    emitSendReaction(emoji);
  }, []);

  return (
    <div
      className={`room-page-root ${isTheaterMode ? 'theater-dimmed' : ''}`}
      data-room-theme={roomSettings.theme}
      style={{ '--room-accent': roomSettings.accentColor } as React.CSSProperties}
    >
      {connectionStatus !== 'connected' && (
        <div className={`connection-status-banner ${connectionStatus}`} role="status" aria-live="polite">
          <span className="connection-status-dot" />
          {connectionStatus === 'connecting' ? 'Connecting to the room…' : 'Connection lost — reconnecting…'}
        </div>
      )}
      {/* Theater Dim Lights Backdrop */}
      {isTheaterMode && (
        <div
          className="theater-dim-backdrop"
          onClick={handleToggleTheaterMode}
          title="Click to turn lights back on (or press Esc)"
        />
      )}

      <RoomHeader
        roomId={roomId}
        connectionStatus={connectionStatus}
        onLeaveRoom={onLeaveRoom}
        onNotify={onNotify}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenInvite={() => setIsInviteModalOpen(true)}
        onOpenSearch={() => setIsSearchModalOpen(true)}
        isTheaterMode={isTheaterMode}
        onToggleTheater={handleToggleTheaterMode}
        syncState={syncState}
        currentTime={currentTime}
        onResync={handleResync}
      />

      <main className="room-container">
        {/* Left Side: Large Theater Video Stage with YouTube Ambient Lighting & Floating Overlay Controls */}
        <div className="stage-area">
          {/* Floating Host Approval Alert Banner for incoming Participant requests */}
          {pendingRequests.length > 0 && (userRole === 'HOST' || userRole === 'MODERATOR') && (
            <div className="host-approval-banner">
              <div className="host-approval-info">
                <Bell size={16} color="var(--accent)" />
                <span>
                  <strong>{pendingRequests[0].requesterName}</strong> requested to{' '}
                  <strong>{pendingRequests[0].type.replace('_', ' ')}</strong>
                  {pendingRequests[0].data?.videoId ? ` (${pendingRequests[0].data.videoId})` : ''}
                  {pendingRequests[0].data?.time !== undefined ? ` at ${Math.floor(pendingRequests[0].data.time)}s` : ''}
                </span>
              </div>
              <div className="host-approval-actions">
                <button
                  type="button"
                  className="btn btn-approve btn-sm"
                  onClick={() => handleRespondRequest(pendingRequests[0].id, true)}
                  title="Approve this request"
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  type="button"
                  className="btn btn-reject btn-sm"
                  onClick={() => handleRespondRequest(pendingRequests[0].id, false)}
                  title="Reject this request"
                >
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          )}

          <div
            className="stage-ambient-wrapper"
            style={{
              '--ambient-primary': ambientPalette.primary,
              '--ambient-secondary': ambientPalette.secondary,
              '--ambient-tertiary': ambientPalette.tertiary,
              '--ambient-blur': `${ambientBlur * 1.2}px`,
              '--ambient-spread': ambientSpread / 100,
            } as React.CSSProperties}
          >
          {/* Ambient Mode Backdrop — only shown after server confirms state */}
          {ambientMode && syncState && videoId && (
            <div
              className={`ambient-backdrop ${syncState.playState === 'playing' ? 'ambient-live' : ''}`}
              aria-hidden="true"
            >
              <img
                key={videoId}
                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                alt=""
                className="ambient-backdrop-img"
                crossOrigin="anonymous"
                onLoad={handleAmbientImageLoad}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                }}
              />
              <div className="ambient-backdrop-overlay" />
            </div>
          )}

            <div
              ref={stageContainerRef}
              className="glass-panel stage-card stage-theater"
              onMouseMove={handleUserActivity}
              onMouseEnter={handleUserActivity}
              onTouchStart={handleUserActivity}
            >
              <div className="video-wrapper">
                <ReactionOverlay reactions={activeReactions} />

                {videoId ? (
                  <YouTubePlayer
                    ref={ytPlayerRef}
                    videoId={videoId}
                    syncState={syncState}
                    userRole={userRole}
                    playbackSpeed={playbackSpeed}
                    isMuted={isMuted}
                    onLocalPlay={handlePlay}
                    onLocalPause={handlePause}
                    onLocalSeek={handleSeek}
                    onCurrentTimeChange={handleTimeChange}
                    onVideoEnded={handleVideoEnded}
                  />
                ) : (
                  <div className="video-empty-state">
                    <span>No video selected</span>
                    {(userRole === 'HOST' || userRole === 'MODERATOR') && (
                      <small>Use "Change Video" to choose a YouTube video.</small>
                    )}
                  </div>
                )}

                {/* Playback Controls overlay */}
                <PlaybackControls
                  playState={syncState?.playState || 'paused'}
                  currentTime={currentTime}
                  duration={duration}
                  userRole={userRole}
                  visible={isControlsVisible}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeek={handleSeek}
                  onNextVideo={playlist.length > 0 ? handleNextVideo : undefined}
                  onToggleFullscreen={handleToggleFullscreen}
                  isFullscreen={isFullscreen}
                  ambientMode={ambientMode}
                  onToggleAmbient={handleToggleAmbientMode}
                  onToggleMute={handleToggleMute}
                  onResync={handleResync}
                  isMuted={isMuted}
                  onSetQuality={handleSetQuality}
                  onToggleCaptions={handleToggleCaptions}
                  currentQuality={currentQuality}
                  isCaptionsOn={isCaptionsOn}
                  playbackSpeed={playbackSpeed}
                  onSetPlaybackSpeed={userRole === 'HOST' || userRole === 'MODERATOR' ? handleSetPlaybackSpeed : undefined}
                  onRequestAction={handleRequestAction}
                  onOpenRequestsTab={() => setActiveSidebarTab('requests')}
                  reactionControl={<FloatingReactions socket={socket} username={username} avatarId={userSettings.avatarId} currentTime={currentTime} userRole={userRole} inline alwaysExpanded />}
                />
              </div>
            </div>
          </div>

          {/* Mobile Controller Dock */}
          <div className="mobile-playback-dock">
            <PlaybackControls
              playState={syncState?.playState || 'paused'}
              currentTime={currentTime}
              duration={duration}
              userRole={userRole}
              visible={true}
              isDockMode={true}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeek={handleSeek}
              onNextVideo={playlist.length > 0 ? handleNextVideo : undefined}
              onToggleFullscreen={handleToggleFullscreen}
              isFullscreen={isFullscreen}
              ambientMode={ambientMode}
              onToggleAmbient={handleToggleAmbientMode}
              onToggleMute={handleToggleMute}
              onResync={handleResync}
              isMuted={isMuted}
              onSetQuality={handleSetQuality}
              onToggleCaptions={handleToggleCaptions}
              currentQuality={currentQuality}
              isCaptionsOn={isCaptionsOn}
              playbackSpeed={playbackSpeed}
              onSetPlaybackSpeed={userRole === 'HOST' || userRole === 'MODERATOR' ? handleSetPlaybackSpeed : undefined}
              onRequestAction={handleRequestAction}
              onOpenRequestsTab={() => setActiveSidebarTab('requests')}
              reactionControl={<FloatingReactions socket={socket} username={username} avatarId={userSettings.avatarId} currentTime={currentTime} userRole={userRole} inline alwaysExpanded />}
            />
          </div>
        </div>

        {/* Right Side: Sidebar with Participants, Playlist, and Activity */}
        <aside className="sidebar">


          {/* Button-style Segmented Tab Bar */}
          <div className="sidebar-tab-bar" role="tablist" ref={tabBarRef} onWheel={handleTabBarWheel}>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSidebarTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`sidebar-tab-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveSidebarTab(tab.id)}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                  {tab.id === 'participants' && (
                    <span className="tab-count-pill">{participants.length}</span>
                  )}
                  {tab.id === 'playlist' && playlist.length > 0 && (
                    <span className="tab-count-pill">{playlist.length}</span>
                  )}
                  {tab.id === 'requests' && pendingRequests.length > 0 && (
                    <span className="badge-counter">{pendingRequests.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Tab Panel */}
          <div className="sidebar-tab-content">

            {activeSidebarTab === 'participants' && (
              <ParticipantList
                participants={participants}
                currentUserId={userId}
                currentUserRole={userRole}
                currentUserAvatarId={userSettings.avatarId}
                onAssignRole={handleAssignRole}
                onRemoveParticipant={handleRemoveParticipant}
              />
            )}

            {activeSidebarTab === 'playlist' && (
              <Playlist
                playlist={playlist}
                currentVideoId={videoId}
                userRole={userRole}
                currentUserId={userId}
                onAddToPlaylist={handleAddToPlaylist}
                onPlayItem={handlePlayItem}
                onNextVideo={handleNextVideo}
                onRemoveItem={handleRemovePlaylistItem}
                onMoveToTop={handleMoveToTop}
                onReorderPlaylist={handleReorderPlaylist}
                onVoteItem={handleVoteItem}
                onShuffle={handleShufflePlaylist}
                onClear={handleClearPlaylist}
                onOpenSearch={() => setIsSearchModalOpen(true)}
              />
            )}

            {activeSidebarTab === 'chat' && (
              <Chat
                messages={chatMessages}
                currentUserId={userId}
                currentUserAvatarId={userSettings.avatarId}
                viewerCount={participants.length}
                activePoll={activePoll}
                onVotePoll={(optionIndex) => socket.emit('vote_poll', { optionIndex })}
                onSendMessage={handleSendChat}
                onToggleReaction={handleToggleMessageReaction}
                onSendReaction={handleSendReaction}
              />
            )}

            {activeSidebarTab === 'requests' && (
              <ActionRequestsPanel
                pendingRequests={pendingRequests}
                currentUserRole={userRole}
                currentUserId={userId}
                currentTime={currentTime}
                onRequestAction={handleRequestAction}
                onRespondRequest={handleRespondRequest}
              />
            )}

            {activeSidebarTab === 'activity' && (
              <ActivityFeed activities={activities} />
            )}
          </div>
        </aside>
      </main>

      {/* Settings Modal (User & Room tabs) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUserRole={userRole}
        userSettings={userSettings}
        onUpdateUserSettings={handleUpdateUserSettings}
        roomSettings={roomSettings}
        onUpdateRoomSettings={handleUpdateRoomSettings}
        onDeleteRoom={handleDeleteRoom}
        ambientMode={ambientMode}
        onToggleAmbientMode={handleToggleAmbientMode}
        ambientBlur={ambientBlur}
        ambientSpread={ambientSpread}
        onAmbientBlurChange={handleAmbientBlurChange}
        onAmbientSpreadChange={handleAmbientSpreadChange}
      />

      {/* Floating Animated Emojis & Live Reaction Dock */}

      {/* In-App YouTube Search Modal */}
      <YouTubeSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        userRole={userRole}
        onPlayVideo={(newVid) => emitChangeVideo(newVid, true)}
        onAddToPlaylist={handleAddToPlaylist}
        onRequestAction={(type, data) => handleRequestAction(type, data)}
        onNotify={onNotify}
      />

      {/* Friends Invite & QR Code Modal */}
      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        roomId={roomId}
        onNotify={onNotify}
      />
    </div>
  );
};
