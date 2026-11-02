import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CallParticipantState, HybridCallManager } from '../services/hybridCallManager.js';

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
    let localParticipant: CallParticipantState | undefined;
    let activeParticipants: CallParticipantState[] = [];
    const unsubscribe = manager.subscribePeers((participants) => {
      activeParticipants = participants;
      localParticipant = participants.find((participant) => participant.isLocal);
    });

    const res = await manager.joinCall({ audio: true, video: true });
    expect(res.success).toBe(true);
    expect(manager.isCallActive()).toBe(true);
    expect(activeParticipants).toHaveLength(1);
    expect(manager.getTopologyMode()).toBe('idle');
    expect(localParticipant?.stream?.getAudioTracks()).toHaveLength(1);
    expect(localParticipant?.stream?.getVideoTracks()).toHaveLength(1);
    expect(localParticipant?.isCameraOff).toBe(false);

    const mediaState = manager.getLocalMediaState();
    expect(mediaState.isMuted).toBe(false);
    expect(mediaState.isCameraOff).toBe(false);

    expect(await manager.toggleCamera()).toEqual({ isCameraOff: true });
    expect(manager.getLocalMediaState().isCameraOff).toBe(true);
    expect(await manager.toggleCamera()).toEqual({ isCameraOff: false });
    expect(manager.getLocalMediaState().isCameraOff).toBe(false);
    unsubscribe();
  });

  it('reports denied microphone or camera permissions clearly', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    );

    const result = await manager.joinCall({ audio: true, video: true });

    expect(result).toEqual({ success: false, error: 'PERMISSION_DENIED' });
    expect(manager.isCallActive()).toBe(false);
  });

  it('joins the call without media devices and marks mic and camera unavailable', async () => {
    vi.stubGlobal('MediaStream', class {
      getTracks() { return []; }
      getAudioTracks() { return []; }
      getVideoTracks() { return []; }
    });
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException('Requested device not found', 'NotFoundError'),
    );

    const result = await manager.joinCall({ audio: true, video: true });

    expect(result).toEqual({ success: true, mediaUnavailable: true });
    expect(manager.isCallActive()).toBe(true);
    expect(manager.getLocalMediaState()).toEqual({
      isMuted: true,
      isCameraOff: true,
      isScreenSharing: false,
    });
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
