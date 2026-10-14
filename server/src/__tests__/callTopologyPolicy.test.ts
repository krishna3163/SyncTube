import { describe, it, expect, beforeEach } from 'vitest';
import { CallTopologyPolicyManager } from '../media/callTopologyPolicy.js';

describe('CallTopologyPolicyManager', () => {
  let policy: CallTopologyPolicyManager;
  const roomId = 'test-room-hybrid-1';

  beforeEach(() => {
    policy = new CallTopologyPolicyManager({ configuredMode: 'hybrid' });
  });

  it('starts in idle mode with 0 or 1 caller', () => {
    const s1 = policy.evaluateOnJoin(roomId, 'socket-user-1');
    expect(s1.targetMode).toBe('idle');
    expect(s1.activeCallerCount).toBe(1);
    expect(s1.shouldTransition).toBe(false);
  });

  it('selects P2P mode when 2nd caller joins', () => {
    policy.evaluateOnJoin(roomId, 'socket-user-1');
    const s2 = policy.evaluateOnJoin(roomId, 'socket-user-2');

    expect(s2.targetMode).toBe('p2p');
    expect(s2.previousMode).toBe('idle');
    expect(s2.shouldTransition).toBe(true);
    expect(s2.activeCallerCount).toBe(2);
    expect(s2.version).toBe(2);
  });

  it('triggers migration to SFU when 3rd caller joins an active P2P call', () => {
    policy.evaluateOnJoin(roomId, 'socket-user-1');
    policy.evaluateOnJoin(roomId, 'socket-user-2');
    const s3 = policy.evaluateOnJoin(roomId, 'socket-user-3');

    expect(s3.targetMode).toBe('sfu');
    expect(s3.previousMode).toBe('p2p');
    expect(s3.shouldTransition).toBe(true);
    expect(s3.activeCallerCount).toBe(3);

    const roomState = policy.getRoomState(roomId);
    expect(roomState.isTransitioning).toBe(true);

    // Confirm transition
    const confirmed = policy.confirmTransition(roomId, s3.version);
    expect(confirmed).toBe(true);
    expect(policy.getRoomState(roomId).isTransitioning).toBe(false);
  });

  it('remains in SFU mode as additional participants join', () => {
    policy.evaluateOnJoin(roomId, 'socket-user-1');
    policy.evaluateOnJoin(roomId, 'socket-user-2');
    policy.evaluateOnJoin(roomId, 'socket-user-3');
    const s4 = policy.evaluateOnJoin(roomId, 'socket-user-4');

    expect(s4.targetMode).toBe('sfu');
    expect(s4.previousMode).toBe('sfu');
    expect(s4.shouldTransition).toBe(false);
    expect(s4.activeCallerCount).toBe(4);
  });

  it('enforces anti-flapping hysteresis: keeps SFU when dropping from 3 to 2 callers', () => {
    policy.evaluateOnJoin(roomId, 'socket-user-1');
    policy.evaluateOnJoin(roomId, 'socket-user-2');
    policy.evaluateOnJoin(roomId, 'socket-user-3'); // mode: SFU

    // Caller 3 leaves -> remaining 2 callers
    const leaveDecision = policy.evaluateOnLeave(roomId, 'socket-user-3');

    expect(leaveDecision.activeCallerCount).toBe(2);
    expect(leaveDecision.targetMode).toBe('sfu'); // MUST STAY SFU!
    expect(leaveDecision.shouldTransition).toBe(false);
  });

  it('transitions to idle when call drops to 1 caller or 0 callers', () => {
    policy.evaluateOnJoin(roomId, 'socket-user-1');
    policy.evaluateOnJoin(roomId, 'socket-user-2');
    policy.evaluateOnJoin(roomId, 'socket-user-3');

    // 2 callers leave
    policy.evaluateOnLeave(roomId, 'socket-user-3');
    const leave2 = policy.evaluateOnLeave(roomId, 'socket-user-2');

    expect(leave2.activeCallerCount).toBe(1);
    expect(leave2.targetMode).toBe('idle');
    expect(leave2.shouldTransition).toBe(true);

    const leave1 = policy.evaluateOnLeave(roomId, 'socket-user-1');
    expect(leave1.activeCallerCount).toBe(0);
    expect(leave1.targetMode).toBe('idle');
  });

  it('correctly reports caller membership via isCallerInRoom', () => {
    policy.evaluateOnJoin(roomId, 'socket-user-1');
    policy.evaluateOnJoin(roomId, 'socket-user-2');

    expect(policy.isCallerInRoom(roomId, 'socket-user-1')).toBe(true);
    expect(policy.isCallerInRoom(roomId, 'socket-user-2')).toBe(true);
    expect(policy.isCallerInRoom(roomId, 'socket-user-random')).toBe(false);
    expect(policy.isCallerInRoom('other-room', 'socket-user-1')).toBe(false);
  });

  it('respects sfu_only policy override', () => {
    const sfuPolicy = new CallTopologyPolicyManager({ configuredMode: 'sfu_only' });
    sfuPolicy.evaluateOnJoin('sfu-room', 's-1');
    const d2 = sfuPolicy.evaluateOnJoin('sfu-room', 's-2');

    expect(d2.targetMode).toBe('sfu');
    expect(d2.shouldTransition).toBe(true);
  });

  it('respects p2p_only policy override', () => {
    const p2pPolicy = new CallTopologyPolicyManager({ configuredMode: 'p2p_only' });
    p2pPolicy.evaluateOnJoin('p2p-room', 'p-1');
    p2pPolicy.evaluateOnJoin('p2p-room', 'p-2');
    const d3 = p2pPolicy.evaluateOnJoin('p2p-room', 'p-3');

    expect(d3.targetMode).toBe('p2p');
  });
});
