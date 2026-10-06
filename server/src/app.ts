import express, { Express, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createHash, randomBytes } from 'node:crypto';
import { RoomManager } from './models/RoomManager.js';
import { DatabaseService } from './services/db.js';
import { extractYouTubeId } from './utils/youtube.js';
import { serverSentry } from './services/sentry.js';

export function createApp(roomManager: RoomManager, dbService?: DatabaseService): Express {
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
        const parsed = extractYouTubeId(initialVideoId);
        if (!parsed) {
          return res.status(400).json({ error: 'Invalid YouTube video URL or ID.' });
        }
        videoId = parsed;
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
        });
      }

      res.status(201).json({
        roomId: room.id,
        videoId: room.videoId,
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
            room = roomManager.createRoom(dbRecord.id, dbRecord.video_id);
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
      });
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
          signal: AbortSignal.timeout(5000),
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
