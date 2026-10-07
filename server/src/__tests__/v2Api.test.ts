import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { RoomManager } from '../models/RoomManager.js';
import { AuthService } from '../services/auth.js';

describe('V2 REST APIs', () => {
  let app: any;
  let roomManager: RoomManager;
  let authService: AuthService;

  beforeEach(() => {
    roomManager = new RoomManager();
    authService = new AuthService();
    app = createApp(roomManager, undefined, authService);
  });

  it('GET /api/platforms returns supported platforms and planned status', async () => {
    const res = await request(app).get('/api/platforms');
    expect(res.status).toBe(200);
    expect(res.body.platforms).toBeDefined();
    expect(res.body.platforms.some((p: any) => p.id === 'youtube' && p.status === 'SUPPORTED')).toBe(true);
    expect(res.body.platforms.some((p: any) => p.id === 'generic' && p.status === 'SUPPORTED')).toBe(true);
  });

  it('POST /api/auth/register and POST /api/auth/login and GET /api/me', async () => {
    // Register
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@synctube.com', username: 'SyncMaster', password: 'password123' });

    expect(regRes.status).toBe(201);
    expect(regRes.body.token).toBeDefined();
    expect(regRes.body.user.username).toBe('SyncMaster');

    const token = regRes.body.token;

    // GET /api/me with Bearer token
    const meRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('user@synctube.com');

    // Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@synctube.com', password: 'password123' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });

  it('GET /api/rooms/:roomId/readiness and GET /api/rooms/:roomId/sync return universal state', async () => {
    const room = roomManager.createRoom('V2ROOM', 'dQw4w9WgXcQ');

    const syncRes = await request(app).get('/api/rooms/V2ROOM/sync');
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.snapshot.revision).toBe(0);
    expect(syncRes.body.snapshot.mediaIdentity.mediaId).toBe('dQw4w9WgXcQ');

    const readinessRes = await request(app).get('/api/rooms/V2ROOM/readiness');
    expect(readinessRes.status).toBe(200);
    expect(Array.isArray(readinessRes.body.readiness)).toBe(true);
  });
});
