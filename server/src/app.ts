import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { RoomManager } from './models/RoomManager.js';
import { DatabaseService } from './services/db.js';
import { extractYouTubeId } from './utils/youtube.js';

export function createApp(roomManager: RoomManager, dbService?: DatabaseService): Express {
  const app = express();

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
      /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  };

  app.use(cors({
    origin: isAllowedOrigin,
    credentials: true,
  }));

  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      roomsActive: roomManager.getRoomCount(),
    });
  });

  // Create room endpoint
  app.post('/api/rooms', async (req: Request, res: Response) => {
    try {
      const { initialVideoId } = req.body || {};
      let videoId = 'LXb3EKWsInQ';

      if (initialVideoId) {
        const parsed = extractYouTubeId(initialVideoId);
        if (!parsed) {
          return res.status(400).json({ error: 'Invalid YouTube video URL or ID.' });
        }
        videoId = parsed;
      }

      const room = roomManager.createRoom(undefined, videoId);

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
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get room info endpoint
  app.get('/api/rooms/:roomId', async (req: Request, res: Response) => {
    const roomId = req.params.roomId.toUpperCase();
    let room = roomManager.getRoom(roomId);

    if (!room && dbService) {
      const dbRecord = await dbService.getRoom(roomId);
      if (dbRecord) {
        room = roomManager.createRoom(dbRecord.id, dbRecord.video_id);
        room.playState = dbRecord.play_state as any;
        room.currentTime = dbRecord.current_time;
        room.updatedAt = Number(dbRecord.updated_at);
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
  });

  // Search YouTube videos endpoint
  app.get('/api/youtube/search', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) {
        return res.status(400).json({ error: 'Query parameter q is required.' });
      }

      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        return res.status(502).json({ error: 'Failed to fetch search results from YouTube.' });
      }

      const html = await response.text();
      const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
      const videos: Array<{ videoId: string; title: string; duration: string; thumbnail: string }> = [];

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
              const thumbs = vr.thumbnail?.thumbnails || [];
              const thumb = thumbs[thumbs.length - 1]?.url || `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
              if (vid && title && !videos.some((v) => v.videoId === vid)) {
                videos.push({ videoId: vid, title, duration, thumbnail: thumb });
              }
            }
            if (Array.isArray(obj)) {
              for (const item of obj) findVideos(item);
            } else {
              for (const key of Object.keys(obj)) findVideos(obj[key]);
            }
          };
          findVideos(data);
        } catch {
          // ignore json parse error
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
              duration: '',
              thumbnail: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
            });
          }
        }
      }

      res.status(200).json({ query: q, results: videos });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Serve static client build if it exists (e.g. monolithic or Render deployment)
  const clientDist = path.resolve(process.cwd(), '../dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}
