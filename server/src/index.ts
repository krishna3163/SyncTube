import http from 'http';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { RoomManager } from './models/RoomManager.js';
import { DatabaseService } from './services/db.js';
import { setupSocketHandlers } from './socket/handler.js';
import { serverSentry } from './services/sentry.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '10000', 10);
const HOST = '0.0.0.0';

async function bootstrap() {
  const roomManager = new RoomManager();
  const dbService = new DatabaseService();

  await dbService.init();

  const app = createApp(roomManager, dbService);
  const server = http.createServer(app);

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
    return callback(new Error('CORS origin rejected'), false);
  };

  const io = new Server(server, {
    cors: {
      origin: isAllowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  setupSocketHandlers(io, roomManager, dbService);

  // Global uncaught crash handlers reporting to Sentry
  process.on('unhandledRejection', (reason) => {
    console.error('[Process Unhandled Rejection]:', reason);
    serverSentry.captureException(reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[Process Uncaught Exception]:', err);
    serverSentry.captureException(err);
  });

  server.listen(PORT, HOST, () => {
    console.log(`[Server] Watch Party backend running on http://${HOST}:${PORT}`);
    console.log(`[Server] Health check available at http://${HOST}:${PORT}/health`);
  });

  // Periodically clean up empty rooms older than 1 hour (runs every 15 minutes)
  const cleanupInterval = setInterval(() => {
    const cleaned = roomManager.cleanupStaleRooms(60 * 60 * 1000);
    if (cleaned > 0) {
      console.log(`[Server] Cleaned up ${cleaned} inactive room(s) from memory.`);
    }
  }, 15 * 60 * 1000);
  cleanupInterval.unref();

  const shutdown = async () => {
    console.log('[Server] Shutting down gracefully...');
    clearInterval(cleanupInterval);
    await dbService.close();
    server.close(() => {
      console.log('[Server] Closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  serverSentry.captureException(err);
  process.exit(1);
});
