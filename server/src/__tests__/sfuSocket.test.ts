import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { setupSocketHandlers } from '../socket/handler.js';
import { RoomManager } from '../models/RoomManager.js';
import { DatabaseService } from '../services/db.js';
import { mediasoupManager } from '../media/mediasoupManager.js';
import { callTopologyPolicyManager } from '../media/callTopologyPolicy.js';

describe('SFU and P2P Socket Signaling Security & Isolation', () => {
  let server: any;
  let io: Server;
  let port: number;
  let clientSocket1: ClientSocket;
  let clientSocket2: ClientSocket;
  let clientSocket3: ClientSocket;
  let roomManager: RoomManager;
  let db: DatabaseService;
  const roomId = 'SFU_SEC_TEST_ROOM';

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

    // Create room
    roomManager.createRoom(roomId, 'host-user-1', 'HostUser');
  });

  afterAll(async () => {
    clientSocket1?.disconnect();
    clientSocket2?.disconnect();
    clientSocket3?.disconnect();
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

  it('rejects SFU transport creation if caller has not joined media call', async () => {
    clientSocket1 = await connectClient('user-1', 'UserOne');

    const res: any = await new Promise((resolve) => {
      clientSocket1.emit('sfu:create_transport', { direction: 'send' }, (response: any) => {
        resolve(response);
      });
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Caller not in active room call');
  });

  it('allows SFU router capabilities and transport creation once caller joins call', async () => {
    // Join call
    clientSocket1.emit('call:join', { hasAudio: true, hasVideo: true });

    // Wait for call:participants_updated
    await new Promise<void>((resolve) => {
      clientSocket1.once('call:participants_updated', () => resolve());
    });

    // 1. Get router capabilities
    const capsRes: any = await new Promise((resolve) => {
      clientSocket1.emit('sfu:get_router_capabilities', {}, (response: any) => {
        resolve(response);
      });
    });

    expect(capsRes.success).toBe(true);
    expect(capsRes.rtpCapabilities).toBeDefined();

    // 2. Create send transport
    const trRes: any = await new Promise((resolve) => {
      clientSocket1.emit('sfu:create_transport', { direction: 'send' }, (response: any) => {
        resolve(response);
      });
    });

    expect(trRes.success).toBe(true);
    expect(trRes.transport.id).toBeDefined();
  });

  it('emits topology transition to P2P when 2nd caller joins, and to SFU when 3rd caller joins', async () => {
    clientSocket2 = await connectClient('user-2', 'UserTwo');

    // Setup listener on clientSocket1 for transitions
    const p2pPromise = new Promise<any>((resolve) => {
      clientSocket1.once('call:topology_transition', (t) => resolve(t));
    });

    // Caller 2 joins -> should transition to P2P
    clientSocket2.emit('call:join', { hasAudio: true, hasVideo: false });
    const p2pTransition = await p2pPromise;

    expect(p2pTransition.mode).toBe('p2p');

    // Caller 3 joins -> should transition to SFU!
    const sfuPromise = new Promise<any>((resolve) => {
      clientSocket1.once('call:topology_transition', (t) => resolve(t));
    });

    clientSocket3 = await connectClient('user-3', 'UserThree');
    clientSocket3.emit('call:join', { hasAudio: true, hasVideo: false });
    const sfuTransition = await sfuPromise;

    expect(sfuTransition.mode).toBe('sfu');
  });

  it('rejects P2P signaling if target is not in the active room call', async () => {
    const errorPromise = new Promise<any>((resolve) => {
      clientSocket1.once('error', (err) => resolve(err));
    });

    clientSocket1.emit('call:p2p:offer', {
      targetSocketId: 'non-existent-socket-outside-room',
      offer: { type: 'offer', sdp: 'fake-sdp' },
    });

    const err = await errorPromise;
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toContain('Signaling target is not an active caller');
  });
});
