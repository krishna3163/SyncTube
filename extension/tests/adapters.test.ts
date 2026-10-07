import { describe, it, expect } from 'vitest';
import { YouTubeAdapter } from '../src/adapters/YouTubeAdapter.js';
import { GenericHTML5Adapter } from '../src/adapters/GenericHTML5Adapter.js';
import { AdapterRegistry } from '../src/adapters/registry.js';

describe('YouTubeAdapter', () => {
  const adapter = new YouTubeAdapter();

  it('matches standard youtube watch urls', () => {
    expect(adapter.matches('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(adapter.matches('https://youtube.com/watch?v=abc12345678&t=10s')).toBe(true);
    expect(adapter.matches('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(adapter.matches('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
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
    expect(adapter.extractVideoId('https://example.com/')).toBe(null);
  });

  it('reports full capabilities for playback and rate adjustment', () => {
    expect(adapter.capabilities.play).toBe(true);
    expect(adapter.capabilities.pause).toBe(true);
    expect(adapter.capabilities.seek).toBe(true);
    expect(adapter.capabilities.playbackRate).toBe(true);
  });
});

describe('GenericHTML5Adapter', () => {
  const adapter = new GenericHTML5Adapter();

  it('matches valid web urls', () => {
    expect(adapter.matches('https://archive.org/details/sample')).toBe(true);
    expect(adapter.matches('http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4')).toBe(true);
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

  it('falls back to GenericHTML5Adapter for other websites', () => {
    const adapter = registry.getAdapterForUrl('https://example.com/videos/test.mp4');
    expect(adapter).toBeDefined();
    expect(adapter?.platformId).toBe('generic');
  });

  it('lists supported platform capabilities', () => {
    const platforms = registry.getAllSupportedPlatforms();
    expect(platforms.length).toBeGreaterThanOrEqual(2);
    expect(platforms.some((p) => p.id === 'youtube')).toBe(true);
    expect(platforms.some((p) => p.id === 'generic')).toBe(true);
  });
});
