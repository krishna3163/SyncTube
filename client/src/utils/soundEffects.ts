// Synthesized sound effects using standard Web Audio API (zero external asset dependencies)
import { isFeatureEnabled } from './featureFlags.js';

export interface SoundPreferences {
  masterMute: boolean;
  masterVolume: number; // 0.0 to 1.0
  events: {
    roomJoin: boolean;
    roomLeave: boolean;
    chatReceive: boolean;
    chatSend: boolean;
    reaction: boolean;
    linkCopy: boolean;
    soundboard: boolean;
  };
  soundboardCooldownMs: number;
}

const DEFAULT_SOUND_PREFERENCES: SoundPreferences = {
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
};

const SOUND_PREFS_KEY = 'synctube_sound_preferences';

let cachedSoundPrefs: SoundPreferences | null = null;

export const getSoundPreferences = (): SoundPreferences => {
  if (cachedSoundPrefs) return cachedSoundPrefs;
  if (typeof window === 'undefined') return DEFAULT_SOUND_PREFERENCES;
  try {
    const raw = localStorage.getItem(SOUND_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cachedSoundPrefs = {
        masterMute: typeof parsed.masterMute === 'boolean' ? parsed.masterMute : DEFAULT_SOUND_PREFERENCES.masterMute,
        masterVolume: typeof parsed.masterVolume === 'number' ? Math.max(0, Math.min(1, parsed.masterVolume)) : DEFAULT_SOUND_PREFERENCES.masterVolume,
        events: {
          ...DEFAULT_SOUND_PREFERENCES.events,
          ...(parsed.events || {}),
        },
        soundboardCooldownMs: typeof parsed.soundboardCooldownMs === 'number' ? parsed.soundboardCooldownMs : DEFAULT_SOUND_PREFERENCES.soundboardCooldownMs,
      };
      return cachedSoundPrefs;
    }
  } catch {}
  cachedSoundPrefs = { ...DEFAULT_SOUND_PREFERENCES };
  return cachedSoundPrefs;
};

export const setSoundPreferences = (updates: Partial<SoundPreferences> | ((prev: SoundPreferences) => SoundPreferences)): SoundPreferences => {
  const current = getSoundPreferences();
  const next = typeof updates === 'function' ? updates(current) : { ...current, ...updates, events: { ...current.events, ...(updates.events || {}) } };
  cachedSoundPrefs = next;
  try {
    localStorage.setItem(SOUND_PREFS_KEY, JSON.stringify(next));
  } catch {}
  if (masterGainNode && audioCtx) {
    const vol = next.masterMute ? 0 : next.masterVolume;
    masterGainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
  }
  return next;
};

let audioCtx: AudioContext | null = null;
let masterGainNode: GainNode | null = null;

export const getAudioContext = (eventKey?: keyof SoundPreferences['events']): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!isFeatureEnabled('soundEffects')) return null;

  const prefs = getSoundPreferences();
  if (prefs.masterMute) return null;
  if (eventKey && !prefs.events[eventKey]) return null;

  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.setValueAtTime(prefs.masterVolume, audioCtx.currentTime);
        masterGainNode.connect(audioCtx.destination);
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    if (masterGainNode && audioCtx) {
      masterGainNode.gain.setValueAtTime(prefs.masterVolume, audioCtx.currentTime);
    }
    return audioCtx;
  } catch {
    return null;
  }
};

export const getMasterDestination = (): AudioNode | null => {
  return masterGainNode || audioCtx?.destination || null;
};

/**
 * Rich, synthesized Web Audio reactions for each distinct emoji
 */
export const playReactSound = (emoji?: string) => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const cleanEmoji = (emoji || '').trim();

    // 1. ❤️ Heart / Love — Warm double heartbeat thump
    if (cleanEmoji === '❤️' || cleanEmoji === '🥹' || cleanEmoji === '💖') {
      const playThump = (time: number, freq: number, gainVal: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.6, time + 0.12);
        gain.gain.setValueAtTime(gainVal, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.15);
      };
      playThump(now, 100, 0.35);
      playThump(now + 0.14, 85, 0.28);
      return;
    }

    // 2. 😂 Laugh / Skull — Bouncy triple giggle chime
    if (cleanEmoji === '😂' || cleanEmoji === '💀' || cleanEmoji === '🤣') {
      const notes = [440, 554, 659]; // A4, C#5, E5
      notes.forEach((freq, idx) => {
        const t = now + idx * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.15, t + 0.05);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
      });
      return;
    }

    // 3. 👏 Clap — Snappy percussive handclap burst
    if (cleanEmoji === '👏') {
      const bufferSize = Math.floor(ctx.sampleRate * 0.08);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1100;
      filter.Q.value = 1.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
      return;
    }

    // 4. 🔥 Fire / ⚡ Lightning — Sizzling upward laser riser
    if (cleanEmoji === '🔥' || cleanEmoji === '⚡') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.18);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
      return;
    }

    // 5. 😮 Wow / 🤯 Mindblown / 😱 Shock — Ascending wonder glissando
    if (cleanEmoji === '😮' || cleanEmoji === '🤯' || cleanEmoji === '😱') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.22);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
      return;
    }

    // 6. 😢 Cry / Sad — Downward soft blue note
    if (cleanEmoji === '😢' || cleanEmoji === '😭') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.25);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.29);
      return;
    }

    // 7. 😡 Angry — Grumpy low buzz
    if (cleanEmoji === '😡') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.18);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
      return;
    }

    // 8. 🎉 Celebration / ✨ Magic — Upward festive arpeggio chime
    if (cleanEmoji === '🎉' || cleanEmoji === '✨' || cleanEmoji === '🌙') {
      const arpeggio = [523, 659, 784, 1046]; // C5, E5, G5, C6
      arpeggio.forEach((f, i) => {
        const t = now + i * 0.05;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.17);
      });
      return;
    }

    // 9. 🍿 Popcorn — Snappy double woodblock pop
    if (cleanEmoji === '🍿') {
      const pops = [750, 920];
      pops.forEach((f, i) => {
        const t = now + i * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.04);
        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.07);
      });
      return;
    }

    // 10. ⚔️ Sword / 🏴‍☠️ Battle — Metallic cling
    if (cleanEmoji === '⚔️' || cleanEmoji === '🏴‍☠️' || cleanEmoji === '🍥' || cleanEmoji === '🦊') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(2200, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
      return;
    }

    // Default Bubble Pop fallback
    const baseFreq = cleanEmoji ? 380 + (cleanEmoji.charCodeAt(0) % 240) : 480;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.8, now + 0.12);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  } catch {
    // Audio context safe fallback
  }
};

/**
 * Gentle message send whoosh / chirp sound
 */
export const playMessageSendSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.09);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  } catch {}
};

/**
 * Crisp incoming message chime
 */
export const playMessageReceiveSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    osc2.frequency.setValueAtTime(880, now + 0.06); // A5

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.08);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.22);
  } catch {}
};

/**
 * Noticeable alert chime when participant action request appears
 */
export const playRequestAlertSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [587.33, 739.99, 880.0]; // D5, F#5, A5 arpeggio
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.07;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });
  } catch {}
};

/**
 * Crisp pop / tap sound on poll vote click
 */
export const playPollVoteSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);
  } catch {}
};

/**
 * Celebration chime when guessing / voting leading poll answer
 */
export const playPollWinSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 triumph
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.14, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  } catch {}
};

/**
 * Error / warning buzz sound
 */
export const playErrorSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.setValueAtTime(140, now + 0.08);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  } catch {}
};

/**
 * User Joined Room chime (two-note ascending bright bell)
 */
export const playUserJoinSound = () => {
  const ctx = getAudioContext('roomJoin');
  if (!ctx) return;
  const out = getMasterDestination() || ctx.destination;
  try {
    const now = ctx.currentTime;
    [523.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  } catch {}
};

/**
 * User Left Room chime (two-note descending soft bell)
 */
export const playUserLeaveSound = () => {
  const ctx = getAudioContext('roomLeave');
  if (!ctx) return;
  const out = getMasterDestination() || ctx.destination;
  try {
    const now = ctx.currentTime;
    [659.25, 440].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  } catch {}
};

/**
 * Link or code copied snappy tap sound
 */
export const playLinkCopySound = () => {
  const ctx = getAudioContext('linkCopy');
  if (!ctx) return;
  const out = getMasterDestination() || ctx.destination;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.09);
  } catch {}
};

/**
 * Curated Soundboard definitions & synthesizers
 */
export type SoundboardEffectId = 'applause' | 'airhorn' | 'cheer' | 'nani' | 'wow' | 'boom';

export const SOUNDBOARD_SOUNDS: { id: SoundboardEffectId; label: string; icon: string; description: string }[] = [
  { id: 'applause', label: 'Applause', icon: '👏', description: 'Crowd applause & clapping' },
  { id: 'airhorn', label: 'Airhorn', icon: '📯', description: 'Classic party hype airhorn' },
  { id: 'cheer', label: 'Cheer', icon: '🎉', description: 'Triumphant rising celebration' },
  { id: 'nani', label: 'Nani?!', icon: '⚡', description: 'Quirky anime surprise synth' },
  { id: 'wow', label: 'Wow!', icon: '😮', description: 'Ascending wonder glissando' },
  { id: 'boom', label: 'Boom', icon: '💥', description: 'Deep cinematic impact sub-bass' },
];

let lastSoundboardPlayedAt = 0;

export const canPlaySoundboard = (): boolean => {
  const prefs = getSoundPreferences();
  return Date.now() - lastSoundboardPlayedAt >= prefs.soundboardCooldownMs;
};

export const playSoundboardEffect = (soundId: SoundboardEffectId): boolean => {
  const ctx = getAudioContext('soundboard');
  if (!ctx) return false;
  const out = getMasterDestination() || ctx.destination;

  const now = ctx.currentTime;
  lastSoundboardPlayedAt = Date.now();

  try {
    switch (soundId) {
      case 'applause': {
        for (let burst = 0; burst < 6; burst++) {
          const t = now + burst * 0.07;
          const bufferSize = Math.floor(ctx.sampleRate * 0.06);
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const output = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
          }
          const noise = ctx.createBufferSource();
          noise.buffer = buffer;
          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 1000 + burst * 80;
          filter.Q.value = 2.0;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(out);
          noise.start(t);
        }
        break;
      }
      case 'airhorn': {
        const freqs = [466.16, 466.16 * 1.5, 466.16 * 2, 466.16 * 2.5];
        [0, 0.12, 0.24].forEach((burstOffset) => {
          const t = now + burstOffset;
          freqs.forEach((f) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(0.08, t);
            gain.gain.setValueAtTime(0.08, t + 0.09);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
            osc.connect(gain);
            gain.connect(out);
            osc.start(t);
            osc.stop(t + 0.12);
          });
        });
        break;
      }
      case 'cheer': {
        const chords = [
          [261.63, 329.63, 392.0],
          [329.63, 392.0, 523.25],
          [392.0, 493.88, 587.33],
          [523.25, 659.25, 783.99],
        ];
        chords.forEach((chord, step) => {
          const t = now + step * 0.1;
          chord.forEach((freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.09, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            osc.connect(gain);
            gain.connect(out);
            osc.start(t);
            osc.stop(t + 0.28);
          });
        });
        break;
      }
      case 'nani': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        osc.frequency.setValueAtTime(800, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.28);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }
      case 'wow': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(920, now + 0.32);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }
      case 'boom': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.45);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.6);
        break;
      }
    }
    return true;
  } catch {
    return false;
  }
};

