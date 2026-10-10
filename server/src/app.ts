import { z } from 'zod';
import express, { Express, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { RoomManager } from './models/RoomManager.js';
import { DatabaseService } from './services/db.js';
import { extractYouTubeId } from './utils/youtube.js';
import { detectMediaSource } from './utils/media.js';
import { serverSentry } from './services/sentry.js';
import { AuthService, UserProfile } from './services/auth.js';
import { movieProvider, STREAM_REFERER, decodeDashToken } from './services/movieProvider.js';
import { validateSafeUrl } from './utils/ssrfValidator.js';


export function createApp(roomManager: RoomManager, dbService?: DatabaseService, authService?: AuthService): Express {
  const auth = authService || new AuthService(dbService);
  const app = express();
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

  // Security Headers (Satisfies Semgrep and Lighthouse best practices)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  const isAllowedOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    if (process.env.FRONTEND_URL && (origin === process.env.FRONTEND_URL || origin.startsWith(process.env.FRONTEND_URL))) {
      return callback(null, true);
    }
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com') ||
      /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(origin)
    ) {
      return callback(null, true);
    }
    // Deny unknown origins in production to prevent CORS credential leakage (CodeQL CWE-942)
    return callback(new Error('CORS origin rejected'), false);
  };

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
    handler: (_req, res) => res.status(429).json({ error: 'Too many requests. Please slow down.' }),
  });
  app.use('/api', apiRateLimiter(120, 60000));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      roomsActive: roomManager.getRoomCount(),
    });
  });

  // Create room endpoint (protected by rate limiter)
  app.post('/api/rooms', apiRateLimiter(30, 60000), async (req: Request, res: Response, next: NextFunction) => {
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
      title: 'Rebel Foods Story - Building the World’s Largest Cloud Kitchen',
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

  // ==========================================
  // MOVIEBOX INTEGRATION & STREAM PROXY ROUTES
  // ==========================================

  // GET /api/movies/trending — Get trending movies & series
  app.get('/api/movies/trending', async (_req: Request, res: Response) => {
    try {
      const results = await movieProvider.getTrendingMedia();
      return res.json({ success: true, results });
    } catch (err: any) {
      serverSentry.captureException(err);
      return res.status(502).json({ success: false, error: err?.message || 'Failed to fetch trending media' });
    }
  });

// GET /api/movies/search — Search movies and TV shows
  app.get('/api/movies/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const page = parseInt(req.query.page as string, 10) || 1;
      if (!q) {
        return res.json({ success: true, results: [] });
      }
      const results = await movieProvider.searchMedia(q, page);
      return res.json({ success: true, results });
    } catch (err: any) {
      serverSentry.captureException(err);
      return res.status(502).json({ success: false, error: err?.message || 'Movie search failed' });
    }
  });

  // GET /api/movies/details/:id — Get movie/show details, synopsis, ratings, and seasons
  app.get('/api/movies/details/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subjectId = req.params.id;
      if (!subjectId) {
        return res.status(400).json({ success: false, error: 'Movie ID is required' });
      }
      const details = await movieProvider.getMediaDetails(subjectId);
      return res.json({ success: true, details });
    } catch (err: any) {
      serverSentry.captureException(err);
      return res.status(502).json({ success: false, error: err?.message || 'Failed to retrieve details' });
    }
  });

  // GET /api/movies/streams — Resolve direct streaming URLs and subtitles
  app.get('/api/movies/streams', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subjectId = typeof req.query.id === 'string' ? req.query.id : '';
      const season = parseInt(req.query.season as string, 10) || 0;
      const episode = parseInt(req.query.episode as string, 10) || 0;
      if (!subjectId) {
        return res.status(400).json({ success: false, error: 'Media ID is required' });
      }
      const data = await movieProvider.getStreamSources(subjectId, season, episode, '/api/movies/proxy');
      return res.json({ success: true, ...data });
    } catch (err: any) {
      serverSentry.captureException(err);
      return res.status(502).json({ success: false, error: err?.message || 'Failed to resolve streams' });
    }
  });

  // GET/HEAD /api/movies/dash/:token/:file(*) — High-performance DASH manifest and segment streaming proxy
  app.all('/api/movies/dash/:token/:file(*)?', async (req: Request, res: Response) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const token = req.params.token;
    const file = req.params.file || 'index.mpd';
    const decoded = decodeDashToken(token);

    if (!decoded || !decoded.manifestUrl) {
      return res.status(400).json({ error: 'Invalid or expired DASH token' });
    }

    // SSRF Check on the manifest URL
    const validated = await validateSafeUrl(decoded.manifestUrl);
    if (!validated.safe || !validated.normalizedUrl) {
      return res.status(403).json({ error: 'Target manifest URL is prohibited' });
    }

    // Determine target URL for manifest or segment
    let targetUrl = validated.normalizedUrl;
    if (file && file !== 'index.mpd') {
      const baseDir = validated.normalizedUrl.substring(0, validated.normalizedUrl.lastIndexOf('/'));
      const safeFile = path.posix.basename(file);
      targetUrl = `${baseDir}/${safeFile}`;
    }

    const targetObj = new URL(targetUrl);
    if (targetObj.protocol !== 'https:' && targetObj.protocol !== 'http:') {
      return res.status(403).json({ error: 'Invalid protocol' });
    }
    switch (targetObj.hostname) {
      case 'macdn.aoneroom.com':
      case 'api6.aoneroom.com':
      case 'api5.aoneroom.com':
      case 'api4.aoneroom.com':
      case 'api3.aoneroom.com':
      case 'api.inmoviebox.com':
      case 'commondatastorage.googleapis.com':
      case 'storage.googleapis.com':
      case 'archive.org':
      case 'sportslive.wine':
        break;
      default:
        return res.status(403).json({ error: 'Target host is not an authorized media provider' });
    }
    const safeUrl = new URL(targetObj.pathname + targetObj.search, targetObj.origin);

    try {
      const upstreamHeaders: Record<string, string> = {
        Referer: STREAM_REFERER,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      if (decoded.cookie) {
        upstreamHeaders['Cookie'] = decoded.cookie;
      }

      if (req.headers.range) {
        upstreamHeaders['Range'] = req.headers.range;
      }

      const upstreamRes = await fetch(safeUrl.href, {
        method: req.method,
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(15000),
      });

      // Enable CORS and Cross-Origin Resource Policy so Video Ambient Mode and Dash.js can read frames
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Accept-Ranges', 'bytes');

      let contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
      if (file.endsWith('.mpd') || targetUrl.endsWith('.mpd')) {
        contentType = 'application/dash+xml';
      } else if (file.endsWith('.m4s') || targetUrl.endsWith('.m4s')) {
        contentType = 'video/iso.segment';
      }
      res.setHeader('Content-Type', contentType);

      const contentLength = upstreamRes.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const contentRange = upstreamRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      res.status(upstreamRes.status);

      if (req.method === 'HEAD' || !upstreamRes.body) {
        return res.end();
      }

      const nodeStream = Readable.fromWeb(upstreamRes.body as any);
      nodeStream.pipe(res);
    } catch (err: any) {
      if (!res.headersSent) {
        return res.status(502).json({ error: 'Upstream DASH segment fetch failed', details: err?.message });
      }
    }
  });

  // GET/HEAD /api/movies/proxy — High-performance streaming proxy for HTML5 video and Ambient Mode
  app.all('/api/movies/proxy', async (req: Request, res: Response) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl) {
      return res.status(400).json({ error: 'Target URL parameter is required' });
    }

    // SSRF Check to prevent internal network scanning
    const validated = await validateSafeUrl(rawUrl);
    if (!validated.safe || !validated.normalizedUrl) {
      return res.status(403).json({ error: validated.error || 'Access to target URL is prohibited' });
    }

    const targetObj = new URL(validated.normalizedUrl);
    if (targetObj.protocol !== 'https:' && targetObj.protocol !== 'http:') {
      return res.status(403).json({ error: 'Invalid protocol' });
    }
    switch (targetObj.hostname) {
      case 'macdn.aoneroom.com':
      case 'api6.aoneroom.com':
      case 'api5.aoneroom.com':
      case 'api4.aoneroom.com':
      case 'api3.aoneroom.com':
      case 'api.inmoviebox.com':
      case 'commondatastorage.googleapis.com':
      case 'storage.googleapis.com':
      case 'archive.org':
      case 'sportslive.wine':
        break;
      default:
        return res.status(403).json({ error: 'Target host is not an authorized media provider' });
    }
    const safeUrl = new URL(targetObj.pathname + targetObj.search, targetObj.origin);

    try {
      const upstreamHeaders: Record<string, string> = {
        Referer: STREAM_REFERER,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

      if (req.headers.range) {
        upstreamHeaders['Range'] = req.headers.range;
      }

      const upstreamRes = await fetch(safeUrl.href, {
        method: req.method,
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(15000),
      });

      // Enable CORS and Cross-Origin Resource Policy so Video Ambient Mode can read frames
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Accept-Ranges', 'bytes');

      const contentType = upstreamRes.headers.get('content-type') || 'video/mp4';
      res.setHeader('Content-Type', contentType);

      const contentLength = upstreamRes.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const contentRange = upstreamRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      res.status(upstreamRes.status);

      if (req.method === 'HEAD' || !upstreamRes.body) {
        return res.end();
      }

      const nodeStream = Readable.fromWeb(upstreamRes.body as any);
      nodeStream.pipe(res);
    } catch (err: any) {
      if (!res.headersSent) {
        return res.status(502).json({ error: 'Upstream media fetch failed', details: err?.message });
      }
    }
  });

  // Serve static client build if it exists (e.g. monolithic or Render deployment)
  const clientDist = path.resolve(process.cwd(), '../dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: 'Too many requests. Please slow down.' }),
    }), (_req: Request, res: Response) => {
      res.sendFile(path.join(clientDist, 'index.html'));
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
