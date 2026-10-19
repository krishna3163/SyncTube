import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { setupSocketHandlers } from '../socket/handler.js';
import { RoomManager } from '../models/RoomManager.js';
import { DatabaseService } from '../services/db.js';
import { mediasoupManager } from '../media/mediasoupManager.js';

describe('Mediasoup SFU Authorization & Eviction Hardening', () => {
  let server: any;
  let io: Server;
  let port: number;
  let hostSocket: ClientSocket;
  let participantSocket: ClientSocket;
  let roomManager: RoomManager;
  let db: DatabaseService;
  const roomId = 'SFU_AUTH_TEST_ROOM';

  beforeAll(async () => {
    const app = express();
    server = createServer(app);
    io = new Server(server, { cors: { origin: '*' } });
    roomManager = new RoomManager();
    db = new DatabaseService();

    setupSocketHandlers(io, roomManager, db);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });

    // Create room with host
    roomManager.createRoom(roomId, 'host-id-1', 'HostUser');
  });

  afterAll(async () => {
    hostSocket?.disconnect();
    participantSocket?.disconnect();
    await mediasoupManager.close();
    io?.close();
    server?.close();
  });

  const connectClient = (userId: string, username: string): Promise<ClientSocket> => {
    return new Promise((resolve) => {
      const socket = Client(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });
      socket.on('connect', () => {
        socket.emit('join_room', { roomId, userId, username });
        socket.once('sync_state', () => {
          resolve(socket);
        });
      });
    });
  };

  it('allows active non-blocked caller to create SFU transport', async () => {
    hostSocket = await connectClient('host-id-1', 'HostUser');
    participantSocket = await connectClient('participant-id-2', 'ParticipantUser');

    // Participant joins call
    participantSocket.emit('call:join', { hasAudio: true, hasVideo: true });
    await new Promise<void>((resolve) => {
      participantSocket.once('call:participants_updated', () => resolve());
    });

    const res: any = await new Promise((resolve) => {
      participantSocket.emit('sfu:create_transport', { direction: 'send' }, (response: any) => {
        resolve(response);
      });
    });

    expect(res.success).toBe(true);
    expect(res.transport.id).toBeDefined();
  });

  it('rejects SFU operations when participant is call-blocked by host', async () => {
    // Host blocks participant from calling
    hostSocket.emit('admin:toggle_block_call', { targetUserId: 'participant-id-2' });

    // Wait for user_joined or force_left notification
    await new Promise<void>((resolve) => {
      participantSocket.once('call:force_left', () => resolve());
    });

    // Attempt to create transport while blocked
    const res: any = await new Promise((resolve) => {
      participantSocket.emit('sfu:create_transport', { direction: 'send' }, (response: any) => {
        resolve(response);
      });
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('blocked from voice & video calls');
  });

  it('rejects sfu:produce when participant is blocked from call', async () => {
    const produceRes: any = await new Promise((resolve) => {
      participantSocket.emit(
        'sfu:produce',
        {
          transportId: 'fake-transport',
          kind: 'audio',
          rtpParameters: { codecs: [] },
        },
        (response: any) => {
          resolve(response);
        }
      );
    });

    expect(produceRes.success).toBe(false);
    expect(produceRes.error).toContain('blocked from voice & video calls');
  });
});
