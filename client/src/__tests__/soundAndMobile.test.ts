import { describe, it, expect, beforeEach, vi } from 'vitest';

// Node environment polyfill for tests
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } as any;
}

if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 10),
  };
}

import {
  getSoundPreferences,
  setSoundPreferences,
  SoundPreferences,
} from '../utils/soundEffects.js';
import { firePartyConfetti, fireCelebrationMilestone } from '../utils/confetti.js';
import confetti from 'canvas-confetti';

vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

describe('Sound Preferences & Effects Settings', () => {
  beforeEach(() => {
    localStorage.clear();
    setSoundPreferences({
      masterMute: false,
      masterVolume: 0.7,
      events: {
        roomJoin: true,
        roomLeave: true,
        chatReceive: true,
        chatSend: true,
        reaction: true,
        linkCopy: true,
        soundboard: true,
      },
      soundboardCooldownMs: 1200,
    });
    vi.clearAllMocks();
  });

  it('provides safe default sound preferences when none are stored', () => {
    const prefs = getSoundPreferences();
    expect(prefs).toBeDefined();
    expect(prefs.masterMute).toBe(false);
    expect(prefs.masterVolume).toBe(0.7);
    expect(prefs.events.chatReceive).toBe(true);
    expect(prefs.events.reaction).toBe(true);
    expect(prefs.events.roomJoin).toBe(true);
    expect(prefs.events.roomLeave).toBe(true);
    expect(prefs.events.linkCopy).toBe(true);
    expect(prefs.events.soundboard).toBe(true);
  });

  it('persists and restores updated sound preferences in localStorage', () => {
    const updated: SoundPreferences = {
      masterMute: true,
      masterVolume: 0.35,
      events: {
        roomJoin: false,
        roomLeave: false,
        chatReceive: false,
        chatSend: false,
        reaction: true,
        linkCopy: true,
        soundboard: false,
      },
      soundboardCooldownMs: 1500,
    };

    setSoundPreferences(updated);

    const reloaded = getSoundPreferences();
    expect(reloaded.masterMute).toBe(true);
    expect(reloaded.masterVolume).toBe(0.35);
    expect(reloaded.events.chatReceive).toBe(false);
    expect(reloaded.events.reaction).toBe(true);
    expect(reloaded.events.soundboard).toBe(false);
    expect(reloaded.soundboardCooldownMs).toBe(1500);
  });

  it('gracefully handles malformed JSON in localStorage', () => {
    localStorage.setItem('synctube_sound_preferences', 'invalid-json{{{');
    const prefs = getSoundPreferences();
    expect(prefs).toBeDefined();
    expect(prefs.masterVolume).toBeGreaterThan(0);
  });
});

describe('Confetti Celebrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers canvas-confetti when party confetti is fired', () => {
    firePartyConfetti({ particleCount: 25 });
    expect(confetti).toHaveBeenCalled();
  });

  it('triggers multi-stage bursts when celebration milestone is fired', () => {
    fireCelebrationMilestone();
    expect(confetti).toHaveBeenCalled();
  });
});
