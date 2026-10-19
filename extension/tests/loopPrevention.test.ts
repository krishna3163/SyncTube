import { describe, it, expect, vi } from 'vitest';

describe('Extension Event-Loop Prevention (Repository D Pattern)', () => {
  it('suppresses outbound event broadcasts while remote command execution lock is active', () => {
    let isExecutingRemoteCommand = false;
    let remoteCommandTimeout: any = null;

    const setExecutingRemoteCommand = (durationMs = 250) => {
      isExecutingRemoteCommand = true;
      if (remoteCommandTimeout) clearTimeout(remoteCommandTimeout);
      remoteCommandTimeout = setTimeout(() => {
        isExecutingRemoteCommand = false;
      }, durationMs);
    };

    const broadcastMock = vi.fn();

    const handlePlaybackEvent = (event: { type: string; currentTime: number }) => {
      // Loop lock check
      if (isExecutingRemoteCommand) {
        return; // Event dropped to prevent feedback echo loop
      }
      broadcastMock(event);
    };

    // 1. When no remote command is executing, user events are broadcast
    handlePlaybackEvent({ type: 'play', currentTime: 12.5 });
    expect(broadcastMock).toHaveBeenCalledTimes(1);

    // 2. When a remote command starts executing, local DOM events are dropped
    setExecutingRemoteCommand(200);
    expect(isExecutingRemoteCommand).toBe(true);

    handlePlaybackEvent({ type: 'seek', currentTime: 45.0 });
    handlePlaybackEvent({ type: 'play', currentTime: 45.0 });
    // Still 1: events were suppressed
    expect(broadcastMock).toHaveBeenCalledTimes(1);

    // 3. Fast-forward past debounce window
    if (remoteCommandTimeout) clearTimeout(remoteCommandTimeout);
    isExecutingRemoteCommand = false;

    // 4. Normal local user interactions resume
    handlePlaybackEvent({ type: 'pause', currentTime: 50.0 });
    expect(broadcastMock).toHaveBeenCalledTimes(2);
  });
});
