import { describe, it, expect, beforeEach } from 'vitest';
import { UniversalSyncSession } from '../sync/universalSync.js';

describe('UniversalSyncSession', () => {
  let session: UniversalSyncSession;

  beforeEach(() => {
    session = new UniversalSyncSession({
      platform: 'youtube',
      mediaId: 'video123',
      title: 'Awesome Video',
    });
  });

  it('initializes with paused state, revision 0, and correct media identity', () => {
    const snapshot = session.getStateSnapshot();
    expect(snapshot.revision).toBe(0);
    expect(snapshot.state).toBe('PAUSED');
    expect(snapshot.position).toBe(0);
    expect(snapshot.mediaIdentity?.mediaId).toBe('video123');
  });

  it('monotonically increments revision on play, pause, seek, and media change', () => {
    expect(session.getRevision()).toBe(0);

    session.applyPlay(10, 'evt_1', 'user_1');
    expect(session.getRevision()).toBe(1);

    session.applyPause(15, 'evt_2', 'user_1');
    expect(session.getRevision()).toBe(2);

    session.applySeek(50, 'evt_3', 'user_1');
    expect(session.getRevision()).toBe(3);

    session.setMediaIdentity({ platform: 'generic', mediaId: 'stream.mp4', title: 'Stream' });
    expect(session.getRevision()).toBe(4);
  });

  it('idempotently handles duplicate event IDs without re-incrementing revision', () => {
    const first = session.applyPlay(10, 'evt_duplicate', 'user_1');
    expect(first.state.revision).toBe(1);

    const second = session.applyPlay(10, 'evt_duplicate', 'user_1');
    expect(second.state.revision).toBe(1); // not incremented again
  });

  it('assesses drift and categorizes into none, soft rate adjust, and hard seek', () => {
    // Current server time is 0 (paused)
    // 100ms drift: within tolerance (< 250ms) -> none
    const assessment1 = session.assessDrift(0.1, 0);
    expect(assessment1.action).toBe('none');

    // 500ms behind: between 250ms and 1000ms -> soft_rate_adjust
    const assessment2 = session.assessDrift(-0.5, 0);
    expect(assessment2.action).toBe('soft_rate_adjust');
    expect(assessment2.targetRate).toBe(1.05); // speed up slightly

    // 1500ms ahead: > 1000ms -> hard_seek
    const assessment3 = session.assessDrift(1.5, 0);
    expect(assessment3.action).toBe('hard_seek');
    expect(assessment3.targetPosition).toBe(0);
  });

  it('manages participant readiness and auto-play triggers', () => {
    session.setParticipantReadiness('user1', 'Alice', 'ready', {
      activePlatform: 'youtube',
      activeMediaId: 'video123',
    });
    session.setParticipantReadiness('user2', 'Bob', 'buffering', {
      activePlatform: 'youtube',
      activeMediaId: 'video123',
    });

    expect(session.areAllParticipantsReady()).toBe(false);

    session.setParticipantReadiness('user2', 'Bob', 'ready', {
      activePlatform: 'youtube',
      activeMediaId: 'video123',
    });
    expect(session.areAllParticipantsReady()).toBe(true);

    session.setAutoPlayWhenReady(true);
    expect(session.shouldAutoPlayWhenReady()).toBe(true);
  });
});
