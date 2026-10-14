import { z } from 'zod';
import express, { Express, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import os from 'node:os';
import { RoomManager } from './models/RoomManager.js';
import { DatabaseService } from './services/db.js';
import { extractYouTubeId } from './utils/youtube.js';
import { detectMediaSource } from './utils/media.js';
import { serverSentry } from './services/sentry.js';
import { AuthService, UserProfile } from './services/auth.js';
import { isAllowedOrigin } from './utils/cors.js';
import { isClusterEnabled } from './utils/cluster.js';




const ALLOWED_MOVIE_PROXY_ORIGINS: Record<string, string> = {
  'macdn.aoneroom.com': 'https://macdn.aoneroom.com',
  'api6.aoneroom.com': 'https://api6.aoneroom.com',
  'api5.aoneroom.com': 'https://api5.aoneroom.com',
  'api4.aoneroom.com': 'https://api4.aoneroom.com',
  'api3.aoneroom.com': 'https://api3.aoneroom.com',
  'api.inmoviebox.com': 'https://api.inmoviebox.com',
  'commondatastorage.googleapis.com': 'https://commondatastorage.googleapis.com',
  'storage.googleapis.com': 'https://storage.googleapis.com',
  'archive.org': 'https://archive.org',
  'sportslive.wine': 'https://sportslive.wine',
};

export function getTrustedMovieProxyOrigin(hostname: string): string | null {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');
  const knownOrigin = ALLOWED_MOVIE_PROXY_ORIGINS[normalizedHostname];
  if (knownOrigin) return knownOrigin;

  return /^sbcdn\d+\.hakunaymatata\.com$/.test(normalizedHostname)
    ? `https://${normalizedHostname}`
    : null;
}

export function createApp(roomManager: RoomManager, dbService?: DatabaseService, authService?: AuthService): Express {
  const auth = authService || new AuthService(dbService);
  const app = express();
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
  // Gzip / Brotli compression — critical for 10k rps (JSON + HTML). Threshold 1kb, level 6 balances CPU vs bytes.
  app.use(compression({ threshold: 1024, level: 6, filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }}));
  // Disable x-powered-by for security + reduce header bytes at scale
  app.disable('x-powered-by');

  // Security Headers (Satisfies Semgrep and Lighthouse best practices)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self), geolocation=()');
    next();
  });

  app.use(cors({
    origin: isAllowedOrigin,
    credentials: true,
  }));

  app.use(express.json());

  const apiRateLimiter = (limit: number, windowMs: number) => rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    // In cluster/Redis mode the default MemoryStore is per-worker — counts are not global.
    // For true 10k global limiting, set REDIS_URL and install rate-limit-redis; otherwise each worker
    // enforces 1/N of the global budget (acceptable until Redis is added).
    handler: (_req, res) => res.status(429).json({ error: 'Too many requests. Please slow down.' }),
  });
  // General API bucket: 120 req/min per IP per worker. For 4 workers ≈ 480 global. Tune via API_RATE_LIMIT.
  const apiGlobalLimit = parseInt(process.env.API_RATE_LIMIT || '120', 10);
  app.use('/api', apiRateLimiter(Number.isFinite(apiGlobalLimit) ? apiGlobalLimit : 120, 60000));

  // Health check endpoint — also reports capacity hints for 10k readiness probes
  app.get('/health', (_req: Request, res: Response) => {
    const mem = process.memoryUsage();
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      roomsActive: roomManager.getRoomCount(),
      pid: process.pid,
      workerId: (process as any).env?.WORKER_ID || undefined,
      cpus: os.cpus().length,
      memory: {
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      },
      capacity: {
        maxRooms: parseInt(process.env.MAX_ROOMS || '20000', 10),
        pgPoolMax: parseInt(process.env.PG_POOL_MAX || '20', 10),
        cluster: isClusterEnabled() ? 'enabled' : 'disabled',
        redis: !!(process.env.REDIS_URL || process.env.REDIS_TLS_URL),
      },
    });
  });

  // Lightweight liveness probe for load balancers (no JSON parsing needed)
  app.get('/healthz', (_req: Request, res: Response) => res.status(200).send('ok'));
  app.get('/readyz', (_req: Request, res: Response) => {
    // In future: check DB/Redis reachability; for now always ready if process is up
    res.status(200).send('ready');
  });

  // Create room endpoint (protected by rate limiter) — tunable for 10k bursts via ROOM_CREATE_RATE_LIMIT
  const roomCreateLimit = parseInt(process.env.ROOM_CREATE_RATE_LIMIT || '30', 10);
  app.post('/api/rooms', apiRateLimiter(Number.isFinite(roomCreateLimit) ? roomCreateLimit : 30, 60000), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { initialVideoId } = req.body || {};
      let videoId = '';

      if (initialVideoId) {
        const ytParsed = extractYouTubeId(initialVideoId);
        if (ytParsed) {
          videoId = ytParsed;
        } else {
          const media = detectMediaSource(initialVideoId);
          if (!media || media.platform === 'generic') {
            return res.status(400).json({ error: 'Invalid YouTube video URL or ID.' });
          }
          videoId = media.mediaId;
        }
      }

      const hasCreatorIdentity = Object.hasOwn(req.body || {}, 'creatorUserId');
      const creatorUserId = typeof req.body?.creatorUserId === 'string' ? req.body.creatorUserId : undefined;
      if (hasCreatorIdentity && (!creatorUserId || !/^[0-9a-f-]{36}$/i.test(creatorUserId))) {
        return res.status(400).json({ error: 'Invalid creator identity.' });
      }
      const creatorToken = creatorUserId ? randomBytes(32).toString('hex') : undefined;
      const creatorIdentity = creatorUserId && creatorToken
        ? {
            userId: creatorUserId,
            credentialHash: createHash('sha256').update(creatorToken).digest('hex'),
          }
        : undefined;
      const room = roomManager.createRoom(undefined, videoId, creatorIdentity);

      if (dbService) {
        await dbService.saveRoom({
          id: room.id,
          video_id: room.videoId,
          play_state: room.playState,
          current_time: room.currentTime,
          updated_at: room.updatedAt,
          created_at: room.createdAt,
          likes: room.likes,
          category: room.category,
        });
      }

      res.status(201).json({
        roomId: room.id,
        videoId: room.videoId,
        createdAt: room.createdAt,
        likes: room.likes,
        category: room.category,
        ...(creatorToken ? { identityToken: creatorToken } : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  // Get room info endpoint
  app.get('/api/rooms/:roomId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = req.params.roomId.toUpperCase();
      let room = roomManager.getRoom(roomId);

      if (!room && dbService) {
        const dbRecord = await dbService.getRoom(roomId);
        if (dbRecord) {
          room = roomManager.getRoom(roomId);
          if (!room) {
            room = roomManager.createRoom(
              dbRecord.id,
              dbRecord.video_id,
              undefined,
              Number(dbRecord.created_at || Date.now()),
              Number(dbRecord.likes || 0),
              dbRecord.category || 'cinema'
            );
            room.playState = dbRecord.play_state as any;
            room.currentTime = dbRecord.current_time;
            room.updatedAt = Number(dbRecord.updated_at);
          }
        }
      }

      if (!room) {
        return res.status(404).json({ exists: false, error: 'Room not found' });
      }

      res.status(200).json({
        exists: true,
        roomId: room.id,
        videoId: room.videoId,
        playState: room.playState,
        participantCount: room.getParticipantCount(),
        createdAt: room.createdAt,
        likes: room.likes,
        category: room.category,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/rooms-directory — Public watch party discovery directory
  app.get('/api/rooms-directory', async (req: Request, res: Response) => {
    const category = typeof req.query.category === 'string' ? req.query.category.toLowerCase().trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase().trim() : '';

    let rooms = roomManager.getAllRooms()
      .filter((r) => r.visibility !== 'private')
      .map((r) => r.toPublicDirectoryItem());

    if (category && category !== 'all') {
      rooms = rooms.filter((r) => r.category.toLowerCase() === category);
    }

    if (q) {
      rooms = rooms.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.mediaTitle.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    }

    // Sort by live status and active viewers
    rooms.sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return b.participantCount - a.participantCount;
    });

    res.status(200).json({
      success: true,
      count: rooms.length,
      rooms,
    });
  });

  // ── V2 REST API ENDPOINTS ──────────────────────────────────
  const getAuthUser = async (req: Request): Promise<UserProfile | null> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    return auth.validateSession(token);
  };

  // Bookmarks & Moment Highlights
  app.get('/api/rooms/:roomId/bookmarks', async (req: Request, res: Response) => {
    const roomId = req.params.roomId.toUpperCase();
    if (dbService) {
      const bookmarks = await dbService.getBookmarks(roomId);
      return res.status(200).json({ success: true, bookmarks });
    }
    return res.status(200).json({ success: true, bookmarks: [] });
  });

  app.post('/api/rooms/:roomId/bookmarks', async (req: Request, res: Response) => {
    const roomId = req.params.roomId.toUpperCase();
    const user = await getAuthUser(req);
    const { timestamp, label } = req.body || {};
    if (typeof timestamp !== 'number' || !label) {
      return res.status(400).json({ error: 'Timestamp and label are required' });
    }
    const bookmark = {
      id: randomBytes(16).toString('hex'),
      roomId,
      userId: user?.id || 'guest',
      timestamp,
      label: String(label).slice(0, 140),
      createdAt: Date.now(),
    };
    if (dbService) {
      await dbService.addBookmark(bookmark);
    }
    return res.status(201).json({ success: true, bookmark });
  });

  // Supported Platforms & Capabilities
  app.get('/api/platforms', (_req: Request, res: Response) => {
    res.status(200).json({
      platforms: [
        {
          id: 'youtube',
          name: 'YouTube',
          status: 'SUPPORTED',
          capabilities: { play: true, pause: true, seek: true, playbackRate: true },
        },
        {
          id: 'generic',
          name: 'HTML5 Video',
          status: 'SUPPORTED',
          capabilities: { play: true, pause: true, seek: true, playbackRate: true },
        },
        {
          id: 'netflix',
          name: 'Netflix',
          status: 'SUPPORTED',
          capabilities: { play: true, pause: true, seek: true, playbackRate: true },
        },
        {
          id: 'prime',
          name: 'Prime Video',
          status: 'SUPPORTED',
          capabilities: { play: true, pause: true, seek: true, playbackRate: true },
        },
        {
          id: 'disney',
          name: 'Disney+ / JioHotstar',
          status: 'SUPPORTED',
          capabilities: { play: true, pause: true, seek: true, playbackRate: true },
        },
      ],
    });
  });

  // Room Readiness
  app.get('/api/rooms/:roomId/readiness', (req: Request, res: Response) => {
    const roomId = req.params.roomId.toUpperCase();
    const room = roomManager.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.status(200).json({
      roomId: room.id,
      readiness: room.universalSync.getAllReadiness(),
      allReady: room.universalSync.areAllParticipantsReady(),
    });
  });

  // Universal Sync State Snapshot
  app.get('/api/rooms/:roomId/sync', (req: Request, res: Response) => {
    const roomId = req.params.roomId.toUpperCase();
    const room = roomManager.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.status(200).json({
      roomId: room.id,
      snapshot: room.getUniversalSnapshot(),
    });
  });

  // Auth: Register
  app.post('/api/auth/register', apiRateLimiter(20, 60000), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, username, password, avatarId } = req.body || {};
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email address is required.' });
      }
      if (!username || typeof username !== 'string' || username.trim().length < 2) {
        return res.status(400).json({ error: 'Username must be at least 2 characters.' });
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      const result = await auth.register(email, username, password, avatarId);
      res.status(201).json(result);
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        return res.status(409).json({ error: err.message });
      }
      next(err);
    }
  });

  // Auth: Login
  const LoginSchema = z.object({
    email: z.string().trim().min(1, 'Email is required.'),
    password: z.string().min(1, 'Password is required.'),
  });

  app.post('/api/auth/login', apiRateLimiter(30, 60000), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const result = await auth.login(parsed.data.email, parsed.data.password);
      res.status(200).json(result);
    } catch (err: any) {
      if (err.message?.includes('Invalid email or password')) {
        return res.status(401).json({ error: err.message });
      }
      next(err);
    }
  });

  // Auth: Logout
  app.post('/api/auth/logout', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (header?.startsWith('Bearer ')) {
        const token = header.slice(7).trim();
        await auth.logout(token);
      }
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // Auth: Current User Profile
  app.get('/api/me', async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Please login.' });
    }
    res.status(200).json({ user });
  });

  app.get('/api/profile', async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Please login.' });
    }
    res.status(200).json({ user });
  });

  // Auth: Update Profile
  app.patch('/api/profile', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Please login.' });
      }

      const { username, avatarId, bio } = req.body || {};
      const updated = await auth.updateProfile(user.id, { username, avatarId, bio });
      res.status(200).json({ user: updated });
    } catch (err) {
      next(err);
    }
  });

  // Watch History
  app.get('/api/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Please login.' });
      }

      if (dbService && dbService.isConnectedToDb()) {
        const history = await dbService.getWatchHistory(user.id);
        return res.status(200).json({ history });
      }

      res.status(200).json({ history: [] });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Please login.' });
      }

      const { platform, mediaId, title, progress } = req.body || {};
      if (!platform || !mediaId || !title) {
        return res.status(400).json({ error: 'Missing required history parameters.' });
      }

      if (dbService && dbService.isConnectedToDb()) {
        const id = randomBytes(16).toString('hex');
        await dbService.addWatchHistory({
          id,
          userId: user.id,
          platform,
          mediaId,
          title,
          watchedAt: Date.now(),
          progress: typeof progress === 'number' ? progress : 0,
        });
      }

      res.status(201).json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // Curated fallback catalogue matching popular searches and sample assets
  const CURATED_VIDEOS = [
    {
      videoId: 'jJPMnTXl63E',
      title: 'Agam - Krishna Ki Chetavani (Rashmirathi) | Shreeman Narayan Narayan Hari Hari',
      channel: 'Agam Aggarwal',
      duration: '44:47',
      thumbnail: 'https://img.youtube.com/vi/jJPMnTXl63E/hqdefault.jpg',
    },
    {
      videoId: 'RxabLA7UQ9k',
      title: 'Hans Zimmer - Time (Official Audio)',
      channel: 'Hans Zimmer',
      duration: '4:35',
      thumbnail: 'https://img.youtube.com/vi/RxabLA7UQ9k/hqdefault.jpg',
    },
    {
      videoId: 'z2X2nXBahrk',
      title: 'Rebel Foods Story - Building the World\'s Largest Cloud Kitchen',
      channel: 'Rebel Foods',
      duration: '12:45',
      thumbnail: 'https://img.youtube.com/vi/z2X2nXBahrk/hqdefault.jpg',
    },
    {
      videoId: 'cl0a3i2wFcc',
      title: 'Diljit Dosanjh - Lover (Official Music Video)',
      channel: 'Diljit Dosanjh',
      duration: '3:31',
      thumbnail: 'https://img.youtube.com/vi/cl0a3i2wFcc/hqdefault.jpg',
    },
    {
      videoId: '2S4qGKmzBJE',
      title: 'The Rumbling (TV Size) - Attack on Titan Final Season Part 2 OP',
      channel: 'SiM Official',
      duration: '1:30',
      thumbnail: 'https://img.youtube.com/vi/2S4qGKmzBJE/hqdefault.jpg',
    },
    {
      videoId: 'jfKfPfyJRdk',
      title: 'Lofi Hip Hop Radio - Beats to Relax/Study to',
      channel: 'Lofi Girl',
      duration: 'LIVE',
      thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    },
    {
      videoId: 'KvMY1uzSC1E',
      title: 'Cyberpunk Edgerunners - I Really Want to Stay at Your House',
      channel: 'Rosa Walton',
      duration: '4:06',
      thumbnail: 'https://img.youtube.com/vi/KvMY1uzSC1E/hqdefault.jpg',
    },
    {
      videoId: 'mpCOh_J_uOU',
      title: 'LiSA - Gurenge (Demon Slayer Kimetsu no Yaiba OP)',
      channel: 'LiSA Official',
      duration: '3:56',
      thumbnail: 'https://img.youtube.com/vi/mpCOh_J_uOU/hqdefault.jpg',
    },
    {
      videoId: 'Way9Dexny3w',
      title: 'Dune: Part Two | Official Trailer 3',
      channel: 'Warner Bros. Pictures',
      duration: '2:53',
      thumbnail: 'https://img.youtube.com/vi/Way9Dexny3w/hqdefault.jpg',
    },
    {
      videoId: 'UDVtMYqUAyw',
      title: 'Hans Zimmer - Interstellar Main Theme',
      channel: 'Hans Zimmer',
      duration: '6:47',
      thumbnail: 'https://img.youtube.com/vi/UDVtMYqUAyw/hqdefault.jpg',
    },
  ];

  // Search YouTube videos endpoint (rate limited + fetch timeouts + sanitization)
  app.get('/api/youtube/search', apiRateLimiter(60, 60000), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) {
        return res.status(400).json({ error: 'Query parameter q is required.' });
      }

      // Check if q is a direct YouTube URL or 11-char video ID
      const directId = extractYouTubeId(q);
      if (directId) {
        try {
          const oembedRes = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${directId}&format=json`,
            { signal: AbortSignal.timeout(4000) }
          );
          if (oembedRes.ok) {
            const oembedData: any = await oembedRes.json();
            return res.status(200).json({
              query: q,
              results: [
                {
                  videoId: directId,
                  title: oembedData.title || `YouTube Video (${directId})`,
                  channel: oembedData.author_name || 'YouTube',
                  duration: '',
                  thumbnail:
                    oembedData.thumbnail_url || `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
                },
              ],
            });
          }
        } catch {
          // ignore oembed error and return fallback direct item
        }

        return res.status(200).json({
          query: q,
          results: [
            {
              videoId: directId,
              title: `YouTube Video (${directId})`,
              channel: 'YouTube',
              duration: '',
              thumbnail: `https://img.youtube.com/vi/${directId}/hqdefault.jpg`,
            },
          ],
        });
      }

      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      const videos: Array<{ videoId: string; title: string; channel: string; duration: string; thumbnail: string }> = [];

      try {
        const response = await fetch(searchUrl, {
          signal: AbortSignal.timeout(2500),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cookie': 'SOCS=CAESEwgDEgk2MTU3NTc2NTYaAmVuIAEaBgiA_LyaBg; CONSENT=PENDING+999;',
          },
        });

        if (response.ok) {
          const html = await response.text();
          const match = html.match(/var ytInitialData = ({.*?});<\/script>/);

          if (match) {
            try {
              const data = JSON.parse(match[1]);
              const findVideos = (obj: any) => {
                if (!obj || typeof obj !== 'object' || videos.length >= 15) return;
                if (obj.videoRenderer) {
                  const vr = obj.videoRenderer;
                  const vid = vr.videoId;
                  const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
                  const duration = vr.lengthText?.simpleText || '';
                  const channel = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || '';
                  const thumbs = vr.thumbnail?.thumbnails || [];
                  const thumb = thumbs[thumbs.length - 1]?.url || `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
                  if (vid && title && !videos.some((v) => v.videoId === vid)) {
                    videos.push({ videoId: vid, title, channel, duration, thumbnail: thumb });
                  }
                }
                if (Array.isArray(obj)) {
                  for (const item of obj) findVideos(item);
                } else {
                  for (const key of Object.keys(obj)) {
                    // Prototype pollution guard (CodeQL / Semgrep rule)
                    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
                    findVideos(obj[key]);
                  }
                }
              };
              findVideos(data);
            } catch {
              // ignore parse errors
            }
          }

          if (videos.length === 0) {
            const vidMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
            const seen = new Set<string>();
            for (const m of vidMatches) {
              const vid = m[1];
              if (!seen.has(vid) && videos.length < 10) {
                seen.add(vid);
                videos.push({
                  videoId: vid,
                  title: `YouTube Video (${vid})`,
                  channel: 'YouTube',
                  duration: '',
                  thumbnail: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
                });
              }
            }
          }
        }
      } catch {
        // network or scraping error: fall through to curated catalogue
      }

      // If scraping returned results, send them
      if (videos.length > 0) {
        return res.status(200).json({ query: q, results: videos });
      }

      // Fallback to curated catalogue matches
      const lower = q.toLowerCase();
      const matched = CURATED_VIDEOS.filter(
        (v) => v.title.toLowerCase().includes(lower) || v.channel.toLowerCase().includes(lower)
      );

      const fallbackResults = matched.length > 0 ? matched : CURATED_VIDEOS.slice(0, 6);
      return res.status(200).json({ query: q, results: fallbackResults });
    } catch (err) {
      next(err);
    }
  });

  // Serve static client build if it exists (e.g. monolithic or Render deployment)
  const candidateClientDirs = [
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), '../dist'),
  ];
  const clientDist = candidateClientDirs.find(
    (dir) => fs.existsSync(dir) && fs.existsSync(path.join(dir, 'index.html'))
  );
  if (clientDist) {
    app.use(express.static(clientDist));
    app.get('*', rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: 'Too many requests. Please slow down.' }),
    }), (req: Request, res: Response) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    // Fallback: serve a basic index.html when client build doesn't exist
    // This prevents "Cannot GET /" errors on first deployment
    app.get('/', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SyncTube - Watch Party</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
      backdrop-filter: blur(10px);
      max-width: 500px;
    }
    h1 { font-size: 2.5em; margin-bottom: 10px; }
    p { font-size: 1.1em; opacity: 0.9; margin-bottom: 20px; line-height: 1.6; }
    .status {
      display: inline-block;
      padding: 10px 20px;
      background: rgba(76, 175, 80, 0.3);
      border-left: 4px solid #4caf50;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.9em;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 SyncTube</h1>
    <p>Watch YouTube together, in sync.</p>
    <p>The frontend is loading. If you keep seeing this, the client build may not be deployed correctly.</p>
    <div class="status">API Server: ✓ Running</div>
  </div>
</body>
</html>`);
    });

    // Catch-all for unmatched routes when no client build
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SyncTube - Watch Party</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
      backdrop-filter: blur(10px);
      max-width: 500px;
    }
    h1 { font-size: 2.5em; margin-bottom: 10px; }
    p { font-size: 1.1em; opacity: 0.9; margin-bottom: 20px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 SyncTube</h1>
    <p>Frontend assets not yet available. Please check back soon!</p>
  </div>
</body>
</html>`);
    });
  }

  // 4-argument Express error handling middleware (Semgrep / Sentry / CodeQL standard)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    serverSentry.captureException(err);
    const status = typeof err.status === 'number' ? err.status : 500;
    res.status(status).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error',
    });
  });

  return app;
}
