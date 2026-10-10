import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { RoomManager } from '../models/RoomManager.js';
import { createHash } from 'node:crypto';

describe('Express REST API Endpoints', () => {
  let roomManager: RoomManager;
  let app: any;

  beforeEach(() => {
    roomManager = new RoomManager();
    app = createApp(roomManager);
  });

  describe('GET /health', () => {
    it('returns status 200 with status ok and active rooms count', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.roomsActive).toBe(0);
      expect(typeof res.body.uptime).toBe('number');
      expect(typeof res.body.timestamp).toBe('string');
    });
  });

  describe('POST /api/rooms', () => {
    it('creates a new room without a video when no video is provided', async () => {
      const res = await request(app).post('/api/rooms').send({});
      expect(res.status).toBe(201);
      expect(res.body.roomId).toBeDefined();
      expect(res.body.videoId).toBe('');
      expect(roomManager.hasRoom(res.body.roomId)).toBe(true);
    });

    it('creates a new room with custom YouTube URL', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ initialVideoId: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' });
      expect(res.status).toBe(201);
      expect(res.body.videoId).toBe('M7lc1UVf-VE');
    });

    it('reserves the creator identity with a private reconnect token', async () => {
      const creatorUserId = '123e4567-e89b-12d3-a456-426614174000';
      const res = await request(app).post('/api/rooms').send({ creatorUserId });
      const room = roomManager.getRoom(res.body.roomId);
      expect(res.status).toBe(201);
      expect(res.body.identityToken).toMatch(/^[a-f0-9]{64}$/);
      expect(room?.creatorUserId).toBe(creatorUserId);
      expect(room?.getIdentityCredentialHash(creatorUserId)).toBe(
        createHash('sha256').update(res.body.identityToken).digest('hex')
      );
      expect(room?.getIdentityCredentialHash(creatorUserId)).not.toBe(res.body.identityToken);
    });

    it('rejects invalid YouTube URL', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({ initialVideoId: 'https://example.com/not-a-youtube-video' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid YouTube');
    });

    it('applies the room-creation rate limit', async () => {
      let response;
      for (let attempt = 0; attempt < 31; attempt++) {
        response = await request(app).post('/api/rooms').send({});
      }
      expect(response?.status).toBe(429);
    });
  });

  describe('GET /api/rooms/:roomId', () => {
    it('returns room details for existing room', async () => {
      roomManager.createRoom('TEST99', 'M7lc1UVf-VE');
      const res = await request(app).get('/api/rooms/TEST99');
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
      expect(res.body.roomId).toBe('TEST99');
      expect(res.body.videoId).toBe('M7lc1UVf-VE');
    });

    it('returns 404 for non-existent room', async () => {
      const res = await request(app).get('/api/rooms/NONEXIST');
      expect(res.status).toBe(404);
      expect(res.body.exists).toBe(false);
    });

    it('applies a general rate limit to API routes', async () => {
      let response;
      for (let attempt = 0; attempt < 121; attempt++) {
        response = await request(app).get('/api/rooms/RATE01');
      }
      expect(response?.status).toBe(429);
    });
  });

  describe('GET /api/youtube/search', () => {
    it('returns 400 when query parameter q is missing', async () => {
      const res = await request(app).get('/api/youtube/search');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('returns 400 when query parameter q is empty whitespace', async () => {
      const res = await request(app).get('/api/youtube/search?q=   ');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('returns direct video item when q is a YouTube URL or direct video ID', async () => {
      const res = await request(app).get('/api/youtube/search?q=https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.status).toBe(200);
      expect(res.body.results).toBeDefined();
      expect(res.body.results.length).toBe(1);
      expect(res.body.results[0].videoId).toBe('dQw4w9WgXcQ');
    });

    it('returns search results matching query or curated fallback without 500 error', async () => {
      const res = await request(app).get('/api/youtube/search?q=Hans%20Zimmer');
      expect(res.status).toBe(200);
      expect(res.body.results).toBeDefined();
      expect(res.body.results.length).toBeGreaterThan(0);
    }, 10000);
  });
});
