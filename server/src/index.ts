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
import { isClusterEnabled } from './utils/cluster.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '10000', 10);
const HOST = '0.0.0.0';
const CLUSTER_ENABLED = isClusterEnabled();

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

  // Optional Redis Streams / Pub-Sub adapter for Socket.IO horizontal scaling (10k+)
  // When REDIS_URL is set (e.g. redis://localhost:6379), workers publish room broadcasts
  // through Redis Streams or Pub-Sub so clients across instances remain synchronized.
  // Prioritizes @socket.io/redis-streams-adapter for message durability and connection-state recovery.
  let redisAdapterApplied = false;
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (redisUrl) {
    try {
      // Optional peers — only needed when REDIS_URL is set for horizontal scaling
      // @ts-ignore - ioredis is an optional peer, not required for single-instance dev
      const ioredisMod: any = await import('ioredis').catch(() => null);
      // @ts-ignore - prioritize official Redis Streams adapter (Repository E)
      const redisStreamsMod: any = await import('@socket.io/redis-streams-adapter').catch(() => null);
      // @ts-ignore - fallback to classic pub-sub adapter if streams adapter not installed
      const redisAdapterMod: any = !redisStreamsMod ? await import('@socket.io/redis-adapter').catch(() => null) : null;

      if (ioredisMod && (redisStreamsMod || redisAdapterMod)) {
        const Redis = ioredisMod.default || ioredisMod.Redis || ioredisMod;
        const pubClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });

        if (redisStreamsMod) {
          await Promise.race([
            pubClient.ping().catch(() => {}),
            new Promise((r) => setTimeout(r, 2000)),
          ]);
          const streamName = process.env.REDIS_STREAM_KEY || 'synctube:events';
          (global as any).__synctubeRedisClients = {
            redisClient: pubClient,
            adapter: redisStreamsMod.createAdapter || redisStreamsMod,
            type: 'streams',
            streamName,
          };
          console.log('[Server] Redis URL detected — Socket.IO Redis Streams adapter selected.');
        } else {
          const subClient = pubClient.duplicate();
          await Promise.race([
            Promise.all([pubClient.ping().catch(() => {}), subClient.ping().catch(() => {})]),
            new Promise((r) => setTimeout(r, 2000)),
          ]);
          (global as any).__synctubeRedisClients = {
            pubClient,
            subClient,
            adapter: redisAdapterMod.createAdapter || redisAdapterMod,
            type: 'pubsub',
          };
          console.log('[Server] Redis URL detected — Socket.IO classic Redis adapter selected.');
        }
      } else if (redisUrl) {
        console.warn('[Server] REDIS_URL is set but ioredis or adapter not installed. For streams: npm i ioredis @socket.io/redis-streams-adapter');
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
  if (redisCtx) {
    try {
      const createAdapter = redisCtx.adapter.createAdapter || redisCtx.adapter;
      if (redisCtx.type === 'streams' && redisCtx.redisClient) {
        io.adapter(createAdapter(redisCtx.redisClient, { streamName: redisCtx.streamName }));
        redisAdapterApplied = true;
        console.log('[Server] Socket.IO Redis Streams adapter active — horizontal scaling & stream buffering enabled.');
      } else if (redisCtx.pubClient && redisCtx.subClient) {
        io.adapter(createAdapter(redisCtx.pubClient, redisCtx.subClient));
        redisAdapterApplied = true;
        console.log('[Server] Socket.IO classic Redis adapter active — horizontal scaling enabled.');
      }
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
  // A single process is the safe default: room and participant state is local
  // to RoomManager. Set CLUSTER=1 only when the deployment has shared state and
  // the required Socket.IO/load-balancer configuration.
  const shouldCluster = CLUSTER_ENABLED;
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
