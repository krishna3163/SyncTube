import type {
  MediaIdentity,
  PlaybackEventCallback,
  PlaybackState,
  PlatformCapabilities,
  Unsubscribe,
} from '../types.js';
import type { PlatformAdapter } from './PlatformAdapter.js';

export class GenericHTML5Adapter implements PlatformAdapter {
  public readonly platformId = 'generic';
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
  private observer: MutationObserver | null = null;

  public matches(url: string): boolean {
    if (!url) return false;
    // Generic adapter matches any web page that does NOT have a more specific adapter
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  public getVideoElement(): HTMLVideoElement | null {
    if (typeof document === 'undefined') return null;
    if (this.currentVideoElement && document.contains(this.currentVideoElement)) {
      return this.currentVideoElement;
    }
    const video = (document.querySelector('video') as HTMLVideoElement) || null;
    if (video) {
      this.currentVideoElement = video;
      return video;
    }
    return null;
  }

  public async detectMedia(): Promise<MediaIdentity | null> {
    if (typeof window === 'undefined') return null;
    const video = this.getVideoElement();
    if (!video) return null;

    const source = video.currentSrc || video.src || window.location.href;
    
    // Detect movie / streaming platform from hostname
    let platform: string;
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.includes('netflix')) platform = 'netflix';
    else if (hostname.includes('primevideo') || hostname.includes('amazon')) platform = 'prime';
    else if (hostname.includes('disney') || hostname.includes('hotstar')) platform = 'disney';
    else if (hostname.includes('crunchyroll') || hostname.includes('anime')) platform = 'crunchyroll';
    else if (hostname.includes('twitch')) platform = 'twitch';
    else if (hostname.includes('vimeo')) platform = 'vimeo';
    else if (hostname.includes('dailymotion')) platform = 'dailymotion';
    else platform = 'movie_stream';

    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
    const pageTitle = ogTitle || twitterTitle || document.title || 'Movie / Web Video Stream';

    return {
      platform,
      mediaId: source,
      title: pageTitle.trim(),
      url: window.location.href,
      duration: isNaN(video.duration) ? undefined : video.duration,
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
