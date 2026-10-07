import type {
  PlatformId,
  MediaIdentity,
  PlaybackState,
  PlatformCapabilities,
  PlaybackEventCallback,
  Unsubscribe,
} from '../types.js';

export interface PlatformAdapter {
  readonly platformId: PlatformId;
  readonly capabilities: PlatformCapabilities;

  matches(url: string): boolean;
  detectMedia(): Promise<MediaIdentity | null>;
  getState(): Promise<PlaybackState>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(time: number): Promise<void>;
  getCurrentTime(): Promise<number>;
  isPlaying(): Promise<boolean>;
  getDuration(): Promise<number>;
  setPlaybackRate(rate: number): Promise<void>;
  subscribeToEvents(callback: PlaybackEventCallback): Unsubscribe;
  destroy(): void;
}
