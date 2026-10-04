import { ANIME_AVATARS, AnimeAvatar, getAvatarById, getAvatarForUsername } from './animeAvatars.js';

const STORAGE_KEY = 'synctube_participant_characters_v1';

// In-memory lookup: maps normalized identifier (username or userId) to chosen avatarId
const characterCache = new Map<string, string>();

// Initialize from persistent storage
function initCache() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string') {
            characterCache.set(k.toLowerCase().trim(), v);
          }
        }
      }
    }
  } catch {
    // Ignore storage parse issues
  }
}
initCache();

function persistCache() {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of characterCache.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore storage quota issues
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeCharacterUpdates(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore listener error
    }
  });
}

/**
 * Remember a participant's character/avatar across all places in the app.
 */
export function rememberParticipantCharacter(
  username?: string,
  userId?: string,
  avatarId?: string
): void {
  if (!avatarId) return;
  const validAv = getAvatarById(avatarId);
  if (!validAv) return;

  let changed = false;
  const cleanId = avatarId;

  if (userId) {
    const uKey = userId.toLowerCase().trim();
    if (characterCache.get(uKey) !== cleanId) {
      characterCache.set(uKey, cleanId);
      changed = true;
    }
  }

  if (username) {
    const nKey = username.toLowerCase().trim();
    if (characterCache.get(nKey) !== cleanId) {
      characterCache.set(nKey, cleanId);
      changed = true;
    }
  }

  if (changed) {
    persistCache();
    notifyListeners();
  }
}

/**
 * Retrieve the remembered character ID for a participant.
 * If not found, generates a consistent deterministic character for that username,
 * remembers it permanently in the registry, and returns it.
 */
export function getParticipantCharacterId(
  username?: string,
  userId?: string,
  explicitAvatarId?: string
): string {
  // If explicit avatar ID is passed and valid, remember and return it immediately
  if (explicitAvatarId && getAvatarById(explicitAvatarId)) {
    rememberParticipantCharacter(username, userId, explicitAvatarId);
    return explicitAvatarId;
  }

  // Check cache by userId
  if (userId) {
    const cachedByUserId = characterCache.get(userId.toLowerCase().trim());
    if (cachedByUserId && getAvatarById(cachedByUserId)) {
      if (username) characterCache.set(username.toLowerCase().trim(), cachedByUserId);
      return cachedByUserId;
    }
  }

  // Check cache by username
  if (username) {
    const cachedByUsername = characterCache.get(username.toLowerCase().trim());
    if (cachedByUsername && getAvatarById(cachedByUsername)) {
      if (userId) characterCache.set(userId.toLowerCase().trim(), cachedByUsername);
      return cachedByUsername;
    }
  }

  // Fallback: Generate deterministic anime avatar from username or userId
  const seed = (username || userId || 'participant').trim();
  const defaultAv = getAvatarForUsername(seed);

  // Remember this character so all future lookups across Viewers, Chat, Requests, and Activity remain identical
  if (username) characterCache.set(username.toLowerCase().trim(), defaultAv.id);
  if (userId) characterCache.set(userId.toLowerCase().trim(), defaultAv.id);
  persistCache();

  return defaultAv.id;
}

/**
 * Get full AnimeAvatar object for a participant.
 */
export function getParticipantAvatar(
  username?: string,
  userId?: string,
  explicitAvatarId?: string
): AnimeAvatar {
  const avId = getParticipantCharacterId(username, userId, explicitAvatarId);
  return getAvatarById(avId) || ANIME_AVATARS[0];
}
