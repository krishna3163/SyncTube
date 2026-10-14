import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MediasoupManager } from '../media/mediasoupManager.js';

describe('MediasoupManager and CallMediaRouter', () => {
  let manager: MediasoupManager;
  const roomId = 'test-room-sfu-integration';
  const socket1 = 'socket-peer-1';
  const socket2 = 'socket-peer-2';

  beforeAll(async () => {
    manager = new MediasoupManager();
    await manager.initialize();
  });

  afterAll(async () => {
    await manager.close();
  });

  it('allocates a call router and returns valid RTP capabilities', async () => {
    const router = await manager.getOrCreateCallRouter(roomId);
    expect(router).toBeDefined();
    expect(router.roomId).toBe(roomId);

    const caps = await manager.getRouterCapabilities(roomId);
    expect(caps.codecs.length).toBeGreaterThanOrEqual(2);
    expect(caps.codecs.some((c) => c.mimeType.toLowerCase() === 'audio/opus')).toBe(true);
    expect(caps.codecs.some((c) => c.mimeType.toLowerCase() === 'video/vp8')).toBe(true);
  });

  it('reuses the existing call router for the same room (no duplicate router allocation)', async () => {
    const [r1, r2] = await Promise.all([
      manager.getOrCreateCallRouter(roomId),
      manager.getOrCreateCallRouter(roomId),
    ]);
    expect(r1).toBe(r2);
  });

  it('creates WebRtcTransports with ICE & DTLS parameters', async () => {
    const transportDto = await manager.createWebRtcTransport(roomId, socket1, 'send');
    expect(transportDto.id).toBeDefined();
    expect(transportDto.iceParameters).toBeDefined();
    expect(transportDto.iceCandidates).toBeInstanceOf(Array);
    expect(transportDto.dtlsParameters).toBeDefined();
  });

  it('rejects transport connection from an unauthorized socket', async () => {
    const transportDto = await manager.createWebRtcTransport(roomId, socket1, 'send');
    await expect(
      manager.connectWebRtcTransport(roomId, 'unauthorized-socket', transportDto.id, {
        role: 'client',
        fingerprints: [],
      } as any)
    ).rejects.toThrow('Unauthorized: transport not owned by caller.');
  });

  it('prevents self-consumption of a participant\'s own producer', async () => {
    const callRouter = await manager.getOrCreateCallRouter(roomId);
    const sendTransportDto = await manager.createWebRtcTransport(roomId, socket1, 'send');
    const recvTransportDto = await manager.createWebRtcTransport(roomId, socket1, 'recv');

    // Produce an audio track
    const producerId = await manager.createProducer(
      roomId,
      socket1,
      'user-1',
      sendTransportDto.id,
      'audio',
      {
        mid: '0',
        codecs: [
          {
            mimeType: 'audio/opus',
            payloadType: 111,
            clockRate: 48000,
            channels: 2,
          },
        ],
        encodings: [{ ssrc: 11111111 }],
      } as any
    );

    expect(producerId).toBeDefined();

    // Trying to consume own producer must be rejected
    await expect(
      manager.createConsumer(roomId, socket1, recvTransportDto.id, producerId, callRouter.rtpCapabilities)
    ).rejects.toThrow('Cannot consume own producer.');
  });

  it('cleans up participant transports and producers when leaving', async () => {
    const sendTransportDto = await manager.createWebRtcTransport(roomId, socket2, 'send');
    const producerId = await manager.createProducer(
      roomId,
      socket2,
      'user-2',
      sendTransportDto.id,
      'video',
      {
        mid: '1',
        codecs: [
          {
            mimeType: 'video/VP8',
            payloadType: 96,
            clockRate: 90000,
          },
        ],
        encodings: [{ ssrc: 22222222 }],
      } as any
    );

    expect(manager.getActiveProducers(roomId, socket1).some((p) => p.producerId === producerId)).toBe(true);

    // Participant leaves
    manager.handleParticipantLeave(roomId, socket2);

    // Producer must no longer be active
    expect(manager.getActiveProducers(roomId, socket1).some((p) => p.producerId === producerId)).toBe(false);
  });

  it('disposes call router cleanly and releases worker load', async () => {
    expect(manager.getCallRouter(roomId)).toBeDefined();
    manager.disposeCallRouter(roomId);
    expect(manager.getCallRouter(roomId)).toBeUndefined();
  });
});
