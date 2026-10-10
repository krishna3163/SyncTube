import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { RoomManager } from '../models/RoomManager.js';
import { MovieProviderService } from '../services/movieProvider.js';
import { detectMediaSource } from '../utils/media.js';

describe('MovieProvider Service & Crypto', () => {
  let service: MovieProviderService;

  beforeEach(() => {
    service = new MovieProviderService();
  });

  it('generates valid client tokens with timestamp and reversed MD5', () => {
    const ts = 1791612432000;
    const token = (service as any).generateXClientToken(ts);
    expect(token).toContain(`${ts},`);
    const parts = token.split(',');
    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatch(/^[a-f0-9]{32}$/);
  });

  it('generates HMAC-MD5 request signatures formatted as ts|2|signature', () => {
    const ts = 1791612432000;
    const sig = (service as any).generateSignature(
      'GET',
      'https://api6.aoneroom.com/wefeed-mobile-bff/subject-api/get?subjectId=123',
      '',
      ts
    );
    expect(sig).toMatch(/^\d+\|2\|[A-Za-z0-9+/=]+$/);
  });
});

describe('Media Detection with MovieBox Proxy Streams', () => {
  it('detects movie proxy stream URL as a direct stream with custom title', () => {
    const proxyUrl = 'http://localhost:10000/api/movies/proxy?url=https%3A%2F%2Fmacdn.aoneroom.com%2Fvideo.mp4&title=Inception';
    const detected = detectMediaSource(proxyUrl);
    expect(detected).not.toBeNull();
    expect(detected?.platform).toBe('direct');
    expect(detected?.isDirectStream).toBe(true);
    expect(detected?.title).toBe('Inception');
  });

  it('detects relative movie proxy streams as direct streams', () => {
    const proxyUrl = 'https://synctube.party/api/movies/proxy?url=https%3A%2F%2Fmacdn.aoneroom.com%2Fstream.m3u8&title=Breaking%20Bad';
    const detected = detectMediaSource(proxyUrl);
    expect(detected).not.toBeNull();
    expect(detected?.platform).toBe('direct');
    expect(detected?.isDirectStream).toBe(true);
    expect(detected?.title).toBe('Breaking Bad');
  });
});

describe('MovieBox API & Streaming Proxy Routes', () => {
  let app: ReturnType<typeof createApp>;
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager();
    app = createApp(roomManager);
  });

  it('GET /api/movies/search returns empty results when query is empty', async () => {
    const res = await request(app).get('/api/movies/search?q=');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toEqual([]);
  });

  it('GET /api/movies/proxy rejects empty url parameter', async () => {
    const res = await request(app).get('/api/movies/proxy');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Target URL parameter is required');
  });

  it('GET /api/movies/proxy blocks SSRF / internal IP addresses', async () => {
    const res = await request(app).get('/api/movies/proxy?url=http://127.0.0.1:8080/secret');
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('GET /api/movies/proxy blocks private network ranges (10.0.0.1, 192.168.1.1)', async () => {
    const res = await request(app).get('/api/movies/proxy?url=http://192.168.1.1/admin');
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });
});
