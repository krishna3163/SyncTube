import { describe, it, expect, beforeEach, vi } from 'vitest';

// Node environment localStorage & EventTarget polyfill for testing
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

if (typeof globalThis.window === 'undefined') {
  const target = new EventTarget();
  (globalThis as any).window = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
}

if (typeof globalThis.CustomEvent === 'undefined') {
  class CustomEvent<T = any> extends Event {
    detail: T;
    constructor(type: string, params?: { detail?: T }) {
      super(type);
      this.detail = params?.detail as T;
    }
  }
  globalThis.CustomEvent = CustomEvent as any;
}

import {
  getFeatureFlags,
  setFeatureFlag,
  setAllFeatureFlags,
  resetFeatureFlags,
  isFeatureEnabled,
  DEFAULT_FEATURE_FLAGS,
  subscribeFeatureFlags,
} from '../utils/featureFlags.js';

describe('Feature Flags System', () => {
  beforeEach(() => {
    localStorage.clear();
    resetFeatureFlags();
  });

  it('provides sensible defaults for all features', () => {
    const flags = getFeatureFlags();
    expect(flags.ambientGlow).toBe(true);
    expect(flags.floatingReactions).toBe(true);
    expect(flags.soundEffects).toBe(true);
    expect(flags.voiceVideoCall).toBe(true);
    expect(flags.screenShare).toBe(true);
    expect(flags.chat).toBe(true);
    expect(flags.playlist).toBe(true);
    expect(flags.actionRequests).toBe(true);
    expect(flags.activityFeed).toBe(true);
    expect(flags.browserHub).toBe(true);
    expect(flags.syncDiagnostics).toBe(true);
    expect(flags.theaterMode).toBe(false);
    expect(flags.autoResync).toBe(true);
  });

  it('can toggle an individual feature flag off and persist to localStorage', () => {
    setFeatureFlag('chat', false);
    expect(isFeatureEnabled('chat')).toBe(false);
    expect(getFeatureFlags().chat).toBe(false);

    // Other flags remain unaffected
    expect(isFeatureEnabled('ambientGlow')).toBe(true);
  });

  it('can toggle a batch of feature flags (e.g. minimal video mode)', () => {
    setAllFeatureFlags({
      chat: false,
      playlist: false,
      voiceVideoCall: false,
      floatingReactions: false,
    });

    const current = getFeatureFlags();
    expect(current.chat).toBe(false);
    expect(current.playlist).toBe(false);
    expect(current.voiceVideoCall).toBe(false);
    expect(current.floatingReactions).toBe(false);

    // Unchanged flags retain their original states
    expect(current.autoResync).toBe(true);
    expect(current.screenShare).toBe(true);
  });

  it('can reset all feature flags back to default', () => {
    setAllFeatureFlags({ chat: false, ambientGlow: false });
    expect(isFeatureEnabled('chat')).toBe(false);

    resetFeatureFlags();
    expect(isFeatureEnabled('chat')).toBe(true);
    expect(isFeatureEnabled('ambientGlow')).toBe(true);
  });

  it('notifies subscribers via event listener when flags change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFeatureFlags(listener);

    setFeatureFlag('soundEffects', false);
    expect(listener).toHaveBeenCalled();
    const updatedFlags = listener.mock.calls[0][0];
    expect(updatedFlags.soundEffects).toBe(false);

    unsubscribe();
  });
});
