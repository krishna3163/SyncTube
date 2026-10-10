import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { RoomManager } from '../models/RoomManager.js';
import { MovieProviderService, movieProvider } from '../services/movieProvider.js';
import { detectMediaSource } from '../utils/media.js';

describe('MovieProvider Service & Crypto', () => {
  let service: MovieProviderService;

  beforeEach(() => {
    service = new MovieProviderService();
  });

  it('generates valid client tokens with timestamp and reversed MD5', () => {
    const ts = 1791612432000;
    const token = (service as any).generateXClientToken(ts);
    expect(token).toContain(`${ts},`);
    const parts = token.split(',');
    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatch(/^[a-f0-9]{32}$/);
  });

  it('generates HMAC-MD5 request signatures formatted as ts|2|signature', () => {
    const ts = 1791612432000;
    const sig = (service as any).generateSignature(
      'GET',
      'https://api6.aoneroom.com/wefeed-mobile-bff/subject-api/get?subjectId=123',
      '',
      ts
    );
    expect(sig).toMatch(/^\d+\|2\|[A-Za-z0-9+/=]+$/);
  });
});

describe('Media Detection with MovieBox Proxy Streams', () => {
  it('detects movie proxy stream URL as a direct stream with custom title', () => {
    const proxyUrl = 'http://localhost:10000/api/movies/proxy?url=https%3A%2F%2Fmacdn.aoneroom.com%2Fvideo.mp4&title=Inception';
    const detected = detectMediaSource(proxyUrl);
    expect(detected).not.toBeNull();
    expect(detected?.platform).toBe('direct');
    expect(detected?.isDirectStream).toBe(true);
    expect(detected?.title).toBe('Inception');
  });

  it('detects relative movie proxy streams as direct streams', () => {
    const proxyUrl = 'https://synctube.party/api/movies/proxy?url=https%3A%2F%2Fmacdn.aoneroom.com%2Fstream.m3u8&title=Breaking%20Bad';
    const detected = detectMediaSource(proxyUrl);
    expect(detected).not.toBeNull();
    expect(detected?.platform).toBe('direct');
    expect(detected?.isDirectStream).toBe(true);
    expect(detected?.title).toBe('Breaking Bad');
  });
});

describe('MovieBox API & Streaming Proxy Routes', () => {
  let app: ReturnType<typeof createApp>;
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager();
    app = createApp(roomManager);
  });

  it('GET /api/movies/search returns empty results when query is empty', async () => {
    const res = await request(app).get('/api/movies/search?q=');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toEqual([]);
  });

  it('GET /api/movies/proxy rejects empty url parameter', async () => {
    const res = await request(app).get('/api/movies/proxy');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Target URL parameter is required');
  });

  it('GET /api/movies/proxy blocks SSRF / internal IP addresses', async () => {
    const res = await request(app).get('/api/movies/proxy?url=http://127.0.0.1:8080/secret');
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('GET /api/movies/proxy blocks private network ranges (10.0.0.1, 192.168.1.1)', async () => {
    const res = await request(app).get('/api/movies/proxy?url=http://192.168.1.1/admin');
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('GET /api/movies/streams requires a media id', async () => {
    const res = await request(app).get('/api/movies/streams');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/movies/browse rejects unknown category types', async () => {
    const res = await request(app).get('/api/movies/browse?type=cartoons');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('trending');
  });

  it('GET /api/movies/browse delegates to the provider with category and page', async () => {
    const spy = vi
      .spyOn(movieProvider, 'browseMedia')
      .mockResolvedValue([
        { id: '1', title: 'Test Anime', mediaType: 'anime' as any },
      ]);

    const res = await request(app).get('/api/movies/browse?type=anime&page=3');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.type).toBe('anime');
    expect(res.body.page).toBe(3);
    expect(res.body.results).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith('anime', 3);

    spy.mockRestore();
  });
});

describe('MovieBox quality ladder (resolution picker like MovieBox-Tui)', () => {
  const SIGN_COOKIE =
    'Edge-Cache-Cookie=urlprefix=aHR0cHM6Ly9zYmNkbjMuaGFrdW5heW1hdGF0YS5jb20vZGFzaC8zMjY0NzcyNTg4MzMzMTU3NDI0XzBfMF8xMDgwX2gyNjVfNTYwLw:sign=abc123:t=1789908742';

  it('expands collectionResolutions into a quality ladder and covers missing rungs adaptively', async () => {
    const service = new MovieProviderService();
    const requestApi = vi.fn(async (path: string) => {
      if (path.includes('play-info/v2')) {
        return {
          code: 0,
          data: {
            title: 'Inception',
            displayResolutions: '1080,720,480',
            streams: [
              {
                id: 1,
                signCookie: SIGN_COOKIE,
                resolutions: '1080,720,480',
                codecName: 'hevc',
              },
            ],
          },
        };
      }
      if (path.includes('subject-api/resource')) {
        return {
          code: 0,
          data: {
            collectionResolutions: [{ resolution: 1080 }, { resolution: 720 }, { resolution: 480 }],
            list: [
              {
                resourceId: 'r1080',
                title: 'Inception',
                resolution: 1080,
                resourceLink: 'https://macdn.aoneroom.com/video/inception_1080.mp4',
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    (service as any).requestApi = requestApi;

    const result = await service.getStreamSources('99001');

    // Quality ladder: highest → lowest
    expect(result.availableQualities.map((q) => q.label)).toEqual(['1080p', '720p', '480p']);
    expect(result.adaptive).toBe(true);

    // Adaptive DASH manifest is the top stream (best-first ordering)
    expect(result.streams[0].adaptive).toBe(true);
    expect(result.streams[0].format).toBe('DASH');
    expect(result.streams[0].proxiedUrl).toContain('/api/movies/dash/');
    expect(result.streams[0].streamUrl).toContain('/index.mpd');

    // 720p/480p rungs are reached through the adaptive manifest (no extra fetches while ABR covers them)
    expect(result.availableQualities.find((q) => q.height === 720)?.adaptive).toBe(true);
    expect(requestApi).not.toHaveBeenCalledWith(expect.stringContaining('resolution=720'), 'GET');
    expect(requestApi).not.toHaveBeenCalledWith(expect.stringContaining('resolution=480'), 'GET');

    // Direct MP4 resource entries are attached with their height labels
    const direct1080 = result.streams.find((s) => s.height === 1080 && !s.adaptive);
    expect(direct1080).toBeDefined();
    expect(direct1080?.proxiedUrl).toContain('/api/movies/proxy');
  });

  it('fetches per-resolution resource pages when no adaptive manifest exists', async () => {
    const service = new MovieProviderService();
    const requestApi = vi.fn(async (path: string) => {
      if (path.includes('play-info/v2')) {
        return { code: 0, data: { title: 'Breaking Bad', streams: [] } };
      }
      if (path.includes('resolution=720')) {
        return {
          code: 0,
          data: {
            list: [
              {
                resourceId: 'bb720',
                title: 'Breaking Bad',
                resolution: 720,
                resourceLink: 'https://macdn.aoneroom.com/video/bb_720.mp4',
              },
            ],
          },
        };
      }
      if (path.includes('subject-api/resource')) {
        return {
          code: 0,
          data: {
            collectionResolutions: [{ resolution: 1080 }, { resolution: 720 }],
            list: [
              {
                resourceId: 'bb1080',
                title: 'Breaking Bad',
                resolution: 1080,
                resourceLink: 'https://macdn.aoneroom.com/video/bb_1080.mp4',
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    (service as any).requestApi = requestApi;

    const result = await service.getStreamSources('77002');

    expect(requestApi).toHaveBeenCalledWith(
      expect.stringContaining('resolution=720'),
      'GET'
    );
    expect(result.availableQualities.map((q) => q.label)).toEqual(['1080p', '720p']);
    expect(result.adaptive).toBe(false);
    expect(result.streams).toHaveLength(2);
    expect(result.streams[0].height).toBe(1080);
    expect(result.streams[1].height).toBe(720);
    expect(result.streams.every((s) => !s.adaptive)).toBe(true);
  });

  it('browseMedia maps categories to keyword search + subjectType filters', async () => {
    const service = new MovieProviderService();
    const searchSpy = vi
      .spyOn(service, 'searchMedia')
      .mockResolvedValue([
        { id: 'a', title: 'Anime One', mediaType: 'movie' },
        { id: 'b', title: 'Anime Two', mediaType: 'series' },
      ]);
    vi.spyOn(service, 'getTrendingMedia').mockRejectedValue(new Error('offline'));

    const anime = await service.browseMedia('anime', 1);
    expect(searchSpy).toHaveBeenCalledWith('anime', 1, 0);
    expect(anime).toHaveLength(2);

    await service.browseMedia('movies', 2);
    expect(searchSpy).toHaveBeenLastCalledWith('comedy', 1, 1);

    await service.browseMedia('series', 1);
    expect(searchSpy).toHaveBeenLastCalledWith('drama', 1, 2);

    vi.restoreAllMocks();
  });

  it('browseMedia filters search results by media type for movies and series', async () => {
    const service = new MovieProviderService();
    vi.spyOn(service, 'searchMedia').mockResolvedValue([
      { id: 'm1', title: 'Some Movie', mediaType: 'movie' },
      { id: 's1', title: 'Some Show', mediaType: 'series' },
    ]);
    vi.spyOn(service, 'getTrendingMedia').mockRejectedValue(new Error('offline'));

    const movies = await service.browseMedia('movies', 1);
    expect(movies.map((r) => r.id)).toEqual(['m1']);

    const series = await service.browseMedia('series', 1);
    expect(series.map((r) => r.id)).toEqual(['s1']);

    vi.restoreAllMocks();
  });
});

describe('Offline fixture catalogue (MOVIEBOX_FIXTURE=1)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    process.env.MOVIEBOX_FIXTURE = '1';
    app = createApp(new RoomManager());
  });

  afterEach(() => {
    delete process.env.MOVIEBOX_FIXTURE;
  });

  it('serves browse, search, details, and streams without touching the network', async () => {
    const service = new MovieProviderService();
    const requestSpy = vi.spyOn(service as any, 'requestApi');

    const anime = await service.browseMedia('anime', 1);
    expect(anime.length).toBeGreaterThan(0);
    expect(anime.every((r) => r.coverUrl?.startsWith('data:image/svg+xml'))).toBe(true);

    const search = await service.searchMedia('neon', 1);
    expect(search.some((r) => r.title === 'Neon Horizon')).toBe(true);

    const details = await service.getMediaDetails('fx-002');
    expect(details.mediaType).toBe('series');
    expect(details.seasons?.length).toBe(3);

    const streams = await service.getStreamSources('fx-002', 1, 3);
    expect(streams.title).toBe('Glass Empire S01E03');
    expect(streams.availableQualities.map((q) => q.label)).toEqual(['1080p', '720p', '480p']);
    expect(streams.streams).toHaveLength(3);
    expect(streams.streams[0].proxiedUrl).toContain('/fixture-media/sample_1080.mp4');
    expect(streams.streams[0].proxiedUrl).toContain('title=Glass%20Empire');

    expect(requestSpy).not.toHaveBeenCalled();
    requestSpy.mockRestore();
  });

  it('fixture stream URLs are detected as playable direct streams', () => {
    const detected = detectMediaSource(
      'http://localhost:10000/fixture-media/sample_720.mp4?title=Neon%20Horizon'
    );
    expect(detected).not.toBeNull();
    expect(detected?.platform).toBe('direct');
    expect(detected?.isDirectStream).toBe(true);
    expect(detected?.title).toBe('Neon Horizon');
  });

  it('GET /api/movies/browse returns fixture catalogue entries', async () => {
    const res = await request(app).get('/api/movies/browse?type=movies');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results.every((r: any) => r.mediaType === 'movie')).toBe(true);
  });
});
