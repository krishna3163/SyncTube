import type { PlatformAdapter, PlayerState, AdapterCapabilities } from './PlatformAdapter.js';

export class DisneyHotstarAdapter implements PlatformAdapter {
  public readonly platformId = 'disney' as const;
  public readonly name = 'Disney+ / JioHotstar';
  public readonly capabilities: AdapterCapabilities = {
    play: true,
    pause: true,
    seek: true,
    playbackRate: true,
    volume: true,
    captions: true,
    nextEpisode: true,
  };

  private pollInterval: any = null;
  private lastState: PlayerState | null = null;
  private changeCallback: ((state: PlayerState) => void) | null = null;

  public matches(url: string): boolean {
    return /^https?:\/\/(www\.)?(disneyplus\.com|hotstar\.com)/i.test(url);
  }

  public extractMediaId(url: string): string | null {
    const match = url.match(/(video|play|movies|shows)\/([a-zA-Z0-9_-]+)/i);
    return match ? match[2] : null;
  }

  private getVideoElement(): HTMLVideoElement | null {
    return document.querySelector('video') as HTMLVideoElement | null;
  }

  public async attach(onStateChange: (state: PlayerState) => void): Promise<void> {
    this.changeCallback = onStateChange;
    const video = this.getVideoElement();
    if (video) {
      video.addEventListener('play', this.handleMediaEvent);
      video.addEventListener('pause', this.handleMediaEvent);
      video.addEventListener('seeked', this.handleMediaEvent);
      video.addEventListener('ratechange', this.handleMediaEvent);
    }
    this.pollInterval = setInterval(() => this.pollState(), 800);
  }

  private handleMediaEvent = () => {
    this.pollState();
  };

  private pollState(): void {
    const video = this.getVideoElement();
    if (!video || !this.changeCallback) return;

    const state: PlayerState = {
      mediaId: this.extractMediaId(window.location.href) || 'disney_media',
      title: document.querySelector('.title-field, h1')?.textContent?.trim() || document.title,
      currentTime: video.currentTime,
      duration: video.duration || 0,
      playState: video.paused ? 'paused' : 'playing',
      playbackRate: video.playbackRate || 1,
      volume: Math.round(video.volume * 100),
      isMuted: video.muted,
      isBuffering: video.readyState < 3,
    };

    if (!this.lastState || Math.abs(this.lastState.currentTime - state.currentTime) > 0.5 || this.lastState.playState !== state.playState) {
      this.lastState = state;
      this.changeCallback(state);
    }
  }

  public async detach(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    const video = this.getVideoElement();
    if (video) {
      video.removeEventListener('play', this.handleMediaEvent);
      video.removeEventListener('pause', this.handleMediaEvent);
      video.removeEventListener('seeked', this.handleMediaEvent);
      video.removeEventListener('ratechange', this.handleMediaEvent);
    }
    this.changeCallback = null;
    this.lastState = null;
  }

  public async getState(): Promise<PlayerState> {
    const video = this.getVideoElement();
    return {
      mediaId: this.extractMediaId(window.location.href) || 'disney_media',
      title: document.querySelector('.title-field, h1')?.textContent?.trim() || document.title,
      currentTime: video?.currentTime || 0,
      duration: video?.duration || 0,
      playState: video?.paused ? 'paused' : 'playing',
      playbackRate: video?.playbackRate || 1,
      volume: video ? Math.round(video.volume * 100) : 100,
      isMuted: video?.muted || false,
      isBuffering: video ? video.readyState < 3 : false,
    };
  }

  public async play(): Promise<void> {
    const video = this.getVideoElement();
    if (video && video.paused) {
      await video.play().catch(() => {});
    }
  }

  public async pause(): Promise<void> {
    const video = this.getVideoElement();
    if (video && !video.paused) {
      video.pause();
    }
  }

  public async seek(targetTime: number): Promise<void> {
    const video = this.getVideoElement();
    if (video) {
      video.currentTime = targetTime;
    }
  }

  public async setPlaybackRate(rate: number): Promise<void> {
    const video = this.getVideoElement();
    if (video) {
      video.playbackRate = rate;
    }
  }

  public async setVolume(volumePercent: number): Promise<void> {
    const video = this.getVideoElement();
    if (video) {
      video.volume = Math.max(0, Math.min(1, volumePercent / 100));
    }
  }
}
