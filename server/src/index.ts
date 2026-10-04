import http from 'http';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { RoomManager } from './models/RoomManager.js';
import { DatabaseService } from './services/db.js';
import { setupSocketHandlers } from './socket/handler.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '10000', 10);
const HOST = '0.0.0.0';

async function bootstrap() {
  const roomManager = new RoomManager();
  const dbService = new DatabaseService();

  await dbService.init();

  const app = createApp(roomManager, dbService);
  const server = http.createServer(app);

  const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, 'http://localhost:5173']
    : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => callback(null, true);

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  setupSocketHandlers(io, roomManager, dbService);

  server.listen(PORT, HOST, () => {
    console.log(`[Server] Watch Party backend running on http://${HOST}:${PORT}`);
    console.log(`[Server] Health check available at http://${HOST}:${PORT}/health`);
  });

  const shutdown = async () => {
    console.log('[Server] Shutting down gracefully...');
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
  process.exit(1);
});
