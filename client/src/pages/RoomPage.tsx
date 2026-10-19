import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
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
  emitPlaylistAddBatch,
  emitPlaylistRemove,
  emitPlaylistReorder,
  emitPlaylistMoveTop,
  emitPlaylistVote,
  emitPlaylistShuffle,
  emitPlaylistClear,
  emitAdminToggleBlockCall,
  emitAdminToggleBlockChat,
  emitAdminToggleBlockScreenShare,
  emitAdminForceStopScreenShare,
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
  emitStartTabStream,
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
import { Chat } from '../components/Chat.js';
import { ActionRequestsPanel } from '../components/ActionRequestsPanel.js';
import { ReactionOverlay } from '../components/ReactionOverlay.js';
import { FloatingReactions } from '../components/FloatingReactions.js';
import { ExtensionStatusBanner } from '../components/ExtensionStatusBanner.js';
import { VideoAmbientBackdrop } from '../components/VideoAmbientBackdrop.js';
import { detectClientMedia } from '../utils/media.js';
import { authStorage } from '../utils/authStorage.js';
import { getApiUrl } from '../utils/api.js';
import { getRoomIdentityToken, saveRoomIdentityToken } from '../utils/identity.js';
import { saveStoredParty } from '../utils/partyStorage.js';
import { rememberParticipantCharacter, subscribeCharacterUpdates, getParticipantCharacterId } from '../utils/characterMemory.js';
import { StreamEndedOverlay } from '../components/StreamEndedOverlay.js';
import { LucideIcon, Users, ListMusic, Activity, MessageSquare, Bell, Check, X, Search, Film, Globe, RefreshCw, Radio, ChevronLeft, ChevronRight, Monitor, Share2, Volume2, SlidersHorizontal, Settings, LogOut } from 'lucide-react';
import {
  playRequestAlertSound,
  playMessageReceiveSound,
  playReactSound,
  playUserJoinSound,
  playUserLeaveSound,
  playLinkCopySound,
  playSoundboardEffect,
  SoundboardEffectId,
} from '../utils/soundEffects.js';
import { firePartyConfetti } from '../utils/confetti.js';
import { MobileBottomNav, MobileTab } from '../components/MobileBottomNav.js';
import { MobileDrawer } from '../components/MobileDrawer.js';
import { SoundboardModal } from '../components/SoundboardModal.js';

const SettingsModal = lazy(() => import('../components/SettingsModal.js').then(({ SettingsModal }) => ({ default: SettingsModal })));
const FeatureControlsModal = lazy(() => import('../components/FeatureControlsModal.js').then(({ FeatureControlsModal }) => ({ default: FeatureControlsModal })));
import { YouTubeSearchModal } from '../components/YouTubeSearchModal.js';
const InviteModal = lazy(() => import('../components/InviteModal.js').then(({ InviteModal }) => ({ default: InviteModal })));
const AuthModal = lazy(() => import('../components/AuthModal.js').then(({ AuthModal }) => ({ default: AuthModal })));
const SyncDiagnosticsModal = lazy(() => import('../components/SyncDiagnosticsModal.js').then(({ SyncDiagnosticsModal }) => ({ default: SyncDiagnosticsModal })));
import { useFeatureFlags } from '../utils/featureFlags.js';
import { BrowserHubModal } from '../components/BrowserHubModal.js';
import { DirectVideoPlayer } from '../components/DirectVideoPlayer.js';
import { CinemaStageCard } from '../components/CinemaStageCard.js';
import { RoomTabPlayer } from '../components/RoomTabPlayer.js';
import { RoomBrowserPlayer } from '../components/RoomBrowserPlayer.js';
import { ShareStreamModal } from '../components/ShareStreamModal.js';
import { ReportStreamModal } from '../components/ReportStreamModal.js';
import { StreamInfoBar } from '../components/StreamInfoBar.js';
import { CallOverlay } from '../components/CallOverlay.js';
import { SidebarCallStage } from '../components/SidebarCallStage.js';
import { webrtcCallManager } from '../services/webrtcCallManager.js';
import { extractYouTubePlaylistId } from '../utils/youtube.js';

interface RoomPageProps {
  roomId: string;
  username: string;
  userId: string;
  onLeaveRoom: () => void;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type TabId = 'participants' | 'playlist' | 'chat' | 'search' | 'requests' | 'activity';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'participants', label: 'Viewers', icon: Users },
  { id: 'playlist', label: 'Playlist', icon: ListMusic },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'search', label: 'Search', icon: Search },
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

  // Feature Flags & Modular Toggle State
  const [featureFlags, updateFeatureFlag] = useFeatureFlags();
  const [isFeatureControlsOpen, setIsFeatureControlsOpen] = useState<boolean>(false);
  const [isSoundboardOpen, setIsSoundboardOpen] = useState<boolean>(false);
  const [mobileDrawerTab, setMobileDrawerTab] = useState<MobileTab | null>(null);
  const [hasUnreadChat, setHasUnreadChat] = useState<boolean>(false);

  // Active Sidebar Tab: 'participants' | 'playlist' | 'chat' | 'requests' | 'activity'
  const [activeSidebarTab, setActiveSidebarTab] = useState<TabId>('participants');

  // Filter tabs dynamically based on feature flags (core 'participants' and 'search' are always kept)
  const availableTabs = React.useMemo(() => {
    return TABS.filter((tab) => {
      if (tab.id === 'chat' && !featureFlags.chat) return false;
      if (tab.id === 'playlist' && !featureFlags.playlist) return false;
      if (tab.id === 'requests' && !featureFlags.actionRequests) return false;
      if (tab.id === 'activity' && !featureFlags.activityFeed) return false;
      return true;
    });
  }, [featureFlags.chat, featureFlags.playlist, featureFlags.actionRequests, featureFlags.activityFeed]);

  // If the active tab gets toggled off, smoothly fallback to 'participants' without crashing
  useEffect(() => {
    const isTabValid = availableTabs.some((t) => t.id === activeSidebarTab);
    if (!isTabValid) {
      setActiveSidebarTab('participants');
    }
  }, [availableTabs, activeSidebarTab]);

  const tabBarRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkTabScroll = useCallback(() => {
    const el = tabBarRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  }, []);

  // Scroll active tab into view when changed and check scroll indicators
  useEffect(() => {
    const activeBtn = tabBarRef.current?.querySelector('.sidebar-tab-btn.active');
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    const timer = setTimeout(checkTabScroll, 150);
    return () => clearTimeout(timer);
  }, [activeSidebarTab, checkTabScroll]);

  useEffect(() => {
    checkTabScroll();
    const el = tabBarRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkTabScroll, { passive: true });
    window.addEventListener('resize', checkTabScroll);
    return () => {
      el.removeEventListener('scroll', checkTabScroll);
      window.removeEventListener('resize', checkTabScroll);
    };
  }, [checkTabScroll]);

  const handleTabBarWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const tabBar = event.currentTarget;
    const scrollDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (tabBar.scrollWidth <= tabBar.clientWidth || scrollDelta === 0) return;

    tabBar.scrollLeft += scrollDelta;
    checkTabScroll();
  }, [checkTabScroll]);

  const handleScrollTabs = useCallback((direction: 'left' | 'right') => {
    const el = tabBarRef.current;
    if (!el) return;
    const amount = direction === 'left' ? -150 : 150;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(checkTabScroll, 200);
  }, [checkTabScroll]);

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
  const [settingsInitialTab, setSettingsInitialTab] = useState<'room' | 'user' | 'features' | 'audio'>('room');

  const handleOpenSettings = (tab: 'room' | 'user' | 'features' | 'audio' = 'room') => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  // New Features: Theater Mode, Invite Modal, YouTube Search Modal
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState<boolean>(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(100);
  const [latencyMode, setLatencyMode] = useState<'ultra_low' | 'low' | 'normal'>('low');
  const [isStreamEnded, setIsStreamEnded] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [streamStartedAt, setStreamStartedAt] = useState<number>(() => Date.now());
  const [streamCategory, setStreamCategory] = useState<string>('cinema');
  const [roomLikes, setRoomLikes] = useState<number>(0);
  const [hasLikedRoom, setHasLikedRoom] = useState<boolean>(false);
  const [roomUptimeSeconds, setRoomUptimeSeconds] = useState<number>(0);

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

  const [streamDescription, setStreamDescription] = useState<string>(() => {
    try {
      return localStorage.getItem(`synctube_room_desc_${roomId}`) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (syncState?.description) {
      setStreamDescription(syncState.description);
    }
  }, [syncState?.description]);

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
    const onDescriptionUpdated = (data: { description: string }) => {
      if (typeof data?.description === 'string') {
        setStreamDescription(data.description);
        try {
          localStorage.setItem(`synctube_room_desc_${roomId}`, data.description);
        } catch {}
      }
    };
    socket.on('room:likes_updated', onLikesUpdated);
    socket.on('room:category_updated', onCategoryUpdated);
    socket.on('room:description_updated', onDescriptionUpdated);
    return () => {
      socket.off('room:likes_updated', onLikesUpdated);
      socket.off('room:category_updated', onCategoryUpdated);
      socket.off('room:description_updated', onDescriptionUpdated);
    };
  }, [userId, roomId]);

  const handleToggleRoomLike = useCallback(() => {
    emitToggleRoomLike();
  }, []);

  const handleSetCategory = useCallback((cat: string) => {
    setStreamCategory(cat);
    emitSetRoomCategory(cat);
  }, []);

  const handleUpdateDescription = useCallback((newDesc: string) => {
    setStreamDescription(newDesc);
    try {
      localStorage.setItem(`synctube_room_desc_${roomId}`, newDesc);
    } catch {}
    if (socket) {
      socket.emit('room:set_description', { description: newDesc });
    }
  }, [roomId]);

  const [roomTags, setRoomTags] = useState<string[]>(['#WatchParty', '#SyncTubeLive', '#CinemaHub']);

  const handleUpdateTags = useCallback((newTags: string[]) => {
    setRoomTags(newTags);
    if (socket) {
      socket.emit('room:set_tags', { tags: newTags });
    }
  }, []);

  // V2 Features State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authStorage.getUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState<boolean>(false);
  const [universalSyncState, setUniversalSyncState] = useState<UniversalPlaybackState | null>(null);
  const [readinessList, setReadinessList] = useState<ParticipantReadiness[]>([]);
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

  const handleRetryConnection = useCallback(() => {
    setConnectionStatus('connecting');
    if (!socket.connected) {
      socket.connect();
    } else {
      const activeAvatar =
        userSettings.avatarId ||
        localStorage.getItem('synctube_avatar_id') ||
        getParticipantCharacterId(userSettings.name || username) ||
        'luffy';
      emitJoinRoom(roomId, userSettings.name || username, userId, activeAvatar, getRoomIdentityToken(roomId));
    }
  }, [roomId, username, userId, userSettings.name, userSettings.avatarId]);

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
      if (Array.isArray(data.tags) && data.tags.length > 0) {
        setRoomTags(data.tags);
      }
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
      } else {
        playUserJoinSound();
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
      if (data.userId !== userId) {
        playUserLeaveSound();
      }
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
      playRequestAlertSound();
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
      if (data.userId !== userId) {
        playMessageReceiveSound();
        setHasUnreadChat(true);
      }
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
      playReactSound(data.emoji);
      if (data.emoji === '🎉') {
        firePartyConfetti({ particleCount: 35 });
      }
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

    const onSoundEffectReceived = (data: { soundId: SoundboardEffectId; username: string }) => {
      playSoundboardEffect(data.soundId);
      if (data.soundId === 'cheer' || data.soundId === 'applause') {
        firePartyConfetti({ particleCount: 30 });
      }
      onNotifyRef.current(`🔊 @${data.username} played ${data.soundId}!`, 'info');
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
        const currentPos = ytPlayerRef.current?.getCurrentTime?.() ?? 0;
        if (Math.abs(currentPos - data.targetPosition) > 15) {
          ytPlayerRef.current?.seekTo(data.targetPosition, true);
        }
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

    const onTagsUpdated = (data: { tags: string[] }) => {
      if (Array.isArray(data?.tags)) {
        setRoomTags(data.tags);
      }
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
    socket.on('room:tags_updated', onTagsUpdated);
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
    socket.on('sound_effect_received', onSoundEffectReceived);
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

    const onCallJoinApproved = (data: { approvedBy?: string }) => {
      onNotifyRef.current(`🎉 ${data.approvedBy || 'Host'} approved your request to join the call! Connecting...`, 'success');
      webrtcCallManager.joinCall({ audio: true, video: false });
    };
    const onCallJoinDenied = (data: { deniedBy?: string }) => {
      onNotifyRef.current(`❌ ${data.deniedBy || 'Host'} declined your request to join the call.`, 'error');
    };
    const onCallForceLeft = () => {
      onNotifyRef.current('⚠️ You have been removed from the voice & video call by the room host.', 'error');
      webrtcCallManager.leaveCall();
    };
    const onCallForceStopShare = () => {
      onNotifyRef.current('🛑 Your screen share has been stopped by the room host.', 'info');
    };

    socket.on('call:join_approved', onCallJoinApproved);
    socket.on('call:join_denied', onCallJoinDenied);
    socket.on('call:force_left', onCallForceLeft);
    socket.on('call:force_stop_screenshare', onCallForceStopShare);

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
      socket.off('room:tags_updated', onTagsUpdated);
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
      socket.off('sound_effect_received', onSoundEffectReceived);
      socket.off('playback_speed_updated', onPlaybackSpeedUpdated);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('role_assigned', onRoleAssigned);
      socket.off('participant_removed', onParticipantRemoved);
      socket.off('participant_avatar_updated', onAvatarUpdated);
      socket.off('error', onError);
      socket.off('room:went_live', onWentLive);
      socket.off('identity_credential', onIdentityCredential);
      socket.off('call:join_approved', onCallJoinApproved);
      socket.off('call:join_denied', onCallJoinDenied);
      socket.off('call:force_left', onCallForceLeft);
      socket.off('call:force_stop_screenshare', onCallForceStopShare);
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

  const handleToggleBlockCall = useCallback((targetUserId: string) => {
    emitAdminToggleBlockCall(targetUserId);
  }, []);

  const handleToggleBlockChat = useCallback((targetUserId: string) => {
    emitAdminToggleBlockChat(targetUserId);
  }, []);

  const handleToggleBlockScreenShare = useCallback((targetUserId: string) => {
    emitAdminToggleBlockScreenShare(targetUserId);
  }, []);

  const handleStartScreenShare = useCallback(() => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      onNotify('Screen sharing is not supported on this browser or mobile device. You can still watch screens shared by other participants!', 'info');
      return;
    }
    try {
      sessionStorage.setItem('synctube_pending_screen_share', 'true');
    } catch {}
    emitStartTabStream(`${username}'s Screen`, (res) => {
      if (!res?.success) {
        try {
          sessionStorage.removeItem('synctube_pending_screen_share');
        } catch {}
        onNotify(res?.error || 'Could not start screen share.', 'error');
      } else {
        window.postMessage({ type: 'SYNCTUBE_START_TAB_SHARE', tabTitle: `${username}'s Screen` }, '*');
        onNotify('Screen share started on main stage!', 'success');
      }
    });
  }, [username, onNotify]);

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
    }, 2500);
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
    onNotify('🚀 Broadcast started! Room is now streaming live 🎬', 'success');
  }, [isRoomLive, onNotify]);

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
  const handleImportPlaylist = useCallback(
    async (playlistUrlOrId: string) => {
      if (userRole !== 'HOST' && userRole !== 'MODERATOR') {
        onNotify('👑 Only host & moderators can import playlists into the queue.', 'error');
        return;
      }
      const playlistId = extractYouTubePlaylistId(playlistUrlOrId) || playlistUrlOrId.trim();
      if (!playlistId) {
        onNotify('Invalid playlist link or ID', 'error');
        return;
      }
      onNotify('Fetching playlist videos...', 'info');
      try {
        const primaryApiUrl = getApiUrl();
        const endpoint = primaryApiUrl
          ? `${primaryApiUrl}/api/youtube/playlist?url=${encodeURIComponent(playlistUrlOrId)}`
          : `/api/youtube/playlist?url=${encodeURIComponent(playlistUrlOrId)}`;

        let resp = await fetch(endpoint);
        if (!resp.ok) {
          resp = await fetch(`https://synctube-2ar4.onrender.com/api/youtube/playlist?url=${encodeURIComponent(playlistUrlOrId)}`);
        }
        if (!resp.ok) {
          throw new Error(`Failed to fetch playlist (status ${resp.status})`);
        }
        const data = await resp.json();
        if (!data.videos || data.videos.length === 0) {
          onNotify('No videos found in this playlist.', 'error');
          return;
        }
        emitPlaylistAddBatch(data.videos);
        addActivity(`${username} imported ${data.videos.length} videos from playlist`, 'playlist', {
          username,
          userId,
          avatarId: userSettings.avatarId,
        });
        onNotify(`✨ Successfully imported ${data.videos.length} videos from playlist!`, 'success');
      } catch (err: any) {
        onNotify(`Could not import playlist: ${err?.message || 'Error'}`, 'error');
      }
    },
    [userRole, onNotify, addActivity, username, userId, userSettings.avatarId]
  );

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
    if (extractYouTubePlaylistId(targetVideoId)) {
      handleImportPlaylist(targetVideoId);
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
      const myParticipant = participants.find((p) => p.userId === userId);
      if (myParticipant?.isBlockedFromChat) {
        onNotify('You have been restricted from sending messages in chat by the host.', 'error');
        return;
      }
      emitSendChat(text, userSettings.color, userSettings.avatarId, replyTo);
    },
    [participants, userId, userSettings.color, userSettings.avatarId, onNotify]
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
          <span>{connectionStatus === 'connecting' ? 'Connecting to room…' : 'Connection lost — reconnecting…'}</span>
          <button type="button" className="connection-retry-btn" onClick={handleRetryConnection} title="Retry connection">
            <RefreshCw size={11} className={connectionStatus === 'connecting' ? 'spin-icon' : ''} />
            <span>Retry</span>
          </button>
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
        onOpenSettings={() => handleOpenSettings('room')}
        onOpenInvite={() => setIsInviteModalOpen(true)}
        onOpenSearch={() => setIsSearchModalOpen(true)}
        onOpenDiagnostics={featureFlags.syncDiagnostics ? () => setIsDiagnosticsModalOpen(true) : undefined}
        showDiagnostics={featureFlags.syncDiagnostics}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenBrowserHub={featureFlags.browserHub ? () => setIsBrowserHubOpen(true) : undefined}
        currentUser={currentUser}
        isTheaterMode={isTheaterMode || featureFlags.theaterMode}
        onToggleTheater={handleToggleTheaterMode}
        syncState={syncState}
        currentTime={currentTime}
        onResync={handleResync}
      />

      <main className="room-container">
        {/* Left Side: Large Theater Video Stage with YouTube Ambient Lighting & Floating Overlay Controls */}
        <div className="stage-area">

          {/* Floating Host Approval Alert Banner for incoming Participant requests */}
          {featureFlags.actionRequests && pendingRequests.length > 0 && (userRole === 'HOST' || userRole === 'MODERATOR') && (
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
              isEnabled={ambientMode && featureFlags.ambientGlow}
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
                {featureFlags.floatingReactions && <ReactionOverlay reactions={activeReactions} />}

                

                {videoId ? (
                  (() => {
                    // 1. Temporary Browser Cloud Stream
                    if (videoId.startsWith('tb:') || syncState?.browserSession?.sessionId) {
                      const sId = syncState?.browserSession?.sessionId || videoId.replace(/^tb:/, '');
                      return (
                        <RoomBrowserPlayer
                          roomId={roomId}
                          sessionId={sId}
                          userRole={userRole}
                          guestControl={!!syncState?.browserSession?.guestControl}
                          currentUrl={syncState?.browserSession?.currentUrl}
                          currentTitle={syncState?.browserSession?.currentTitle}
                          onNotify={onNotify}
                          onOpenBrowserHub={() => setIsBrowserHubOpen(true)}
                        />
                      );
                    }

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
                    <div className="video-empty-state origin-cinema-stage">
                      <div className="origin-stage-halo">
                        <Radio size={28} />
                      </div>
                      <div className="cinema-waiting-indicator">
                        <span className="cinema-live-dot" />
                        <span>BROADCAST STANDBY</span>
                      </div>
                      <h3 className="origin-stage-title">Waiting for the Host</h3>
                      <p className="origin-stage-subtitle">
                        The room host will queue up media shortly. Sit tight or chat with other viewers!
                      </p>
                    </div>
                  ) : (
                    <div className="video-empty-state origin-cinema-stage">
                      <div className="origin-stage-halo">
                        <Film size={28} />
                      </div>
                      <h3 className="origin-stage-title">
                        {userRole === 'HOST' || userRole === 'MODERATOR'
                          ? 'Theater Ready — Choose What to Watch'
                          : 'Theater Stage Ready'}
                      </h3>
                      <p className="origin-stage-subtitle">
                        {userRole === 'HOST' || userRole === 'MODERATOR'
                          ? 'Search YouTube, share your device screen, or stream direct web media in real-time synchronization.'
                          : 'Waiting for the host to select media. You can also share your screen or stream web media.'}
                      </p>
                      <div className="origin-stage-actions">
                        {(userRole === 'HOST' || userRole === 'MODERATOR') && (
                          <button
                            type="button"
                            className="origin-primary-action-btn"
                            onClick={() => setIsSearchModalOpen(true)}
                          >
                            <Search size={16} />
                            <span>Search YouTube</span>
                          </button>
                        )}
                        {featureFlags.screenShare && (
                          <button
                            type="button"
                            className="origin-secondary-action-btn"
                            onClick={handleStartScreenShare}
                            title="Share your device screen or browser tab to the room"
                          >
                            <Monitor size={16} />
                            <span>Share Screen</span>
                          </button>
                        )}
                        {featureFlags.browserHub && (
                          <button
                            type="button"
                            className="origin-secondary-action-btn"
                            onClick={() => setIsBrowserHubOpen(true)}
                            title="Open Direct Stream & Web Media (MP4, HLS m3u8, Netflix, Prime)"
                          >
                            <Globe size={16} />
                            <span>Direct Stream & Web Media</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}



                {/* Reconnecting to Live Broadcast Banner - only during active video media */}
                {connectionStatus !== 'connected' && Boolean(videoId) && (
                  <div className="player-reconnecting-banner">
                    <RefreshCw size={13} className="spin-icon" />
                    <span>Re-syncing stream…</span>
                    <button type="button" className="btn btn-xs banner-retry-btn" onClick={handleResync}>
                      Resync
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
                      reactionControl={featureFlags.floatingReactions ? <FloatingReactions socket={socket} username={username} avatarId={userSettings.avatarId} currentTime={currentTime} userRole={userRole} inline alwaysExpanded /> : undefined}
                      roomUptimeSeconds={roomUptimeSeconds}
                    />
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Mobile Controller Dock - on mobile phone view this is placed above stream-info-card for instant player access; hidden on desktop */}
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
              roomUptimeSeconds={roomUptimeSeconds}
            />
          </div>

          {/* Live Stream Metadata Bar & Experience Info below stage (and below controls dock on phone view) */}
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
            description={streamDescription || syncState?.description}
            onUpdateDescription={handleUpdateDescription}
            tags={roomTags}
            onUpdateTags={handleUpdateTags}
            likes={roomLikes}
            hasLiked={hasLikedRoom}
            onToggleLike={handleToggleRoomLike}
            isHostRegistered={Boolean(
              userRole === 'HOST' ||
              participants.some((p) => p.role === 'HOST') ||
              (currentUser?.id && currentUser?.email)
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

        {/* Right Side: Sidebar with Participants, Playlist, and Activity */}
        <aside className="sidebar">

          {/* Zoom / Google Meet Style Voice & Video Call Stage above Tab Bar */}
          {featureFlags.voiceVideoCall && (
            <SidebarCallStage
              currentUserId={userId}
              currentUsername={username}
              currentUserAvatarId={userSettings.avatarId}
              userRole={userRole}
              isBlockedFromCall={participants.find((p) => p.userId === userId)?.isBlockedFromCall}
              onRequestAction={(type) => handleRequestAction(type)}
              onNotify={onNotify}
            />
          )}

          {/* Button-style Segmented Tab Bar with smooth horizontal navigation */}
          <div className="sidebar-tab-wrapper">
            {canScrollLeft && (
              <button
                type="button"
                className="sidebar-tab-scroll-arrow left"
                onClick={() => handleScrollTabs('left')}
                title="Scroll tabs left"
                aria-label="Scroll tabs left"
              >
                <ChevronLeft size={14} />
              </button>
            )}
            <div
              className={`sidebar-tab-bar ${canScrollLeft ? 'has-left-shadow' : ''} ${canScrollRight ? 'has-right-shadow' : ''}`}
              role="tablist"
              ref={tabBarRef}
              onWheel={handleTabBarWheel}
            >
              {availableTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeSidebarTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`sidebar-tab-btn motion-tab-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveSidebarTab(tab.id)}
                  >
                    <Icon size={14} />
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
            {canScrollRight && (
              <button
                type="button"
                className="sidebar-tab-scroll-arrow right"
                onClick={() => handleScrollTabs('right')}
                title="Scroll tabs right"
                aria-label="Scroll tabs right"
              >
                <ChevronRight size={14} />
              </button>
            )}
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
                onAssignRole={handleAssignRole}
                onRemoveParticipant={handleRemoveParticipant}
                onToggleBlockCall={handleToggleBlockCall}
                onToggleBlockChat={handleToggleBlockChat}
                onToggleBlockScreenShare={handleToggleBlockScreenShare}
              />
            )}

            {activeSidebarTab === 'playlist' && (
              <Playlist
                playlist={playlist}
                currentVideoId={videoId}
                userRole={userRole}
                currentUserId={userId}
                onAddToPlaylist={handleAddToPlaylist}
                onImportPlaylist={handleImportPlaylist}
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

            {activeSidebarTab === 'search' && (
              <Suspense fallback={<div className="yt-search-loading">Loading search...</div>}>
                <YouTubeSearchModal
                  isOpen
                  inline
                  onClose={() => setActiveSidebarTab('participants')}
                  userRole={userRole}
                  onPlayVideo={(newVid) => emitChangeVideo(newVid, true)}
                  onAddToPlaylist={handleAddToPlaylist}
                  onAddPlaylistBatch={(items) => emitPlaylistAddBatch(items)}
                  onRequestAction={(type, data) => handleRequestAction(type, data)}
                  onNotify={onNotify}
                />
              </Suspense>
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

      {/* Modular Feature Controls & Switches Modal */}
      {isFeatureControlsOpen && (
        <Suspense fallback={null}>
          <FeatureControlsModal
            isOpen
            onClose={() => setIsFeatureControlsOpen(false)}
          />
        </Suspense>
      )}

      {/* Settings Modal (Room, User, Audio/Soundboard, and Feature Switches tabs) */}
      {isSettingsOpen && <Suspense fallback={null}><SettingsModal
        isOpen
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
        initialTab={settingsInitialTab}
        socket={socket}
        onNotify={onNotify}
      /></Suspense>}


      {/* In-App YouTube Search Modal */}
      {isSearchModalOpen && <YouTubeSearchModal
        isOpen
        onClose={() => setIsSearchModalOpen(false)}
        userRole={userRole}
        onPlayVideo={(newVid) => emitChangeVideo(newVid, true)}
        onAddToPlaylist={handleAddToPlaylist}
        onAddPlaylistBatch={(items) => emitPlaylistAddBatch(items)}
        onRequestAction={(type, data) => handleRequestAction(type, data)}
        onNotify={onNotify}
      />}

      {/* Friends Invite & QR Code Modal */}
      {isInviteModalOpen && <Suspense fallback={null}><InviteModal
        isOpen
        onClose={() => setIsInviteModalOpen(false)}
        roomId={roomId}
        onNotify={onNotify}
      /></Suspense>}

      {/* V2 Auth / Profile Modal */}
      {isAuthModalOpen && <Suspense fallback={null}><AuthModal
        isOpen
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
      /></Suspense>}

      {/* V2 Sync Diagnostics Modal */}
      {isDiagnosticsModalOpen && <Suspense fallback={null}><SyncDiagnosticsModal
        isOpen
        onClose={() => setIsDiagnosticsModalOpen(false)}
        syncState={universalSyncState}
        driftAssessment={driftAssessment}
        rttMs={50}
        connectionStatus={connectionStatus}
      /></Suspense>}

      {/* V2 Universal Browser & Cinema Hub Modal */}
      {isBrowserHubOpen && <BrowserHubModal
        isOpen
        onClose={() => setIsBrowserHubOpen(false)}
        userRole={userRole}
        extensionInstalled={extensionInstalled}
        onSelectMedia={(url, title) => {
          emitChangeVideo(url, true);
          addActivity(`Selected stream: ${title || url}`, 'playback');
          onNotify(`Now playing: ${title || url}`, 'success');
        }}
        onNotify={onNotify}
      />}

      {/* Share Stream Modal */}
      {isShareModalOpen && <ShareStreamModal
        isOpen
        onClose={() => setIsShareModalOpen(false)}
        roomId={roomId}
        streamTitle={
          syncState?.mediaIdentity?.title ||
          playlist.find((p) => p.videoId === videoId)?.title ||
          (videoId ? detectClientMedia(videoId)?.title || 'Live Cinema Stream' : `${participants.find((p) => p.role === 'HOST')?.username || username}'s Live Watch Party`)
        }
        onNotify={onNotify}
      />}

      {/* Report Stream Modal */}
      {isReportModalOpen && <ReportStreamModal
        isOpen
        onClose={() => setIsReportModalOpen(false)}
        roomId={roomId}
        streamTitle={
          syncState?.mediaIdentity?.title ||
          playlist.find((p) => p.videoId === videoId)?.title ||
          (videoId ? detectClientMedia(videoId)?.title || 'Live Cinema Stream' : `${participants.find((p) => p.role === 'HOST')?.username || username}'s Live Watch Party`)
        }
        currentTime={currentTime}
        onNotify={onNotify}
      />}

      {/* Adaptive Voice & Video Chat Floating Dock (shown only when in Theater Mode where sidebar is hidden) */}
      {isTheaterMode && (
        <CallOverlay
          currentUserId={userId}
          currentUsername={username}
          currentUserAvatarId={participants.find((p) => p.userId === userId)?.avatarId}
          userRole={userRole}
          onNotify={onNotify}
        />
      )}

      {/* Interactive Soundboard Modal */}
      <SoundboardModal
        isOpen={isSoundboardOpen}
        onClose={() => setIsSoundboardOpen(false)}
        socket={socket}
        onNotify={onNotify}
      />

      {/* Mobile-First Bottom Navigation (Viewports <= 768px) */}
      <MobileBottomNav
        activeTab={mobileDrawerTab || 'stage'}
        onSelectTab={(tab) => {
          if (tab === 'stage') {
            setMobileDrawerTab(null);
          } else if (tab === 'soundboard') {
            handleOpenSettings('audio');
          } else {
            setMobileDrawerTab(tab);
            if (tab === 'chat') setHasUnreadChat(false);
          }
        }}
        hasUnreadChat={hasUnreadChat}
        playlistCount={playlist.length}
        viewerCount={participants.length}
      />

      {/* Mobile Bottom Drawers (Vaul-inspired, swipeable, accessible) */}
      <MobileDrawer
        isOpen={mobileDrawerTab === 'chat'}
        onClose={() => setMobileDrawerTab(null)}
        title="Live Watch Party Chat"
      >
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
      </MobileDrawer>

      <MobileDrawer
        isOpen={mobileDrawerTab === 'playlist'}
        onClose={() => setMobileDrawerTab(null)}
        title="Room Playlist"
      >
        <Playlist
          playlist={playlist}
          currentVideoId={videoId}
          userRole={userRole}
          currentUserId={userId}
          onAddToPlaylist={handleAddToPlaylist}
          onImportPlaylist={handleImportPlaylist}
          onPlayItem={handlePlayItem}
          onNextVideo={handleNextVideo}
          onRemoveItem={handleRemovePlaylistItem}
          onMoveToTop={handleMoveToTop}
          onReorderPlaylist={handleReorderPlaylist}
          onVoteItem={handleVoteItem}
          onShuffle={handleShufflePlaylist}
          onClear={handleClearPlaylist}
          onOpenSearch={() => {
            setMobileDrawerTab(null);
            setIsSearchModalOpen(true);
          }}
        />
      </MobileDrawer>

      <MobileDrawer
        isOpen={mobileDrawerTab === 'viewers'}
        onClose={() => setMobileDrawerTab(null)}
        title={`Viewers (${participants.length})`}
      >
        <ParticipantList
          participants={participants}
          currentUserId={userId}
          currentUserRole={userRole}
          currentUserAvatarId={userSettings.avatarId}
          readinessList={readinessList}
          onAssignRole={handleAssignRole}
          onRemoveParticipant={handleRemoveParticipant}
          onToggleBlockCall={handleToggleBlockCall}
          onToggleBlockChat={handleToggleBlockChat}
          onToggleBlockScreenShare={handleToggleBlockScreenShare}
        />
      </MobileDrawer>

      <MobileDrawer
        isOpen={mobileDrawerTab === 'more'}
        onClose={() => setMobileDrawerTab(null)}
        title="Watch Party Hub & Tools"
      >
        <div className="mobile-hub-grid">
          <button
            type="button"
            className="mobile-hub-btn"
            onClick={() => {
              setMobileDrawerTab(null);
              setIsInviteModalOpen(true);
            }}
          >
            <div className="mobile-hub-icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
              <Share2 size={24} />
            </div>
            <span className="mobile-hub-label">Invite Friends</span>
            <span className="mobile-hub-subtext">Share link & QR code</span>
          </button>

          <button
            type="button"
            className="mobile-hub-btn"
            onClick={() => {
              setMobileDrawerTab(null);
              handleOpenSettings('audio');
            }}
          >
            <div className="mobile-hub-icon-wrapper" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>
              <Volume2 size={24} />
            </div>
            <span className="mobile-hub-label">Soundboard FX</span>
            <span className="mobile-hub-subtext">Applause, cheer, horns</span>
          </button>

          <button
            type="button"
            className="mobile-hub-btn"
            onClick={() => {
              setMobileDrawerTab(null);
              setIsSearchModalOpen(true);
            }}
          >
            <div className="mobile-hub-icon-wrapper" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
              <Search size={24} />
            </div>
            <span className="mobile-hub-label">Search YouTube</span>
            <span className="mobile-hub-subtext">Find & queue videos</span>
          </button>

          <button
            type="button"
            className="mobile-hub-btn"
            onClick={() => {
              setMobileDrawerTab(null);
              handleOpenSettings('room');
            }}
          >
            <div className="mobile-hub-icon-wrapper" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
              <Settings size={24} />
            </div>
            <span className="mobile-hub-label">Room & User Settings</span>
            <span className="mobile-hub-subtext">Passcode, themes & profile</span>
          </button>

          <button
            type="button"
            className="mobile-hub-btn"
            onClick={() => {
              setMobileDrawerTab(null);
              handleOpenSettings('features');
            }}
          >
            <div className="mobile-hub-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <SlidersHorizontal size={24} />
            </div>
            <span className="mobile-hub-label">Feature Switches</span>
            <span className="mobile-hub-subtext">Modular system switches</span>
          </button>

          <button
            type="button"
            className="mobile-hub-btn danger"
            onClick={() => {
              setMobileDrawerTab(null);
              onLeaveRoom();
            }}
          >
            <div className="mobile-hub-icon-wrapper" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
              <LogOut size={24} />
            </div>
            <span className="mobile-hub-label">Leave Room</span>
            <span className="mobile-hub-subtext">Exit back to lobby</span>
          </button>
        </div>
      </MobileDrawer>
    </div>
  );
};
