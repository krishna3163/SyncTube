export type PlatformId = 'youtube' | 'generic' | 'netflix' | 'prime' | 'disney' | 'twitch' | string;

export interface MediaIdentity {
  platform: PlatformId;
  mediaId: string;
  title: string;
  url?: string;
  duration?: number;
}

export type PlaybackStatus = 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ENDED' | 'SEEKING' | 'UNKNOWN';

export interface PlaybackState {
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  playbackRate: number;
  mediaIdentity: MediaIdentity | null;
}

export interface PlatformCapabilities {
  play: boolean;
  pause: boolean;
  seek: boolean;
  playbackRate: boolean;
  volume: boolean;
  captions: boolean;
  nextEpisode: boolean;
}

export type PlaybackEventType =
  | 'play'
  | 'pause'
  | 'seek'
  | 'timeupdate'
  | 'buffering'
  | 'ended'
  | 'media_change'
  | 'rate_change';

export interface PlaybackEvent {
  type: PlaybackEventType;
  currentTime: number;
  duration: number;
  playbackRate?: number;
  mediaIdentity?: MediaIdentity | null;
  timestamp: number;
}

export type PlaybackEventCallback = (event: PlaybackEvent) => void;
export type Unsubscribe = () => void;

export interface ExtensionPartyState {
  connected: boolean;
  roomId: string | null;
  isHost: boolean;
  userId: string | null;
  serverUrl: string;
  readiness: 'ready' | 'loading' | 'desynced' | 'not_connected';
}
