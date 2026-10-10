import http from 'http';
import cluster from 'node:cluster';
import os from 'node:os';
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
const CLUSTER_ENABLED = process.env.CLUSTER === '1' || process.env.CLUSTER === 'true';
// Auto-enable cluster in production when multiple CPUs are available unless explicitly disabled
const AUTO_CLUSTER = process.env.CLUSTER !== '0' && process.env.NODE_ENV === 'production' && os.cpus().length > 1;

async function startWorker() {
  const roomManager = new RoomManager();
  const dbService = new DatabaseService();
  const authService = new AuthService(dbService);

  await dbService.init();

  const app = createApp(roomManager, dbService, authService);
  const server = http.createServer(app);

  // Keep-alive tuning for 10k concurrent connections
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.maxConnections = parseInt(process.env.MAX_CONNECTIONS || '20000', 10);
  // Raise max listeners to avoid warnings under high fan-out (rooms × participants)
  server.setMaxListeners(0);

  // Optional Redis adapter for Socket.IO horizontal scaling (10k+)
  // When REDIS_URL is set (e.g. redis://localhost:6379) every worker will publish
  // room broadcasts through Redis so a client on worker A receives events emitted on worker B.
  // Without Redis each worker is isolated — still useful for HTTP scaling but WS rooms won't sync.
  // Install with: npm i ioredis @socket.io/redis-adapter   then set REDIS_URL
  let redisAdapterApplied = false;
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (redisUrl) {
    try {
      // Optional peers — only needed when REDIS_URL is set for 10k horizontal scaling
      // @ts-ignore - ioredis is an optional peer, not required for single-instance dev
      const ioredisMod: any = await import('ioredis').catch(() => null);
      // @ts-ignore - @socket.io/redis-adapter is an optional peer
      const redisAdapterMod: any = await import('@socket.io/redis-adapter').catch(() => null);
      if (ioredisMod && redisAdapterMod) {
        const Redis = ioredisMod.default || ioredisMod.Redis || ioredisMod;
        const pubClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });
        const subClient = pubClient.duplicate();
        // Wait briefly for clients to be ready; don't block boot forever
        await Promise.race([
          Promise.all([pubClient.ping().catch(() => {}), subClient.ping().catch(() => {})]),
          new Promise((r) => setTimeout(r, 2000)),
        ]);
        // adapter will be attached after io creation
        (global as any).__synctubeRedisClients = { pubClient, subClient, adapter: redisAdapterMod.createAdapter || redisAdapterMod };
        console.log('[Server] Redis URL detected — Socket.IO Redis adapter will be enabled.');
      } else {
        console.warn('[Server] REDIS_URL is set but ioredis / @socket.io/redis-adapter not installed. Run: npm i ioredis @socket.io/redis-adapter');
      }
    } catch (e) {
      console.warn('[Server] Redis adapter setup failed, falling back to in-memory adapter:', (e as Error).message);
    }
  }

  const io = new Server(server, {
    // Tuned for 10k concurrent sockets
    cors: {
      origin: isAllowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6, // 1 MB
    perMessageDeflate: false, // disable permessage-deflate to save CPU at scale; enable if bandwidth is tighter than CPU
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  // Apply Redis adapter if clients were created
  const redisCtx: any = (global as any).__synctubeRedisClients;
  if (redisCtx?.pubClient && redisCtx?.subClient && redisCtx?.adapter) {
    try {
      const createAdapter = redisCtx.adapter.createAdapter || redisCtx.adapter;
      io.adapter(createAdapter(redisCtx.pubClient, redisCtx.subClient));
      redisAdapterApplied = true;
      console.log('[Server] Socket.IO Redis adapter active — horizontal scaling enabled.');
    } catch (e) {
      console.warn('[Server] Could not attach Redis adapter:', (e as Error).message);
    }
  }

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
    const workerTag = cluster.isWorker ? `worker ${cluster.worker?.id}` : 'primary';
    console.log(`[Server] (${workerTag} pid ${process.pid}) Watch Party backend running on http://${HOST}:${PORT}  redis=${redisAdapterApplied ? 'on' : 'off'}  cluster=${cluster.isWorker ? 'worker' : 'single'}`);
    console.log(`[Server] Health check available at http://${HOST}:${PORT}/health`);
  });

  // Periodically clean up empty rooms older than 1 hour (runs every 15 minutes)
  // Also enforce hard cap to avoid OOM under 10k spikes — oldest empty rooms are dropped first.
  const cleanupInterval = setInterval(() => {
    const cleaned = roomManager.cleanupStaleRooms(60 * 60 * 1000);
    if (cleaned > 0) {
      console.log(`[Server] Cleaned up ${cleaned} inactive room(s) from memory.`);
    }
    // Emergency cap: if we somehow exceed 20k rooms (should never happen at 10k users with ~10 per room)
    const MAX_ROOMS = parseInt(process.env.MAX_ROOMS || '20000', 10);
    if (roomManager.getRoomCount() > MAX_ROOMS) {
      console.warn(`[Server] Room count ${roomManager.getRoomCount()} exceeds cap ${MAX_ROOMS}, forcing extra cleanup (30 min threshold)`);
      roomManager.cleanupStaleRooms(30 * 60 * 1000);
    }
  }, 15 * 60 * 1000);
  cleanupInterval.unref();

  const shutdown = async () => {
    console.log('[Server] Shutting down gracefully...');
    clearInterval(cleanupInterval);
    try {
      if (redisCtx?.pubClient) await redisCtx.pubClient.quit().catch(() => {});
      if (redisCtx?.subClient) await redisCtx.subClient.quit().catch(() => {});
    } catch {}
    await dbService.close();
    server.close(() => {
      console.log('[Server] Closed.');
      process.exit(0);
    });
    io.close();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function bootstrap() {
  const shouldCluster = CLUSTER_ENABLED || AUTO_CLUSTER;
  if (shouldCluster && cluster.isPrimary) {
    const cpuCount = os.cpus().length;
    // Cap workers to avoid over-subscription on small hosts; allow override via WORKERS env
    const requested = parseInt(process.env.WORKERS || '', 10);
    const numWorkers = Number.isFinite(requested) && requested > 0 ? Math.min(requested, cpuCount * 2) : cpuCount;
    console.log(`[Cluster] Primary ${process.pid} starting ${numWorkers} workers (cpus=${cpuCount}) — set CLUSTER=0 to disable`);
    for (let i = 0; i < numWorkers; i++) cluster.fork();
    cluster.on('exit', (worker, code, signal) => {
      console.warn(`[Cluster] Worker ${worker.process.pid} died (code=${code} signal=${signal}). Restarting...`);
      setTimeout(() => cluster.fork(), 1000);
    });
    // Graceful shutdown of primary forwards to workers
    const shutdownPrimary = () => {
      console.log('[Cluster] Primary shutting down, disconnecting workers...');
      cluster.disconnect(() => process.exit(0));
    };
    process.on('SIGINT', shutdownPrimary);
    process.on('SIGTERM', shutdownPrimary);
    return;
  }
  await startWorker();
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  serverSentry.captureException(err);
  process.exit(1);
});
