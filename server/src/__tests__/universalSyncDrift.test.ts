import { describe, it, expect } from 'vitest';
import { UniversalSyncSession, DRIFT_CONFIG } from '../sync/universalSync.js';

describe('UniversalSyncSession Drift & Resync Thresholds', () => {
  it('has responsive HARD_RESYNC_THRESHOLD_MS set to 2000ms', () => {
    expect(DRIFT_CONFIG.HARD_RESYNC_THRESHOLD_MS).toBe(2000);
    expect(DRIFT_CONFIG.MIN_DRIFT_THRESHOLD_MS).toBe(250);
  });

  it('triggers hard_seek immediately when client is 2.0s or more behind', () => {
    const session = new UniversalSyncSession({
      platform: 'youtube',
      mediaId: 'test-video',
      title: 'Drift Test',
    });
    session.applyPlay(10.0);

    // Client reports position 7.9s while server is at 10.0s (drift = -2.1s = -2100ms)
    const assessment = session.assessDrift(7.9, 0);
    expect(assessment.action).toBe('hard_seek');
    expect(assessment.targetPosition).toBeCloseTo(10.0, 1);
    expect(Math.abs(assessment.driftMs + 2100)).toBeLessThan(10);
  });

  it('triggers hard_seek immediately when client is 2.0s or more ahead', () => {
    const session = new UniversalSyncSession({
      platform: 'youtube',
      mediaId: 'test-video',
      title: 'Drift Test',
    });
    session.applyPlay(5.0);

    // Client reports position 7.5s while server is at 5.0s (drift = +2.5s = +2500ms)
    const assessment = session.assessDrift(7.5, 0);
    expect(assessment.action).toBe('hard_seek');
    expect(assessment.targetPosition).toBeCloseTo(5.0, 1);
  });

  it('uses soft rate adjust when drift is within 250ms - 2000ms', () => {
    const session = new UniversalSyncSession({
      platform: 'youtube',
      mediaId: 'test-video',
      title: 'Drift Test',
    });
    session.applyPlay(10.0);

    // Client is 600ms behind -> speed up smoothly
    const behindAssessment = session.assessDrift(9.4, 0);
    expect(behindAssessment.action).toBe('soft_rate_adjust');
    expect(behindAssessment.targetRate).toBe(1.06);

    // Client is 1400ms behind -> speed up smoothly with DRIFT_CONFIG.SOFT_ACCELERATE_RATE
    const furtherBehind = session.assessDrift(8.6, 0);
    expect(furtherBehind.action).toBe('soft_rate_adjust');
    expect(furtherBehind.targetRate).toBe(1.06);

    // Client is 600ms ahead -> slow down smoothly
    const aheadAssessment = session.assessDrift(10.6, 0);
    expect(aheadAssessment.action).toBe('soft_rate_adjust');
    expect(aheadAssessment.targetRate).toBe(0.94);
  });

  it('returns action none when drift is under 250ms tolerance', () => {
    const session = new UniversalSyncSession({
      platform: 'youtube',
      mediaId: 'test-video',
      title: 'Drift Test',
    });
    session.applyPlay(10.0);

    const assessment = session.assessDrift(10.15, 0);
    expect(assessment.action).toBe('none');
  });
});
