import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { RoomManager } from './models/RoomManager.js';
import { DatabaseService } from './services/db.js';
import { extractYouTubeId } from './utils/youtube.js';

export function createApp(roomManager: RoomManager, dbService?: DatabaseService): Express {
  const app = express();

  const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, 'http://localhost:5173']
    : '*';

  app.use(cors({
    origin: allowedOrigins,
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
      let videoId = 'dQw4w9WgXcQ';

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
