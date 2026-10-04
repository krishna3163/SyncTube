import { describe, it, expect, beforeEach } from 'vitest';

// Node environment localStorage polyfill for testing
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

import {
  rememberParticipantCharacter,
  getParticipantCharacterId,
  getParticipantAvatar,
} from '../utils/characterMemory.js';

describe('Participant Character Memory Utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers a participant avatar by username and userId', () => {
    rememberParticipantCharacter('GokuFan', 'user-123', 'goku');
    expect(getParticipantCharacterId('GokuFan')).toBe('goku');
    expect(getParticipantCharacterId(undefined, 'user-123')).toBe('goku');
    expect(getParticipantCharacterId('gokufan', 'user-123')).toBe('goku');
  });

  it('generates a consistent deterministic avatar and remembers it so it stays the same across all components', () => {
    const char1 = getParticipantCharacterId('AnimeLover');
    const char2 = getParticipantCharacterId('AnimeLover');
    expect(char1).toBe(char2);

    const avatarObj = getParticipantAvatar('AnimeLover');
    expect(avatarObj.id).toBe(char1);
  });

  it('updates remembered character when a participant selects a new avatar', () => {
    rememberParticipantCharacter('LuffyPirate', 'user-456', 'luffy');
    expect(getParticipantCharacterId('LuffyPirate')).toBe('luffy');

    // Participant changes their character to gojo in settings
    rememberParticipantCharacter('LuffyPirate', 'user-456', 'gojo');
    expect(getParticipantCharacterId('LuffyPirate')).toBe('gojo');
    expect(getParticipantCharacterId(undefined, 'user-456')).toBe('gojo');
  });

  it('prioritizes explicit valid avatarId when provided and updates memory', () => {
    const id = getParticipantCharacterId('NarutoNinja', 'user-789', 'naruto');
    expect(id).toBe('naruto');
    // Subsequent lookup without explicit avatar should return the remembered one
    expect(getParticipantCharacterId('NarutoNinja')).toBe('naruto');
  });
});
