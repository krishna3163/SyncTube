import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { RoomManager } from '../models/RoomManager.js';
import { tempBrowserManager } from '../services/tempBrowserManager.js';

describe('Temporary Browser REST API and Lifecycle', () => {
  const roomManager = new RoomManager();
  const app = createApp(roomManager);
  let createdSessionId: string;
  let createdToken: string;

  it('rejects session creation with SSRF blocked URL', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ initialUrl: 'http://localhost:8080' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('blocked');
  });

  it('creates an isolated temporary session with valid safe URL', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ initialUrl: 'https://example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.id).toBeDefined();
    expect(res.body.token).toBeDefined();

    createdSessionId = res.body.session.id;
    createdToken = res.body.token;

    expect(res.body.session.currentUrl).toBe('https://example.com/');
  }, 35000);

  it('rejects GET /api/sessions/:id without authorization token', async () => {
    const res = await request(app).get(`/api/sessions/${createdSessionId}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns session status when valid token provided', async () => {
    const res = await request(app)
      .get(`/api/sessions/${createdSessionId}`)
      .set('Authorization', `Bearer ${createdToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.session.id).toBe(createdSessionId);
  });

  it('navigates session to another safe URL', async () => {
    const res = await request(app)
      .post(`/api/sessions/${createdSessionId}/navigate`)
      .set('Authorization', `Bearer ${createdToken}`)
      .send({ url: 'https://duckduckgo.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  }, 35000);

  it('rejects navigation to SSRF internal destination', async () => {
    const res = await request(app)
      .post(`/api/sessions/${createdSessionId}/navigate`)
      .set('Authorization', `Bearer ${createdToken}`)
      .send({ url: 'http://169.254.169.254/latest/meta-data/' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('closes and deletes session securely', async () => {
    const res = await request(app)
      .delete(`/api/sessions/${createdSessionId}`)
      .set('Authorization', `Bearer ${createdToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify session no longer exists in memory
    const checkRes = await request(app)
      .get(`/api/sessions/${createdSessionId}`)
      .set('Authorization', `Bearer ${createdToken}`);

    expect(checkRes.status).toBe(401); // Token invalidated
  });

  afterAll(async () => {
    if (createdSessionId) {
      await tempBrowserManager.closeSession(createdSessionId);
    }
  });
});
