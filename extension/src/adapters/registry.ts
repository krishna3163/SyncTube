import type { PlatformAdapter } from './PlatformAdapter.js';
import { YouTubeAdapter } from './YouTubeAdapter.js';
import { GenericHTML5Adapter } from './GenericHTML5Adapter.js';

export class AdapterRegistry {
  private adapters: PlatformAdapter[] = [];

  constructor() {
    // Specific adapters registered first, generic fallback registered last
    this.adapters.push(new YouTubeAdapter());
    this.adapters.push(new GenericHTML5Adapter());
  }

  public getAdapterForUrl(url: string): PlatformAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.platformId !== 'generic' && adapter.matches(url)) {
        return adapter;
      }
    }
    // Fallback to generic adapter if it matches
    const generic = this.adapters.find((a) => a.platformId === 'generic');
    if (generic && generic.matches(url)) {
      return generic;
    }
    return null;
  }

  public getAllSupportedPlatforms(): Array<{ id: string; name: string; capabilities: any }> {
    return [
      {
        id: 'youtube',
        name: 'YouTube',
        capabilities: new YouTubeAdapter().capabilities,
      },
      {
        id: 'generic',
        name: 'Generic HTML5 Video',
        capabilities: new GenericHTML5Adapter().capabilities,
      },
      {
        id: 'netflix',
        name: 'Netflix (Architecture Planned)',
        capabilities: { play: true, pause: true, seek: true, playbackRate: false, volume: false, captions: false, nextEpisode: false },
      },
      {
        id: 'prime',
        name: 'Prime Video (Architecture Planned)',
        capabilities: { play: true, pause: true, seek: true, playbackRate: false, volume: false, captions: false, nextEpisode: false },
      },
    ];
  }
}
