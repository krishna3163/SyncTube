import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HybridCallManager } from '../services/hybridCallManager.js';

describe('HybridCallManager (Client)', () => {
  let manager: HybridCallManager;

  const mockTrack = (kind: 'audio' | 'video') => ({
    kind,
    enabled: true,
    stop: vi.fn(),
  });

  beforeEach(() => {
    // Correctly define mediaDevices on existing navigator
    const mockMediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [mockTrack('audio'), mockTrack('video')],
        getAudioTracks: () => [mockTrack('audio')],
        getVideoTracks: () => [mockTrack('video')],
      }),
    };

    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          mediaDevices: mockMediaDevices,
        },
        writable: true,
        configurable: true,
      });
    } catch {
      (globalThis.navigator as any).mediaDevices = mockMediaDevices;
    }

    // Mock AudioContext
    (globalThis as any).AudioContext = vi.fn().mockImplementation(() => ({
      createMediaStreamSource: vi.fn().mockReturnValue({
        connect: vi.fn(),
      }),
      createAnalyser: vi.fn().mockReturnValue({
        fftSize: 256,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn(),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }));

    manager = new HybridCallManager();
    manager.setLocalUser('test-user-id', 'TestUser', 'avatar-1');
  });

  afterEach(() => {
    manager?.leaveCall();
  });

  it('starts in idle mode before joining a call', () => {
    expect(manager.isCallActive()).toBe(false);
    expect(manager.getTopologyMode()).toBe('idle');
  });

  it('joins a call and sets up local participant state', async () => {
    const res = await manager.joinCall({ audio: true, video: true });
    expect(res.success).toBe(true);
    expect(manager.isCallActive()).toBe(true);

    const mediaState = manager.getLocalMediaState();
    expect(mediaState.isMuted).toBe(false);
    expect(mediaState.isCameraOff).toBe(false);
  });

  it('toggles microphone mute state correctly', async () => {
    await manager.joinCall({ audio: true, video: false });

    // Initially unmuted
    expect(manager.getLocalMediaState().isMuted).toBe(false);

    // Toggle mute -> true
    const muted = manager.toggleMute();
    expect(muted).toBe(true);
    expect(manager.getLocalMediaState().isMuted).toBe(true);

    // Toggle mute -> false
    const unmuted = manager.toggleMute();
    expect(unmuted).toBe(false);
    expect(manager.getLocalMediaState().isMuted).toBe(false);
  });

  it('pins and unpins a participant for spotlight layer allocation', () => {
    expect(manager.getPinnedSocketId()).toBeNull();

    manager.pinParticipant('remote-socket-1');
    expect(manager.getPinnedSocketId()).toBe('remote-socket-1');

    manager.pinParticipant(null);
    expect(manager.getPinnedSocketId()).toBeNull();
  });

  it('tracks initial network quality telemetry defaults', () => {
    const quality = manager.getNetworkQuality();
    expect(quality.state).toBe('good');
    expect(quality.rtt).toBe(0);
    expect(quality.packetLoss).toBe(0);
  });

  it('cleans up local state on leaveCall', async () => {
    await manager.joinCall({ audio: true, video: true });
    expect(manager.isCallActive()).toBe(true);

    manager.leaveCall();
    expect(manager.isCallActive()).toBe(false);
    expect(manager.getLocalMediaState().isMuted).toBe(false);
  });

  it('notifies subscribers of topology changes', () => {
    const topologyStates: string[] = [];
    const unsub = manager.subscribeTopology((mode) => {
      topologyStates.push(mode);
    });

    expect(topologyStates).toContain('idle');
    unsub();
  });
});
