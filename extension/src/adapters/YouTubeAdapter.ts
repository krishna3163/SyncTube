import type {
  MediaIdentity,
  PlaybackEventCallback,
  PlaybackState,
  PlatformCapabilities,
  Unsubscribe,
} from '../types.js';
import type { PlatformAdapter } from './PlatformAdapter.js';

export class YouTubeAdapter implements PlatformAdapter {
  public readonly platformId = 'youtube';
  public readonly capabilities: PlatformCapabilities = {
    play: true,
    pause: true,
    seek: true,
    playbackRate: true,
    volume: true,
    captions: false,
    nextEpisode: false,
  };

  private listeners: PlaybackEventCallback[] = [];
  private cleanups: Array<() => void> = [];
  private currentVideoElement: HTMLVideoElement | null = null;
  private lastKnownVideoId: string | null = null;
  private observer: MutationObserver | null = null;

  public matches(url: string): boolean {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (
        host.includes('youtube.com') &&
        (parsed.pathname === '/watch' ||
          parsed.pathname.startsWith('/embed/') ||
          parsed.pathname.startsWith('/shorts/') ||
          parsed.pathname.startsWith('/live/'))
      ) {
        return true;
      }
      if (host === 'youtu.be') return true;
      return false;
    } catch {
      return false;
    }
  }

  public getVideoElement(): HTMLVideoElement | null {
    if (typeof document === 'undefined') return null;
    return (
      (document.querySelector('video.html5-main-video') as HTMLVideoElement) ||
      (document.querySelector('video') as HTMLVideoElement) ||
      null
    );
  }

  public extractVideoId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.searchParams.has('v')) {
        return parsed.searchParams.get('v');
      }
      if (parsed.hostname === 'youtu.be') {
        return parsed.pathname.slice(1).split('?')[0];
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || null;
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] || null;
      }
      if (parsed.pathname.startsWith('/live/')) {
        return parsed.pathname.split('/')[2] || null;
      }
    } catch {
      // not a valid url
    }
    return null;
  }

  public async detectMedia(): Promise<MediaIdentity | null> {
    if (typeof window === 'undefined') return null;
    const videoId = this.extractVideoId(window.location.href);
    if (!videoId) return null;

    const video = this.getVideoElement();
    const pageTitle = (typeof document !== 'undefined' && document.title) || '';
    const cleanTitle = pageTitle.replace(/ - YouTube$/, '').trim() || `YouTube Video (${videoId})`;

    this.lastKnownVideoId = videoId;

    return {
      platform: 'youtube',
      mediaId: videoId,
      title: cleanTitle,
      url: window.location.href,
      duration: video ? video.duration : undefined,
    };
  }

  public async getState(): Promise<PlaybackState> {
    const video = this.getVideoElement();
    const media = await this.detectMedia();

    if (!video) {
      return {
        status: 'UNKNOWN',
        currentTime: 0,
        duration: 0,
        playbackRate: 1.0,
        mediaIdentity: media,
      };
    }

    let status: PlaybackState['status'] = 'PAUSED';
    if (video.seeking) {
      status = 'SEEKING';
    } else if (video.ended) {
      status = 'ENDED';
    } else if (!video.paused) {
      status = 'PLAYING';
    }

    return {
      status,
      currentTime: video.currentTime,
      duration: isNaN(video.duration) ? 0 : video.duration,
      playbackRate: video.playbackRate,
      mediaIdentity: media,
    };
  }

  public async play(): Promise<void> {
    const video = this.getVideoElement();
    if (video && video.paused) {
      await video.play();
    }
  }

  public async pause(): Promise<void> {
    const video = this.getVideoElement();
    if (video && !video.paused) {
      video.pause();
    }
  }

  public async seek(time: number): Promise<void> {
    const video = this.getVideoElement();
    if (video) {
      video.currentTime = Math.max(0, time);
    }
  }

  public async getCurrentTime(): Promise<number> {
    const video = this.getVideoElement();
    return video ? video.currentTime : 0;
  }

  public async isPlaying(): Promise<boolean> {
    const video = this.getVideoElement();
    return video ? !video.paused && !video.ended : false;
  }

  public async getDuration(): Promise<number> {
    const video = this.getVideoElement();
    return video && !isNaN(video.duration) ? video.duration : 0;
  }

  public async setPlaybackRate(rate: number): Promise<void> {
    const video = this.getVideoElement();
    if (video) {
      video.playbackRate = Math.min(2.0, Math.max(0.5, rate));
    }
  }

  public subscribeToEvents(callback: PlaybackEventCallback): Unsubscribe {
    this.listeners.push(callback);

    const video = this.getVideoElement();
    if (video && video !== this.currentVideoElement) {
      this.attachVideoListeners(video);
    }

    if (typeof document !== 'undefined' && !this.observer) {
      try {
        this.observer = new MutationObserver(() => {
          const v = this.getVideoElement();
          if (v && v !== this.currentVideoElement) {
            this.attachVideoListeners(v);
          }
        });
        const target = document.documentElement || document.body;
        if (target) {
          this.observer.observe(target, { childList: true, subtree: true });
        }
      } catch {
        // ignore in non-browser environments
      }
    }

    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private attachVideoListeners(video: HTMLVideoElement): void {
    this.currentVideoElement = video;

    const emit = (type: any) => {
      const event = {
        type,
        currentTime: video.currentTime,
        duration: isNaN(video.duration) ? 0 : video.duration,
        playbackRate: video.playbackRate,
        timestamp: Date.now(),
      };
      for (const listener of this.listeners) {
        listener(event);
      }
    };

    const onPlay = () => emit('play');
    const onPause = () => emit('pause');
    const onSeeked = () => emit('seek');
    const onEnded = () => emit('ended');
    const onRateChange = () => emit('rate_change');

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ended', onEnded);
    video.addEventListener('ratechange', onRateChange);

    this.cleanups.push(() => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('ratechange', onRateChange);
    });
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];
    this.listeners = [];
    this.currentVideoElement = null;
  }
}
