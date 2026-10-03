import { describe, it, expect } from 'vitest';
import { canPerformAction } from '../services/permissions.js';

describe('Permissions Matrix', () => {
  it('allows Host to perform all actions', () => {
    expect(canPerformAction('HOST', 'play')).toBe(true);
    expect(canPerformAction('HOST', 'pause')).toBe(true);
    expect(canPerformAction('HOST', 'seek')).toBe(true);
    expect(canPerformAction('HOST', 'change_video')).toBe(true);
    expect(canPerformAction('HOST', 'assign_role')).toBe(true);
    expect(canPerformAction('HOST', 'remove_participant')).toBe(true);
    expect(canPerformAction('HOST', 'transfer_host')).toBe(true);
  });

  it('allows Moderator to perform playback actions only', () => {
    expect(canPerformAction('MODERATOR', 'play')).toBe(true);
    expect(canPerformAction('MODERATOR', 'pause')).toBe(true);
    expect(canPerformAction('MODERATOR', 'seek')).toBe(true);
    expect(canPerformAction('MODERATOR', 'change_video')).toBe(true);

    // Forbidden for Moderator
    expect(canPerformAction('MODERATOR', 'assign_role')).toBe(false);
    expect(canPerformAction('MODERATOR', 'remove_participant')).toBe(false);
    expect(canPerformAction('MODERATOR', 'transfer_host')).toBe(false);
  });

  it('denies Participant from performing any privileged actions', () => {
    expect(canPerformAction('PARTICIPANT', 'play')).toBe(false);
    expect(canPerformAction('PARTICIPANT', 'pause')).toBe(false);
    expect(canPerformAction('PARTICIPANT', 'seek')).toBe(false);
    expect(canPerformAction('PARTICIPANT', 'change_video')).toBe(false);
    expect(canPerformAction('PARTICIPANT', 'assign_role')).toBe(false);
    expect(canPerformAction('PARTICIPANT', 'remove_participant')).toBe(false);
    expect(canPerformAction('PARTICIPANT', 'transfer_host')).toBe(false);
  });

  it('denies undefined or unknown roles', () => {
    expect(canPerformAction(undefined, 'play')).toBe(false);
    expect(canPerformAction('UNKNOWN' as any, 'play')).toBe(false);
  });
});
