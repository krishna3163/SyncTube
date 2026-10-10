import http from 'http';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { RoomManager } from './models/RoomManager.js';
import { DatabaseService } from './services/db.js';
import { AuthService } from './services/auth.js';
import { setupSocketHandlers } from './socket/handler.js';
import { serverSentry } from './services/sentry.js';
import { isAllowedOrigin } from './utils/cors.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '10000', 10);
const HOST = '0.0.0.0';

async function bootstrap() {
  const roomManager = new RoomManager();
  const dbService = new DatabaseService();
  const authService = new AuthService(dbService);

  await dbService.init();

  const app = createApp(roomManager, dbService, authService);
  const server = http.createServer(app);

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
