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
  emitPartyReady,
  emitSyncDriftCheck,
  emitChatTyping,
  emitToggleRoomLike,
  emitSetRoomCategory,
  emitGoLive,
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
  UserProfile,
  ParticipantReadiness,
  UniversalPlaybackState,
  DriftAssessment,
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
import { AuthModal } from '../components/AuthModal.js';
import { SyncDiagnosticsModal } from '../components/SyncDiagnosticsModal.js';
import { ExtensionStatusBanner } from '../components/ExtensionStatusBanner.js';
import { DirectVideoPlayer } from '../components/DirectVideoPlayer.js';
import { CinemaStageCard } from '../components/CinemaStageCard.js';
import { BrowserHubModal } from '../components/BrowserHubModal.js';
import { RoomTabPlayer } from '../components/RoomTabPlayer.js';
import { VideoAmbientBackdrop } from '../components/VideoAmbientBackdrop.js';
import { detectClientMedia } from '../utils/media.js';
import { authStorage } from '../utils/authStorage.js';
import { getApiUrl } from './HomePage.js';
import { getRoomIdentityToken, saveRoomIdentityToken } from '../utils/identity.js';
import { saveStoredParty } from '../utils/partyStorage.js';
import { rememberParticipantCharacter, subscribeCharacterUpdates, getParticipantCharacterId } from '../utils/characterMemory.js';
import { StreamInfoBar } from '../components/StreamInfoBar.js';
import { ShareStreamModal } from '../components/ShareStreamModal.js';
import { ReportStreamModal } from '../components/ReportStreamModal.js';
import { StreamEndedOverlay } from '../components/StreamEndedOverlay.js';
import { LucideIcon, Users, ListMusic, Activity, MessageSquare, Bell, Check, X, Search, Film, Globe, RefreshCw, Radio } from 'lucide-react';

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
  const [volume, setVolume] = useState<number>(100);
  const [latencyMode, setLatencyMode] = useState<'ultra_low' | 'low' | 'normal'>('low');
  const [streamStartedAt, setStreamStartedAt] = useState<number>(() => Date.now());
  const [streamCategory, setStreamCategory] = useState<string>('cinema');
  const [roomLikes, setRoomLikes] = useState<number>(0);
  const [hasLikedRoom, setHasLikedRoom] = useState<boolean>(false);
  const [roomUptimeSeconds, setRoomUptimeSeconds] = useState<number>(0);
  const [isStreamEnded, setIsStreamEnded] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const start = syncState?.createdAt || streamStartedAt;
    const updateTicker = () => {
      setRoomUptimeSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    updateTicker();
    const interval = setInterval(updateTicker, 1000);
    return () => clearInterval(interval);
  }, [syncState?.createdAt, streamStartedAt]);

  useEffect(() => {
    if (typeof syncState?.likes === 'number') {
      setRoomLikes(syncState.likes);
    }
    if (syncState?.category) {
      setStreamCategory(syncState.category);
    }
    if (syncState?.createdAt) {
      setStreamStartedAt(syncState.createdAt);
    }
  }, [syncState?.likes, syncState?.category, syncState?.createdAt]);

  useEffect(() => {
    const onLikesUpdated = (data: { likes: number; userId: string; hasLiked: boolean }) => {
      setRoomLikes(data.likes);
      if (data.userId === userId) {
        setHasLikedRoom(data.hasLiked);
      }
    };
    const onCategoryUpdated = (data: { category: string }) => {
      setStreamCategory(data.category);
    };
    socket.on('room:likes_updated', onLikesUpdated);
    socket.on('room:category_updated', onCategoryUpdated);
    return () => {
      socket.off('room:likes_updated', onLikesUpdated);
      socket.off('room:category_updated', onCategoryUpdated);
    };
  }, [userId]);

  const handleToggleRoomLike = useCallback(() => {
    emitToggleRoomLike();
  }, []);

  const handleSetCategory = useCallback((cat: string) => {
    setStreamCategory(cat);
    emitSetRoomCategory(cat);
  }, []);

  // V2 Features State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authStorage.getUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState<boolean>(false);
  const [universalSyncState, setUniversalSyncState] = useState<UniversalPlaybackState | null>(null);
  const [readinessList, setReadinessList] = useState<ParticipantReadiness[]>([]);
  const [isCurrentUserReady, setIsCurrentUserReady] = useState<boolean>(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [driftAssessment, setDriftAssessment] = useState<DriftAssessment | null>(null);
  const [isBrowserHubOpen, setIsBrowserHubOpen] = useState<boolean>(false);
  const [extensionInstalled, setExtensionInstalled] = useState<boolean>(false);
  const apiUrl = getApiUrl();

  // Extension detection bridge
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'SYNCTUBE_EXTENSION_PONG') {
        setExtensionInstalled(true);
      }
    };
    window.addEventListener('message', handleWindowMessage);
    const ping = () => {
      window.postMessage({ type: 'SYNCTUBE_EXTENSION_PING', roomId }, '*');
    };
    ping();
    const interval = setInterval(ping, 4000);
    return () => {
      window.removeEventListener('message', handleWindowMessage);
      clearInterval(interval);
    };
  }, [roomId]);


  const handleToggleReady = useCallback(() => {
    setIsCurrentUserReady((prev) => {
      const next = !prev;
      emitPartyReady(next ? 'ready' : 'buffering', ytPlayerRef.current?.getCurrentTime() || 0, 'youtube', videoId);
      onNotifyRef.current(next ? 'Marked as Ready 🟢' : 'Marked as Buffering 🟡', 'info');
      return next;
    });
  }, [videoId]);

  const handleTypingChange = useCallback((isTyping: boolean) => {
    emitChatTyping(isTyping);
  }, []);

  const handleToggleTheaterMode = useCallback(() => {
    setIsTheaterMode((prev) => {
      const next = !prev;
      setTimeout(() => {
        onNotifyRef.current(next ? 'Cinema Mode enabled: Lights Dimmed' : 'Cinema Mode: Lights On', 'info');
      }, 0);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSearchModalOpen) {
          setIsSearchModalOpen(false);
          return;
        }
        if (isInviteModalOpen) {
          setIsInviteModalOpen(false);
          return;
        }
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }
        if (isAuthModalOpen) {
          setIsAuthModalOpen(false);
          return;
        }
        if (isDiagnosticsModalOpen) {
          setIsDiagnosticsModalOpen(false);
          return;
        }
        if (isTheaterMode) {
          setIsTheaterMode(false);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isSearchModalOpen,
    isInviteModalOpen,
    isSettingsOpen,
    isAuthModalOpen,
    isDiagnosticsModalOpen,
    isTheaterMode,
  ]);

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
      onNotify('⚡ Time-traveling to match the host\'s exact timeline! Hold onto your popcorn 🍿', 'success');
    }
  }, [onNotify]);

  const handleSetQuality = useCallback((q: string) => {
    setCurrentQuality(q);
    ytPlayerRef.current?.setQuality(q);
    onNotify(`✨ Eye-candy upgraded! Video quality tuned to ${q.toUpperCase()} 🍿`, 'success');
  }, [onNotify]);

  const handleToggleCaptions = useCallback(() => {
    const nextState = ytPlayerRef.current?.toggleCaptions();
    const isOn = Boolean(nextState);
    setIsCaptionsOn(isOn);
    onNotify(isOn ? '💬 Subtitles ON! Reading minds and movie lines 🎬' : '🔇 Subtitles OFF! Pure cinema visuals mode ✨', 'success');
  }, [onNotify]);

  // Stable callback refs
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const onLeaveRoomRef = useRef(onLeaveRoom);
  onLeaveRoomRef.current = onLeaveRoom;

  const addActivityRef = useRef(addActivity);
  addActivityRef.current = addActivity;

  // Auto-hide controls activity handler
  const isHoveringControlsRef = useRef<boolean>(false);
  const handleUserActivity = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    // Auto-hide after 5 seconds of inactivity if playing on non-touch devices
    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouch) {
      controlsTimerRef.current = setTimeout(() => {
        if (syncState?.playState === 'playing' && !isHoveringControlsRef.current) {
          setIsControlsVisible(false);
        }
      }, 5000);
    }
  }, [syncState?.playState]);

  useEffect(() => {
    const handleGlobalActivity = () => {
      handleUserActivity();
    };
    window.addEventListener('mousemove', handleGlobalActivity, { passive: true });
    window.addEventListener('keydown', handleGlobalActivity, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleGlobalActivity);
      window.removeEventListener('keydown', handleGlobalActivity);
    };
  }, [handleUserActivity]);

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
      emitPartyReady('ready', 0, 'youtube', videoId);
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

    const formatFriendlyError = (code: string, message: string): string => {
      switch (code) {
        case 'NOT_FOUND':
          return '🏚️ Ghost town! This watch party vanished or doesn’t exist. Heading back to the lobby...';
        case 'FORBIDDEN':
          if (message.toLowerCase().includes('removed')) {
            return '🚪 The host escorted you out of the theater. Returning to lobby!';
          }
          return '🔒 VIP Zone only! Only the host holds the remote control for this action 👑';
        case 'INVALID_PAYLOAD':
        case 'BAD_REQUEST':
          return '🤔 Whoops! That movie request got scrambled in transit. Give it another shot!';
        case 'INTERNAL_ERROR':
          return '🤖 The projector hiccuped! Server caught a minor glitch, hang tight!';
        default:
          return `⚠️ ${message || 'Something unexpected happened, but the popcorn is still warm!'}`;
      }
    };

    const onError = (err: ErrorPayload) => {
      onNotifyRef.current(formatFriendlyError(err.code, err.message), 'error');
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

    // V2 Universal Listeners
    const onSyncStateV2 = (data: UniversalPlaybackState) => {
      setUniversalSyncState(data);
    };

    const onReadinessUpdate = (data: { readiness: ParticipantReadiness[] }) => {
      if (Array.isArray(data?.readiness)) {
        setReadinessList(data.readiness);
      }
    };

    const onDriftAssessmentReceived = (data: DriftAssessment & { snapshot?: UniversalPlaybackState }) => {
      setDriftAssessment(data);
      if (data.snapshot) setUniversalSyncState(data.snapshot);
      if (data.action === 'soft_rate_adjust' && data.targetRate) {
        ytPlayerRef.current?.setPlaybackRate(data.targetRate);
      } else if (data.action === 'hard_seek' && data.targetPosition !== undefined) {
        ytPlayerRef.current?.seekTo(data.targetPosition, true);
        ytPlayerRef.current?.setPlaybackRate(1.0);
      } else {
        ytPlayerRef.current?.setPlaybackRate(1.0);
      }
    };

    const onUserTyping = (data: { userId: string; username: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        if (data.isTyping) {
          return prev.includes(data.username) ? prev : [...prev, data.username];
        } else {
          return prev.filter((u) => u !== data.username);
        }
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('sync_state', onSyncState);
    socket.on('sync_pulse', onSyncPulse);
    socket.on('sync:state', onSyncStateV2);
    socket.on('party:readiness_update', onReadinessUpdate);
    socket.on('sync:drift_assessment', onDriftAssessmentReceived);
    socket.on('chat:user_typing', onUserTyping);
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
    const onWentLive = (data: { roomId: string; hostUsername: string; timestamp: number }) => {
      onNotifyRef.current(`🎉 @${data.hostUsername} has officially taken the room LIVE! Grab your popcorn & enjoy! 🍿✨`, 'success');
      addActivityRef.current(`@${data.hostUsername} went live with the broadcast!`, 'playback', {
        username: data.hostUsername,
      });
    };
    socket.on('room:went_live', onWentLive);
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
      socket.off('sync:state', onSyncStateV2);
      socket.off('party:readiness_update', onReadinessUpdate);
      socket.off('sync:drift_assessment', onDriftAssessmentReceived);
      socket.off('chat:user_typing', onUserTyping);
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
      socket.off('room:went_live', onWentLive);
      socket.off('identity_credential', onIdentityCredential);
      emitLeaveRoom(roomId);
    };
  }, [roomId, username, userId, userSettings.name, userSettings.avatarId, addActivity]);

  // Periodic drift check calibration every 5 seconds when playing
  useEffect(() => {
    if (syncState?.playState !== 'playing') return;
    const interval = setInterval(() => {
      emitSyncDriftCheck(currentTimeRef.current);
    }, 5000);
    return () => clearInterval(interval);
  }, [syncState?.playState]);

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

  const handleSetVolume = useCallback((newVol: number) => {
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
    } else if (newVol === 0 && !isMuted) {
      setIsMuted(true);
    }
    ytPlayerRef.current?.setVolume?.(newVol);
  }, [isMuted]);

  const isRoomLive = Boolean(
    syncState?.isLive ||
    syncState?.playState === 'playing' ||
    syncState?.browserSession ||
    (videoId && (videoId.startsWith('tb:') || videoId.startsWith('tab:')))
  );

  const handleGoLive = useCallback(() => {
    if (isRoomLive) {
      onNotify('✨ You are already broadcasting live! Grab some popcorn and enjoy the show 🍿', 'info');
      return;
    }
    emitGoLive();
    if (videoId && syncState?.playState !== 'playing') {
      handlePlay(currentTime || 0);
    }
    onNotify('🔴 WE ARE LIVE! Lights, camera, action! Viewers are now tuned into the watch party! 🎬🍿', 'success');
  }, [isRoomLive, videoId, syncState?.playState, currentTime, handlePlay, onNotify]);

  const handleToggleTheater = handleToggleTheaterMode;

  const handleTogglePiP = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        onNotify('Exited Picture-in-Picture mode', 'info');
        return;
      }
      const videoEl = stageContainerRef.current?.querySelector('video');
      if (videoEl && typeof videoEl.requestPictureInPicture === 'function') {
        await videoEl.requestPictureInPicture();
        onNotify('Entered Picture-in-Picture mode', 'success');
        return;
      }
      if ('documentPictureInPicture' in window && (window as any).documentPictureInPicture?.requestWindow) {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 640,
          height: 360,
        });
        const stage = stageContainerRef.current;
        if (stage) {
          pipWindow.document.body.appendChild(stage.cloneNode(true));
        }
        onNotify('Opened Picture-in-Picture window', 'success');
        return;
      }
      onNotify('Picture-in-Picture is active for compatible video streams on this browser', 'info');
    } catch (err: any) {
      onNotify(`Could not open Picture-in-Picture: ${err?.message || 'Unsupported'}`, 'error');
    }
  }, [onNotify]);

  // Playlist handlers — all mutations go through server (server is source of truth)
  const handleAddToPlaylist = (
    targetVideoId: string,
    title?: string,
    duration?: string,
    channel?: string,
    thumbnail?: string
  ) => {
    if (userRole !== 'HOST' && userRole !== 'MODERATOR') {
      onNotify('👑 VIP Remote alert! Only host & mods can drop videos directly into the queue. Drop a request in chat! 🎟️', 'error');
      return;
    }
    emitPlaylistAdd(targetVideoId, title, duration, channel, thumbnail);
    addActivity(`${username} added a video to playlist`, 'playlist', {
      username,
      userId,
      avatarId: userSettings.avatarId,
    });
    onNotify('🎬 Boom! Video queued up for the watch party! Popcorn ready! 🍿', 'success');
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
      onNotify('🛑 Channel surfing locked! Only the captain can switch the movie. Drop a suggestion in chat! 🍿', 'error');
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
      onNotify('🛑 Channel surfing locked! Only the captain can switch the movie. Drop a suggestion in chat! 🍿', 'error');
      return;
    }
    if (playlist.length === 0) {
      onNotify('📭 The popcorn bowl is full but the queue is empty! Search a video to keep the party rolling 🎬', 'error');
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
      onNotify(`🍿 Lights down, sound up! Now premiering on screen: ${nextItem.title || nextItem.videoId} 🎬✨`, 'success');
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
    onNotify('✨ Looking fresh! Profile vibes & avatar saved 💫', 'success');
  };

  const handleUpdateRoomSettings = (settings: RoomSettingsData) => {
    setRoomSettings(settings);
    onNotify('⚙️ Cinema upgraded! New room atmosphere applied 🎪', 'success');
  };

  const handleDeleteRoom = () => {
    onNotify('🚪 The host closed the theater curtains! Watch party ended. See you next time! 🎬👋', 'error');
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
      onNotify('📬 Pitch sent to the captain! Fingers crossed for that movie choice 🤞🍿', 'success');
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

  // Desktop & TV Keyboard Shortcuts (Space, M, F, T, L, C, Arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.modal-content'))
      ) {
        return;
      }

      const canCtrl = userRoleRef.current === 'HOST' || userRoleRef.current === 'MODERATOR';

      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (canCtrl) {
          if (syncStateRef.current?.playState === 'playing') handlePause();
          else handlePlay();
        } else {
          handleRequestAction(syncStateRef.current?.playState === 'playing' ? 'pause' : 'play');
        }
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        handleToggleTheater();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleGoLive();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleToggleCaptions();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const nextTime = Math.max(0, currentTimeRef.current - 5);
        if (canCtrl) handleSeek(nextTime);
        else handleRequestAction('seek', { time: nextTime });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextTime = Math.min(duration || 9999, currentTimeRef.current + 5);
        if (canCtrl) handleSeek(nextTime);
        else handleRequestAction('seek', { time: nextTime });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleSetVolume(Math.min(100, volume + 10));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleSetVolume(Math.max(0, volume - 10));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handlePause,
    handlePlay,
    handleRequestAction,
    handleToggleMute,
    handleToggleFullscreen,
    handleToggleTheater,
    handleGoLive,
    handleToggleCaptions,
    duration,
    handleSeek,
    volume,
    handleSetVolume,
  ]);

  const handleRespondRequest = useCallback(
    (requestId: string, approved: boolean, mode?: 'now' | 'next') => {
      emitRespondActionRequest(requestId, approved, mode);
      if (approved) {
        onNotify(mode === 'next' ? '🎉 Approved! Queued up right next in line! 🎬' : '🎉 Sweet! Approved your crew member\'s request! 🚀', 'success');
      } else {
        onNotify('😅 Request turned down. Maybe next time! 🎬', 'error');
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
        onOpenDiagnostics={() => setIsDiagnosticsModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenBrowserHub={() => setIsBrowserHubOpen(true)}
        currentUser={currentUser}
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

          <div className="stage-ambient-wrapper">
            {/* Real-time Video Ambient Mode Backdrop */}
            <VideoAmbientBackdrop
              containerRef={stageContainerRef}
              isEnabled={ambientMode}
              playState={syncState?.playState || 'paused'}
              blur={ambientBlur}
              spread={ambientSpread}
              videoId={videoId}
            />

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
                  (() => {
                    const detectedMedia = detectClientMedia(videoId);

                    // 2. Browser Tab Screen Share Stream
                    if (detectedMedia?.category === 'tab_share' || videoId.startsWith('tab:')) {
                      return (
                        <RoomTabPlayer
                          userRole={userRole}
                          userId={userId}
                          roomId={roomId}
                          socket={socket}
                          onNotify={onNotify}
                          onOpenBrowserHub={() => setIsBrowserHubOpen(true)}
                        />
                      );
                    }

                    // 3. Direct Video File / HLS Stream
                    if (detectedMedia?.category === 'direct_stream') {
                      return (
                        <DirectVideoPlayer
                          ref={ytPlayerRef}
                          mediaUrl={videoId}
                          syncState={syncState}
                          userRole={userRole}
                          playbackSpeed={playbackSpeed}
                          isMuted={isMuted}
                          onLocalPlay={handlePlay}
                          onLocalPause={handlePause}
                          onLocalSeek={handleSeek}
                          onCurrentTimeChange={handleTimeChange}
                          onVideoEnded={handleVideoEnded}
                          onOpenBrowserHub={() => setIsBrowserHubOpen(true)}
                        />
                      );
                    }

                    // 3. Movie Website Hub Card (Watch Party Cinema Stage)
                    if (detectedMedia?.category === 'movie_website') {
                      return (
                        <CinemaStageCard
                          media={detectedMedia}
                          roomId={roomId}
                          userRole={userRole}
                          onOpenBrowserHub={() => setIsBrowserHubOpen(true)}
                          onNotify={onNotify}
                        />
                      );
                    }

                    return (
                      <YouTubePlayer
                        ref={ytPlayerRef}
                        videoId={detectedMedia?.mediaId || videoId}
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
                    );
                  })()
                ) : (
                  (!isRoomLive && userRole !== 'HOST' && userRole !== 'MODERATOR') ? (
                    <div className="video-empty-state cinema-waiting-state">
                      <div className="cinema-waiting-badge">
                        <span className="live-badge-dot live-dot-dvr" />
                        <span>STREAM STARTING SOON</span>
                      </div>
                      <div className="cinema-waiting-icon-wrap">
                        <span className="cinema-waiting-emoji">🍿</span>
                      </div>
                      <h3 className="cinema-waiting-title">Grab Your Popcorn! The Show Starts Soon</h3>
                      <p className="cinema-waiting-desc">
                        Our host <strong>@{participants.find((p) => p.role === 'HOST')?.username || 'the host'}</strong> is backstage calibrating the cinema projector, tuning the sound system, and testing the popcorn butter levels. Hang tight, we're going live any moment! 🎬✨
                      </p>
                      <div className="cinema-waiting-fun-ticker">
                        <span>✨ Behind the scenes: <i>"Testing popcorn crispiness... 100% crispy & delicious!"</i> 🥤🍿</span>
                      </div>
                    </div>
                  ) : (
                    <div className="video-empty-state host-prep-state">
                      <div className="video-empty-icon">
                        <Film size={32} />
                      </div>
                      <span className="video-empty-title">
                        {userRole === 'HOST' || userRole === 'MODERATOR'
                          ? "🎬 You're in the Director's Chair, Boss!"
                          : "🍿 Popcorn Ready! Waiting for Host to Roll Film"}
                      </span>
                      <small className="video-empty-subtitle">
                        {userRole === 'HOST' || userRole === 'MODERATOR'
                          ? "Viewers are seated with their popcorn! Pick a YouTube video, launch Netflix/Prime from Browser Hub, share a tab, or click GO LIVE to kick off the watch party! 🚀"
                          : "Host is picking out peak entertainment. Sit back, chat with friends, and relax! 🎬✨"}
                      </small>
                      {(userRole === 'HOST' || userRole === 'MODERATOR') && (
                        <div className="video-empty-actions-row">
                          <button
                            type="button"
                            className="btn btn-primary video-empty-action-btn"
                            onClick={() => setIsSearchModalOpen(true)}
                          >
                            <Search size={15} />
                            <span>YouTube Search 🔍</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary video-empty-action-btn"
                            onClick={() => setIsBrowserHubOpen(true)}
                            id="empty-state-open-browser-btn"
                          >
                            <Globe size={15} color="#60a5fa" />
                            <span>Browser Hub 🌐</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-accent video-empty-action-btn go-live-stage-btn"
                            onClick={handleGoLive}
                          >
                            <Radio size={15} />
                            <span>Go Live Now 🔴</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )
                )}

                {/* Stage Quick Reactions floating pill overlay */}
                <div
                  className={`stage-quick-reactions-dock ${isControlsVisible ? 'dock-visible' : ''}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="dock-hint">React</span>
                  {['❤️', '🔥', '😂', '👏', '😮', '🎉', '🍿'].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="stage-dock-rx-btn"
                      onClick={() => handleSendReaction(emoji)}
                      title={`Send ${emoji} to room`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Reconnecting to Live Broadcast Banner */}
                {connectionStatus !== 'connected' && (
                  <div className="player-reconnecting-banner">
                    <RefreshCw size={14} className="spin-icon" />
                    <span>Hold tight! The internet had a momentary brain freeze 🥤 Re-syncing your cinema feed...</span>
                    <button type="button" className="btn btn-xs btn-primary banner-retry-btn" onClick={handleResync}>
                      Kickstart Connection ⚡
                    </button>
                  </div>
                )}

                {/* Stream Ended Screen Overlay */}
                {isStreamEnded && (
                  <StreamEndedOverlay
                    streamTitle={
                      syncState?.mediaIdentity?.title ||
                      playlist.find((p) => p.videoId === videoId)?.title ||
                      (videoId ? 'Live Cinema Stream' : `${participants.find((p) => p.role === 'HOST')?.username || username}'s Live Watch Party`)
                    }
                    hostUsername={participants.find((p) => p.role === 'HOST')?.username || (userRole === 'HOST' ? username : 'Host')}
                    hostAvatarId={participants.find((p) => p.role === 'HOST')?.avatarId || (userRole === 'HOST' ? userSettings.avatarId : undefined)}
                    durationSeconds={duration > 0 ? duration : 3480}
                    peakViewers={Math.max(participants.length, 12)}
                    onReplay={() => {
                      setIsStreamEnded(false);
                      handleSeek(0);
                      handlePlay(0);
                    }}
                    onReturnHome={onLeaveRoom}
                  />
                )}

                {/* Playback Controls overlay - only for linear video playback (YouTube / Direct file) */}
                {videoId && !syncState?.browserSession && !videoId.startsWith('tb:') && !videoId.startsWith('tab:') && detectClientMedia(videoId)?.category !== 'movie_website' && (
                  <div
                    onMouseEnter={() => {
                      isHoveringControlsRef.current = true;
                      handleUserActivity();
                    }}
                    onMouseLeave={() => {
                      isHoveringControlsRef.current = false;
                      handleUserActivity();
                    }}
                    onMouseMove={handleUserActivity}
                  >
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
                      isTheaterMode={isTheaterMode}
                      onToggleTheater={handleToggleTheater}
                      ambientMode={ambientMode}
                      onToggleAmbient={handleToggleAmbientMode}
                      onToggleMute={handleToggleMute}
                      onResync={handleResync}
                      isMuted={isMuted}
                      volume={volume}
                      onSetVolume={handleSetVolume}
                      onTogglePiP={handleTogglePiP}
                      onGoLive={handleGoLive}
                      isLive={isRoomLive}
                      latencyMode={latencyMode}
                      onSetLatencyMode={setLatencyMode}
                      onSetQuality={handleSetQuality}
                      onToggleCaptions={handleToggleCaptions}
                      currentQuality={currentQuality}
                      isCaptionsOn={isCaptionsOn}
                      playbackSpeed={playbackSpeed}
                      onSetPlaybackSpeed={userRole === 'HOST' || userRole === 'MODERATOR' ? handleSetPlaybackSpeed : undefined}
                      onRequestAction={handleRequestAction}
                      onOpenRequestsTab={() => setActiveSidebarTab('requests')}
                      reactionControl={<FloatingReactions socket={socket} username={username} avatarId={userSettings.avatarId} currentTime={currentTime} userRole={userRole} inline alwaysExpanded />}
                      roomUptimeSeconds={roomUptimeSeconds}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Live Stream Metadata Bar & Experience Info below stage */}
            <StreamInfoBar
              roomId={roomId}
              title={
                syncState?.mediaIdentity?.title ||
                playlist.find((p) => p.videoId === videoId)?.title ||
                (videoId ? detectClientMedia(videoId)?.title || 'Live Cinema Stream' : `${participants.find((p) => p.role === 'HOST')?.username || username}'s Live Watch Party`)
              }
              hostUsername={participants.find((p) => p.role === 'HOST')?.username || (userRole === 'HOST' ? username : 'Host')}
              hostAvatarId={participants.find((p) => p.role === 'HOST')?.avatarId || (userRole === 'HOST' ? userSettings.avatarId : undefined)}
              hostRole={participants.find((p) => p.role === 'HOST')?.role || 'HOST'}
              userRole={userRole}
              viewersCount={participants.length}
              streamStartedAt={syncState?.createdAt || streamStartedAt}
              category={streamCategory}
              onSetCategory={handleSetCategory}
              likes={roomLikes}
              hasLiked={hasLikedRoom}
              onToggleLike={handleToggleRoomLike}
              isHostRegistered={Boolean(
                (userRole === 'HOST' && currentUser?.id && currentUser?.email) ||
                (participants.find((p) => p.role === 'HOST')?.userId === currentUser?.id && currentUser?.email)
              )}
              hostFollowersCount={currentUser?.followersCount}
              onOpenShare={() => setIsShareModalOpen(true)}
              onOpenReport={() => setIsReportModalOpen(true)}
              onNotify={onNotify}
              thumbnailUrl={
                playlist.find((p) => p.videoId === videoId)?.thumbnail ||
                (videoId && !videoId.startsWith('tb:') && !videoId.startsWith('tab:')
                  ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                  : undefined)
              }
            />
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
              isTheaterMode={isTheaterMode}
              onToggleTheater={handleToggleTheater}
              ambientMode={ambientMode}
              onToggleAmbient={handleToggleAmbientMode}
              onToggleMute={handleToggleMute}
              onResync={handleResync}
              isMuted={isMuted}
              volume={volume}
              onSetVolume={handleSetVolume}
              onTogglePiP={handleTogglePiP}
              onGoLive={handleGoLive}
              isLive={isRoomLive}
              latencyMode={latencyMode}
              onSetLatencyMode={setLatencyMode}
              onSetQuality={handleSetQuality}
              onToggleCaptions={handleToggleCaptions}
              currentQuality={currentQuality}
              isCaptionsOn={isCaptionsOn}
              playbackSpeed={playbackSpeed}
              onSetPlaybackSpeed={userRole === 'HOST' || userRole === 'MODERATOR' ? handleSetPlaybackSpeed : undefined}
              onRequestAction={handleRequestAction}
              onOpenRequestsTab={() => setActiveSidebarTab('requests')}
              reactionControl={<FloatingReactions socket={socket} username={username} avatarId={userSettings.avatarId} currentTime={currentTime} userRole={userRole} inline alwaysExpanded />}
              roomUptimeSeconds={roomUptimeSeconds}
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
                readinessList={readinessList}
                isCurrentUserReady={isCurrentUserReady}
                onToggleReady={handleToggleReady}
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
                userRole={userRole}
                activePoll={activePoll}
                onVotePoll={(optionIndex) => socket.emit('vote_poll', { optionIndex })}
                onCreatePoll={(question, options) => socket.emit('create_poll', { question, options })}
                onSendMessage={handleSendChat}
                onToggleReaction={handleToggleMessageReaction}
                onSendReaction={handleSendReaction}
                typingUsers={typingUsers}
                onTypingChange={handleTypingChange}
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
      <FloatingReactions
        socket={socket}
        username={username}
        avatarId={userSettings.avatarId}
        currentTime={currentTime}
        userRole={userRole}
      />

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

      {/* V2 Auth / Profile Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        apiUrl={apiUrl}
        onAuthSuccess={(user, token) => {
          setCurrentUser(user);
          authStorage.setUser(user);
          authStorage.setToken(token);
        }}
        onLogout={() => {
          setCurrentUser(null);
          authStorage.clearToken();
          authStorage.clearUser();
        }}
        onNotify={onNotify}
      />

      {/* V2 Sync Diagnostics Modal */}
      <SyncDiagnosticsModal
        isOpen={isDiagnosticsModalOpen}
        onClose={() => setIsDiagnosticsModalOpen(false)}
        syncState={universalSyncState}
        driftAssessment={driftAssessment}
        rttMs={50}
        connectionStatus={connectionStatus}
      />

      {/* V2 Universal Browser & Cinema Hub Modal */}
      <BrowserHubModal
        isOpen={isBrowserHubOpen}
        onClose={() => setIsBrowserHubOpen(false)}
        userRole={userRole}
        extensionInstalled={extensionInstalled}
        onSelectMedia={(url, title) => {
          emitChangeVideo(url, true);
          addActivity(`Selected stream: ${title || url}`, 'playback');
          onNotify(`Now playing: ${title || url}`, 'success');
        }}
        onNotify={onNotify}
      />

      {/* Share Stream Modal */}
      <ShareStreamModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomId={roomId}
        streamTitle={
          syncState?.mediaIdentity?.title ||
          playlist.find((p) => p.videoId === videoId)?.title ||
          (videoId ? detectClientMedia(videoId)?.title || 'Live Cinema Stream' : `${participants.find((p) => p.role === 'HOST')?.username || username}'s Live Watch Party`)
        }
        onNotify={onNotify}
      />

      {/* Report Stream Modal */}
      <ReportStreamModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        roomId={roomId}
        streamTitle={
          syncState?.mediaIdentity?.title ||
          playlist.find((p) => p.videoId === videoId)?.title ||
          (videoId ? detectClientMedia(videoId)?.title || 'Live Cinema Stream' : `${participants.find((p) => p.role === 'HOST')?.username || username}'s Live Watch Party`)
        }
        currentTime={currentTime}
        onNotify={onNotify}
      />
    </div>
  );
};
