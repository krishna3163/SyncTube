import { describe, it, expect } from 'vitest';
import { YouTubeAdapter } from '../src/adapters/YouTubeAdapter.js';
import { GenericHTML5Adapter } from '../src/adapters/GenericHTML5Adapter.js';
import { NetflixAdapter } from '../src/adapters/NetflixAdapter.js';
import { PrimeVideoAdapter } from '../src/adapters/PrimeVideoAdapter.js';
import { DisneyHotstarAdapter } from '../src/adapters/DisneyHotstarAdapter.js';
import { AdapterRegistry } from '../src/adapters/registry.js';

describe('YouTubeAdapter', () => {
  const adapter = new YouTubeAdapter();

  it('matches standard youtube watch urls', () => {
    expect(adapter.matches('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(adapter.matches('https://youtube.com/watch?v=abc12345678&t=10s')).toBe(true);
    expect(adapter.matches('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(adapter.matches('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
    expect(adapter.matches('https://www.youtube.com/shorts/xyz123abc45')).toBe(true);
    expect(adapter.matches('https://www.youtube.com/live/liveStream123')).toBe(true);
  });

  it('does not match non-youtube urls', () => {
    expect(adapter.matches('https://vimeo.com/12345')).toBe(false);
    expect(adapter.matches('https://netflix.com/watch/12345')).toBe(false);
    expect(adapter.matches('invalid-url')).toBe(false);
  });

  it('extracts youtube video id correctly', () => {
    expect(adapter.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(adapter.extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(adapter.extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(adapter.extractVideoId('https://www.youtube.com/shorts/xyz123abc45')).toBe('xyz123abc45');
    expect(adapter.extractVideoId('https://www.youtube.com/live/liveStream123')).toBe('liveStream123');
    expect(adapter.extractVideoId('https://example.com/')).toBe(null);
  });

  it('reports full capabilities for playback and rate adjustment', () => {
    expect(adapter.capabilities.play).toBe(true);
    expect(adapter.capabilities.pause).toBe(true);
    expect(adapter.capabilities.seek).toBe(true);
    expect(adapter.capabilities.playbackRate).toBe(true);
  });
});

describe('NetflixAdapter', () => {
  const adapter = new NetflixAdapter();

  it('matches netflix watch urls', () => {
    expect(adapter.matches('https://www.netflix.com/watch/80057281')).toBe(true);
    expect(adapter.matches('https://netflix.com/watch/12345678')).toBe(true);
    expect(adapter.matches('https://www.netflix.com/browse')).toBe(false);
  });

  it('extracts netflix media id correctly', () => {
    expect(adapter.extractMediaId('https://www.netflix.com/watch/80057281')).toBe('80057281');
    expect(adapter.extractMediaId('https://www.netflix.com/title/80057281')).toBe(null);
  });
});

describe('PrimeVideoAdapter', () => {
  const adapter = new PrimeVideoAdapter();

  it('matches prime video detail and watch urls', () => {
    expect(adapter.matches('https://www.primevideo.com/detail/0TIX7S7V/ref=atv')).toBe(true);
    expect(adapter.matches('https://www.amazon.com/gp/video/detail/B08XYZ')).toBe(true);
    expect(adapter.matches('https://www.amazon.com/dp/B08XYZ')).toBe(false);
  });

  it('extracts prime video media id correctly', () => {
    expect(adapter.extractMediaId('https://www.primevideo.com/detail/0TIX7S7V')).toBe('0TIX7S7V');
  });
});

describe('DisneyHotstarAdapter', () => {
  const adapter = new DisneyHotstarAdapter();

  it('matches disney and hotstar urls', () => {
    expect(adapter.matches('https://www.hotstar.com/movies/interstellar/1260018440/watch')).toBe(true);
    expect(adapter.matches('https://www.disneyplus.com/video/abc12345')).toBe(true);
    expect(adapter.matches('https://www.disneyplus.com/home')).toBe(false);
  });

  it('extracts disney media id correctly', () => {
    expect(adapter.extractMediaId('https://www.disneyplus.com/video/abc12345')).toBe('abc12345');
  });
});

describe('GenericHTML5Adapter', () => {
  const adapter = new GenericHTML5Adapter();

  it('matches valid web urls', () => {
    expect(adapter.matches('https://archive.org/details/sample')).toBe(true);
    expect(adapter.matches('http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4')).toBe(true);
    expect(adapter.matches('https://vimeo.com/channels/staffpicks/987654')).toBe(true);
    expect(adapter.matches('https://twitch.tv/streamer')).toBe(true);
    expect(adapter.matches('ftp://invalid')).toBe(false);
  });
});

describe('AdapterRegistry', () => {
  const registry = new AdapterRegistry();

  it('prioritizes YouTubeAdapter for youtube URLs', () => {
    const adapter = registry.getAdapterForUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(adapter).toBeDefined();
    expect(adapter?.platformId).toBe('youtube');
  });

  it('prioritizes NetflixAdapter for netflix URLs', () => {
    const adapter = registry.getAdapterForUrl('https://www.netflix.com/watch/80057281');
    expect(adapter).toBeDefined();
    expect(adapter?.platformId).toBe('netflix');
  });

  it('prioritizes PrimeVideoAdapter for prime video URLs', () => {
    const adapter = registry.getAdapterForUrl('https://www.primevideo.com/detail/0TIX7S7V');
    expect(adapter).toBeDefined();
    expect(adapter?.platformId).toBe('prime');
  });

  it('prioritizes DisneyHotstarAdapter for hotstar URLs', () => {
    const adapter = registry.getAdapterForUrl('https://www.hotstar.com/movies/interstellar/1260018440/watch');
    expect(adapter).toBeDefined();
    expect(adapter?.platformId).toBe('disney');
  });

  it('falls back to GenericHTML5Adapter for other websites', () => {
    const adapter = registry.getAdapterForUrl('https://example.com/videos/test.mp4');
    expect(adapter).toBeDefined();
    expect(adapter?.platformId).toBe('generic');
  });

  it('lists supported platform capabilities', () => {
    const platforms = registry.getAllSupportedPlatforms();
    expect(platforms.length).toBeGreaterThanOrEqual(5);
    expect(platforms.some((p) => p.id === 'youtube')).toBe(true);
    expect(platforms.some((p) => p.id === 'netflix')).toBe(true);
    expect(platforms.some((p) => p.id === 'prime')).toBe(true);
    expect(platforms.some((p) => p.id === 'disney')).toBe(true);
    expect(platforms.some((p) => p.id === 'generic')).toBe(true);
  });
});
