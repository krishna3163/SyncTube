import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../app.js';
import { RoomManager } from '../models/RoomManager.js';
import { setupSocketHandlers } from '../socket/handler.js';

describe('WebSocket Event Contract & RBAC Integration Tests', () => {
  let server: http.Server;
  let ioServer: SocketIOServer;
  let roomManager: RoomManager;
  let serverUrl: string;
  let clientSockets: ClientSocket[] = [];

  const createClient = (): Promise<ClientSocket> => {
    return new Promise((resolve) => {
      const socket = ClientIO(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });
      clientSockets.push(socket);
      socket.on('connect', () => {
        resolve(socket);
      });
    });
  };

  beforeEach(async () => {
    roomManager = new RoomManager();
    const app = createApp(roomManager);
    server = http.createServer(app);
    ioServer = new SocketIOServer(server, { cors: { origin: '*' } });
    setupSocketHandlers(ioServer, roomManager);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    clientSockets = [];

    await new Promise<void>((resolve) => {
      ioServer.close(() => {
        server.close(() => resolve());
      });
    });
  });

  it('handles room join, assigns HOST to first user and PARTICIPANT to second user', async () => {
    const room = roomManager.createRoom('SYNC01');

    const hostSocket = await createClient();
    const participantSocket = await createClient();

    // 1. Host joins
    const hostJoinPromise = new Promise<any>((resolve) => {
      hostSocket.on('sync_state', (sync) => {
        resolve(sync);
      });
    });

    hostSocket.emit('join_room', {
      roomId: 'SYNC01',
      username: 'AliceHost',
      userId: 'user-host',
    });

    const hostSync = await hostJoinPromise;
    expect(hostSync.videoId).toBe('LXb3EKWsInQ');
    expect(hostSync.playState).toBe('paused');

    // 2. Participant joins
    const participantJoinPromise = new Promise<any>((resolve) => {
      participantSocket.on('user_joined', (payload) => {
        if (payload.userId === 'user-part') {
          resolve(payload);
        }
      });
    });

    participantSocket.emit('join_room', {
      roomId: 'SYNC01',
      username: 'BobParticipant',
      userId: 'user-part',
    });

    const partData = await participantJoinPromise;
    expect(partData.role).toBe('PARTICIPANT');
    expect(partData.participants).toHaveLength(2);
  });

  it('rejects join for non-existent room', async () => {
    const socket = await createClient();

    const errorPromise = new Promise<any>((resolve) => {
      socket.on('error', (err) => resolve(err));
    });

    socket.emit('join_room', {
      roomId: 'NONEXIST',
      username: 'Someone',
      userId: 'user-xyz',
    });

    const err = await errorPromise;
    expect(err.code).toBe('NOT_FOUND');
  });

  it('allows Host to play/pause/seek/change_video, synchronizing to everyone', async () => {
    roomManager.createRoom('PLAY01');
    const hostSocket = await createClient();
    const guestSocket = await createClient();

    hostSocket.emit('join_room', { roomId: 'PLAY01', username: 'HostUser', userId: 'host-1' });
    guestSocket.emit('join_room', { roomId: 'PLAY01', username: 'GuestUser', userId: 'guest-1' });

    // Wait a tick for joins to complete
    await new Promise((r) => setTimeout(r, 50));

    // Test Play
    const playPromise = new Promise<any>((resolve) => {
      guestSocket.once('sync_state', (sync) => resolve(sync));
    });
    hostSocket.emit('play');
    const playSync = await playPromise;
    expect(playSync.playState).toBe('playing');

    // Test Seek
    const seekPromise = new Promise<any>((resolve) => {
      guestSocket.once('sync_state', (sync) => resolve(sync));
    });
    hostSocket.emit('seek', { time: 42.5 });
    const seekSync = await seekPromise;
    expect(seekSync.currentTime).toBe(42.5);

    // Test Pause
    const pausePromise = new Promise<any>((resolve) => {
      guestSocket.once('sync_state', (sync) => resolve(sync));
    });
    hostSocket.emit('pause');
    const pauseSync = await pausePromise;
    expect(pauseSync.playState).toBe('paused');

    // Test Change Video
    const changePromise = new Promise<any>((resolve) => {
      guestSocket.once('sync_state', (sync) => resolve(sync));
    });
    hostSocket.emit('change_video', { videoId: 'M7lc1UVf-VE' });
    const changeSync = await changePromise;
    expect(changeSync.videoId).toBe('M7lc1UVf-VE');
    expect(changeSync.currentTime).toBe(0);
  });

  it('REJECTS privileged actions from Participant (Server-side RBAC enforcement)', async () => {
    roomManager.createRoom('RBAC01');
    const hostSocket = await createClient();
    const guestSocket = await createClient();

    hostSocket.emit('join_room', { roomId: 'RBAC01', username: 'HostUser', userId: 'host-1' });
    guestSocket.emit('join_room', { roomId: 'RBAC01', username: 'GuestUser', userId: 'guest-1' });

    await new Promise((r) => setTimeout(r, 50));

    // Guest attempts to play
    const playErrorPromise = new Promise<any>((resolve) => {
      guestSocket.once('error', (err) => resolve(err));
    });
    guestSocket.emit('play');
    const playErr = await playErrorPromise;
    expect(playErr.code).toBe('FORBIDDEN');

    // Guest attempts to pause
    const pauseErrorPromise = new Promise<any>((resolve) => {
      guestSocket.once('error', (err) => resolve(err));
    });
    guestSocket.emit('pause');
    const pauseErr = await pauseErrorPromise;
    expect(pauseErr.code).toBe('FORBIDDEN');

    // Guest attempts to seek
    const seekErrorPromise = new Promise<any>((resolve) => {
      guestSocket.once('error', (err) => resolve(err));
    });
    guestSocket.emit('seek', { time: 100 });
    const seekErr = await seekErrorPromise;
    expect(seekErr.code).toBe('FORBIDDEN');

    // Guest attempts to change video
    const changeErrorPromise = new Promise<any>((resolve) => {
      guestSocket.once('error', (err) => resolve(err));
    });
    guestSocket.emit('change_video', { videoId: 'M7lc1UVf-VE' });
    const changeErr = await changeErrorPromise;
    expect(changeErr.code).toBe('FORBIDDEN');

    // Guest attempts to assign role
    const roleErrorPromise = new Promise<any>((resolve) => {
      guestSocket.once('error', (err) => resolve(err));
    });
    guestSocket.emit('assign_role', { userId: 'guest-1', role: 'MODERATOR' });
    const roleErr = await roleErrorPromise;
    expect(roleErr.code).toBe('FORBIDDEN');
  });

  it('supports role promotion to MODERATOR and subsequent playback control', async () => {
    roomManager.createRoom('MOD01');
    const hostSocket = await createClient();
    const guestSocket = await createClient();

    hostSocket.emit('join_room', { roomId: 'MOD01', username: 'HostUser', userId: 'host-1' });
    guestSocket.emit('join_room', { roomId: 'MOD01', username: 'GuestUser', userId: 'guest-1' });

    await new Promise((r) => setTimeout(r, 50));

    // Host promotes guest to MODERATOR
    const rolePromise = new Promise<any>((resolve) => {
      guestSocket.once('role_assigned', (data) => resolve(data));
    });
    hostSocket.emit('assign_role', { userId: 'guest-1', role: 'MODERATOR' });
    const roleData = await rolePromise;
    expect(roleData.userId).toBe('guest-1');
    expect(roleData.role).toBe('MODERATOR');

    // Now MODERATOR guest can play
    const playPromise = new Promise<any>((resolve) => {
      hostSocket.once('sync_state', (sync) => resolve(sync));
    });
    guestSocket.emit('play');
    const playSync = await playPromise;
    expect(playSync.playState).toBe('playing');
  });

  it('allows Host to remove participant and prevents them from rejoining', async () => {
    roomManager.createRoom('KICK01');
    const hostSocket = await createClient();
    const guestSocket = await createClient();

    hostSocket.emit('join_room', { roomId: 'KICK01', username: 'HostUser', userId: 'host-1' });
    guestSocket.emit('join_room', { roomId: 'KICK01', username: 'GuestUser', userId: 'guest-1' });

    await new Promise((r) => setTimeout(r, 50));

    // Host removes guest
    const kickPromise = new Promise<any>((resolve) => {
      guestSocket.once('error', (err) => resolve(err));
    });
    hostSocket.emit('remove_participant', { userId: 'guest-1' });
    const kickErr = await kickPromise;
    expect(kickErr.code).toBe('FORBIDDEN');
    expect(kickErr.message).toContain('removed from the room');

    // Kicked user attempts to rejoin
    const rejoinPromise = new Promise<any>((resolve) => {
      guestSocket.once('error', (err) => resolve(err));
    });
    guestSocket.emit('join_room', { roomId: 'KICK01', username: 'GuestUser', userId: 'guest-1' });
    const rejoinErr = await rejoinPromise;
    expect(rejoinErr.code).toBe('FORBIDDEN');
    expect(rejoinErr.message).toContain('removed');
  });

  it('rejects malformed payloads with BAD_REQUEST', async () => {
    roomManager.createRoom('MALFORM01');
    const socket = await createClient();

    const badJoinPromise = new Promise<any>((resolve) => {
      socket.once('error', (err) => resolve(err));
    });
    // Missing username and roomId
    socket.emit('join_room', { invalid: 123 });
    const err = await badJoinPromise;
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('allows Host to transfer Host ownership to another participant', async () => {
    roomManager.createRoom('XFER01');
    const hostSocket = await createClient();
    const guestSocket = await createClient();

    hostSocket.emit('join_room', { roomId: 'XFER01', username: 'OriginalHost', userId: 'host-1' });
    guestSocket.emit('join_room', { roomId: 'XFER01', username: 'NewHost', userId: 'guest-1' });

    await new Promise((r) => setTimeout(r, 50));

    const rolePromise = new Promise<any>((resolve) => {
      guestSocket.once('role_assigned', (payload) => resolve(payload));
    });

    // Transfer host to guest-1
    hostSocket.emit('assign_role', { userId: 'guest-1', role: 'HOST' });
    const roleData = await rolePromise;

    expect(roleData.userId).toBe('guest-1');
    expect(roleData.role).toBe('HOST');

    const participants = roleData.participants;
    const newHost = participants.find((p: any) => p.userId === 'guest-1');
    const demotedHost = participants.find((p: any) => p.userId === 'host-1');

    expect(newHost.role).toBe('HOST');
    expect(demotedHost.role).toBe('MODERATOR');
  });

  it('supports participant action request and Host approval workflow', async () => {
    roomManager.createRoom('REQ01');
    const hostSocket = await createClient();
    const guestSocket = await createClient();

    hostSocket.emit('join_room', { roomId: 'REQ01', username: 'HostUser', userId: 'host-1' });
    guestSocket.emit('join_room', { roomId: 'REQ01', username: 'GuestUser', userId: 'guest-1' });

    await new Promise((r) => setTimeout(r, 50));

    // 1. Participant requests video change
    const requestPromise = new Promise<any>((resolve) => {
      hostSocket.once('action_requested', (payload) => resolve(payload));
    });

    guestSocket.emit('request_action', {
      type: 'change_video',
      data: { videoId: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });

    const reqData = await requestPromise;
    expect(reqData.request.type).toBe('change_video');
    expect(reqData.request.requesterId).toBe('guest-1');
    expect(reqData.request.data.videoId).toBe('dQw4w9WgXcQ');

    // 2. Host approves the request
    const syncPromise = new Promise<any>((resolve) => {
      guestSocket.once('sync_state', (sync) => resolve(sync));
    });

    const resolvePromise = new Promise<any>((resolve) => {
      guestSocket.once('action_request_resolved', (payload) => resolve(payload));
    });

    hostSocket.emit('respond_action_request', {
      requestId: reqData.request.id,
      approved: true,
    });

    const [syncPayload, resolvePayload] = await Promise.all([syncPromise, resolvePromise]);
    expect(syncPayload.videoId).toBe('dQw4w9WgXcQ');
    expect(resolvePayload.approved).toBe(true);
    expect(resolvePayload.resolvedBy).toBe('HostUser');
  });

  it('rejects unauthorized approval attempts from participants', async () => {
    roomManager.createRoom('REQ02');
    const hostSocket = await createClient();
    const guestSocket = await createClient();

    hostSocket.emit('join_room', { roomId: 'REQ02', username: 'HostUser', userId: 'host-1' });
    guestSocket.emit('join_room', { roomId: 'REQ02', username: 'GuestUser', userId: 'guest-1' });

    await new Promise((r) => setTimeout(r, 50));

    const errPromise = new Promise<any>((resolve) => {
      guestSocket.once('error', (err) => resolve(err));
    });

    guestSocket.emit('respond_action_request', {
      requestId: 'dummy-id',
      approved: true,
    });

    const err = await errPromise;
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toContain('Only Host and Moderator');
  });

  it('broadcasts real-time chat messages and emoji reactions', async () => {
    roomManager.createRoom('CHAT01');
    const hostSocket = await createClient();
    const guestSocket = await createClient();

    hostSocket.emit('join_room', { roomId: 'CHAT01', username: 'Alice', userId: 'user-a' });
    guestSocket.emit('join_room', { roomId: 'CHAT01', username: 'Bob', userId: 'user-b' });

    await new Promise((r) => setTimeout(r, 50));

    // Chat
    const chatPromise = new Promise<any>((resolve) => {
      hostSocket.once('chat_message', (msg) => resolve(msg));
    });

    guestSocket.emit('chat_message', { text: 'Hello watch party!' });
    const chatMsg = await chatPromise;
    expect(chatMsg.text).toBe('Hello watch party!');
    expect(chatMsg.username).toBe('Bob');

    // Reaction
    const reactionPromise = new Promise<any>((resolve) => {
      hostSocket.once('reaction_received', (rx) => resolve(rx));
    });

    guestSocket.emit('send_reaction', { emoji: '🔥' });
    const rxData = await reactionPromise;
    expect(rxData.emoji).toBe('🔥');
    expect(rxData.username).toBe('Bob');
  });
});

