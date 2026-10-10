import type { PlatformAdapter } from './PlatformAdapter.js';
import { YouTubeAdapter } from './YouTubeAdapter.js';
import { GenericHTML5Adapter } from './GenericHTML5Adapter.js';
import { NetflixAdapter } from './NetflixAdapter.js';
import { PrimeVideoAdapter } from './PrimeVideoAdapter.js';
import { DisneyHotstarAdapter } from './DisneyHotstarAdapter.js';

export class AdapterRegistry {
  private adapters: PlatformAdapter[] = [];

  constructor() {
    this.adapters.push(new YouTubeAdapter());
    this.adapters.push(new NetflixAdapter());
    this.adapters.push(new PrimeVideoAdapter());
    this.adapters.push(new DisneyHotstarAdapter());
    this.adapters.push(new GenericHTML5Adapter());
  }

  public getAdapterForUrl(url: string): PlatformAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.platformId !== 'generic' && adapter.matches(url)) {
        return adapter;
      }
    }
    const generic = this.adapters.find((a) => a.platformId === 'generic');
    if (generic && generic.matches(url)) {
      return generic;
    }
    return null;
  }

  public getAllSupportedPlatforms(): Array<{ id: string; name: string; capabilities: any }> {
    return this.adapters.map((a) => ({
      id: a.platformId,
      name: a.name,
      capabilities: a.capabilities,
    }));
  }
}
