import { useState, useEffect, useCallback } from 'react';

export interface RoomFeatureFlags {
  ambientGlow: boolean;
  floatingReactions: boolean;
  soundEffects: boolean;
  voiceVideoCall: boolean;
  screenShare: boolean;
  chat: boolean;
  playlist: boolean;
  actionRequests: boolean;
  activityFeed: boolean;
  browserHub: boolean;
  syncDiagnostics: boolean;
  theaterMode: boolean;
  autoResync: boolean;
}

export type FeatureFlagKey = keyof RoomFeatureFlags;

export interface FeatureMetadata {
  key: FeatureFlagKey;
  label: string;
  description: string;
  category: 'visual' | 'communication' | 'media' | 'system';
  isSafeToToggle: boolean;
}

export const FEATURE_METADATA: Record<FeatureFlagKey, FeatureMetadata> = {
  ambientGlow: {
    key: 'ambientGlow',
    label: 'Ambient Glow Backdrop',
    description: 'Dynamic cinema lighting behind video player',
    category: 'visual',
    isSafeToToggle: true,
  },
  floatingReactions: {
    key: 'floatingReactions',
    label: 'Floating Emoji Reactions',
    description: 'Flying reaction particles and inline emoji reaction bar',
    category: 'visual',
    isSafeToToggle: true,
  },
  theaterMode: {
    key: 'theaterMode',
    label: 'Theater Dim Mode',
    description: 'Dim surrounding room lights for cinematic viewing',
    category: 'visual',
    isSafeToToggle: true,
  },
  voiceVideoCall: {
    key: 'voiceVideoCall',
    label: 'Voice & Video Call Stage',
    description: 'Zoom / Google Meet style audio/video calling sidebar',
    category: 'communication',
    isSafeToToggle: true,
  },
  chat: {
    key: 'chat',
    label: 'Room Chat & Polls',
    description: 'Real-time room messaging, replies, and interactive polls',
    category: 'communication',
    isSafeToToggle: true,
  },
  soundEffects: {
    key: 'soundEffects',
    label: 'Sound Effects & Chimes',
    description: 'Web Audio synthesizer for chat chimes and reaction sounds',
    category: 'communication',
    isSafeToToggle: true,
  },
  playlist: {
    key: 'playlist',
    label: 'Synchronized Playlist',
    description: 'Party queue, video voting, and batch playlist import',
    category: 'media',
    isSafeToToggle: true,
  },
  screenShare: {
    key: 'screenShare',
    label: 'Screen & Tab Sharing',
    description: 'Share your display or browser tab directly to the room',
    category: 'media',
    isSafeToToggle: true,
  },
  browserHub: {
    key: 'browserHub',
    label: 'Direct Stream & Web Media Hub',
    description: 'Launcher for direct MP4/HLS streams and remote browser',
    category: 'media',
    isSafeToToggle: true,
  },
  actionRequests: {
    key: 'actionRequests',
    label: 'Viewer Action Requests',
    description: 'Host approval workflow for viewer seek/play/pause actions',
    category: 'system',
    isSafeToToggle: true,
  },
  activityFeed: {
    key: 'activityFeed',
    label: 'Activity Audit Feed',
    description: 'Live timeline of room joins, video changes, and role events',
    category: 'system',
    isSafeToToggle: true,
  },
  syncDiagnostics: {
    key: 'syncDiagnostics',
    label: 'Sync Quality & Diagnostics',
    description: 'Live telemetry badge, drift metrics, and diagnostics modal',
    category: 'system',
    isSafeToToggle: true,
  },
  autoResync: {
    key: 'autoResync',
    label: 'Auto Drift Correction',
    description: 'Subtle playback rate adjustment to keep players in lockstep',
    category: 'system',
    isSafeToToggle: true,
  },
};

export const DEFAULT_FEATURE_FLAGS: RoomFeatureFlags = {
  ambientGlow: true,
  floatingReactions: true,
  soundEffects: true,
  voiceVideoCall: true,
  screenShare: true,
  chat: true,
  playlist: true,
  actionRequests: true,
  activityFeed: true,
  browserHub: true,
  syncDiagnostics: true,
  theaterMode: false,
  autoResync: true,
};

const STORAGE_KEY = 'synctube_feature_flags_v1';
const EVENT_NAME = 'synctube:feature_flags_changed';

export const getFeatureFlags = (): RoomFeatureFlags => {
  if (typeof window === 'undefined') return DEFAULT_FEATURE_FLAGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FEATURE_FLAGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_FEATURE_FLAGS, ...parsed };
  } catch {
    return DEFAULT_FEATURE_FLAGS;
  }
};

export const isFeatureEnabled = (flag: FeatureFlagKey): boolean => {
  return getFeatureFlags()[flag] ?? DEFAULT_FEATURE_FLAGS[flag];
};

export const setFeatureFlag = (flag: FeatureFlagKey, value: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    const current = getFeatureFlags();
    const updated = { ...current, [flag]: value };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: updated }));
  } catch (err) {
    console.error('Failed to save feature flag', flag, err);
  }
};

export const setAllFeatureFlags = (flags: Partial<RoomFeatureFlags>): void => {
  if (typeof window === 'undefined') return;
  try {
    const current = getFeatureFlags();
    const updated = { ...current, ...flags };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: updated }));
  } catch (err) {
    console.error('Failed to update feature flags batch', err);
  }
};

export const resetFeatureFlags = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_FEATURE_FLAGS));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: DEFAULT_FEATURE_FLAGS }));
  } catch (err) {
    console.error('Failed to reset feature flags', err);
  }
};

export const subscribeFeatureFlags = (callback: (flags: RoomFeatureFlags) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<RoomFeatureFlags>;
    callback(customEvent.detail || getFeatureFlags());
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};

export const useFeatureFlags = (): [
  RoomFeatureFlags,
  (flag: FeatureFlagKey, value: boolean) => void,
  (flags: Partial<RoomFeatureFlags>) => void,
  () => void
] => {
  const [flags, setFlags] = useState<RoomFeatureFlags>(getFeatureFlags);

  useEffect(() => {
    return subscribeFeatureFlags(setFlags);
  }, []);

  const updateFlag = useCallback((flag: FeatureFlagKey, value: boolean) => {
    setFeatureFlag(flag, value);
    setFlags((prev) => ({ ...prev, [flag]: value }));
  }, []);

  const updateBatch = useCallback((newFlags: Partial<RoomFeatureFlags>) => {
    setAllFeatureFlags(newFlags);
    setFlags((prev) => ({ ...prev, ...newFlags }));
  }, []);

  const resetAll = useCallback(() => {
    resetFeatureFlags();
    setFlags(DEFAULT_FEATURE_FLAGS);
  }, []);

  return [flags, updateFlag, updateBatch, resetAll];
};
