import { StoredWatchParty } from '../types.js';

const STORAGE_KEY = 'synctube_stored_watch_parties';

// Legacy dummy rooms that should never appear on real user devices
const LEGACY_DUMMY_ROOMS = new Set(['FAGRTU', 'ZTQXZY']);

/**
 * Retrieve stored watch parties from localStorage.
 * Guaranteed:
 * 1. Clean on new devices (returns [] when no parties have been joined/created).
 * 2. Purges legacy dummy mock rooms ('FAGRTU', 'ZTQXZY') automatically.
 * 3. Filters by username if provided so each user only sees their own watch party history.
 */
export function getStoredParties(usernameFilter?: string): StoredWatchParty[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let parties: StoredWatchParty[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Purge dummy mock rooms
        parties = parsed.filter(
          (p) => p && p.roomId && !LEGACY_DUMMY_ROOMS.has(String(p.roomId).toUpperCase())
        );
        // Persist cleaned list if dummy rooms were found
        if (parties.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parties));
        }
      }
    }

    // Filter by username if specified
    if (usernameFilter && usernameFilter.trim()) {
      const targetUser = usernameFilter.trim().toLowerCase();
      parties = parties.filter(
        (p) => (p.username || '').trim().toLowerCase() === targetUser
      );
    }

    return parties.sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));
  } catch {
    return [];
  }
}

/**
 * Save or update a watch party in localStorage.
 */
export function saveStoredParty(
  party: Partial<StoredWatchParty> & { roomId: string; username: string }
): void {
  try {
    if (!party.roomId || LEGACY_DUMMY_ROOMS.has(party.roomId.toUpperCase())) return;

    // Fetch all unfiltered parties
    const existing = getStoredParties();
    const prev = existing.find(
      (p) =>
        p.roomId === party.roomId &&
        (!party.username || (p.username || '').toLowerCase() === party.username.toLowerCase())
    );

    const updatedParty: StoredWatchParty = {
      roomId: party.roomId,
      username: party.username || prev?.username || 'Viewer',
      role: party.role || prev?.role || 'PARTICIPANT',
      videoId: party.videoId || prev?.videoId || '',
      videoTitle: party.videoTitle || prev?.videoTitle,
      avatarId: party.avatarId || prev?.avatarId,
      lastVisited: Date.now(),
    };

    const nextList = [
      updatedParty,
      ...existing.filter(
        (p) =>
          !(
            p.roomId === party.roomId &&
            (p.username || '').toLowerCase() === (updatedParty.username || '').toLowerCase()
          )
      ),
    ].slice(0, 25); // keep up to 25 recent parties

    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
  } catch {}
}

/**
 * Remove a specific watch party by roomId (and optional username).
 */
export function removeStoredParty(roomId: string, usernameFilter?: string): StoredWatchParty[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: StoredWatchParty[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const filtered = parsed.filter((p) => {
      if (p.roomId !== roomId) return true;
      if (usernameFilter && usernameFilter.trim()) {
        return (p.username || '').trim().toLowerCase() !== usernameFilter.trim().toLowerCase();
      }
      return false;
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return getStoredParties(usernameFilter);
  } catch {
    return [];
  }
}

/**
 * Clear stored parties (optionally for a specific user only).
 */
export function clearStoredParties(usernameFilter?: string): void {
  try {
    if (usernameFilter && usernameFilter.trim()) {
      const target = usernameFilter.trim().toLowerCase();
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: StoredWatchParty[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const remaining = parsed.filter(
            (p) => (p.username || '').trim().toLowerCase() !== target
          );
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
        }
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('synctube_recent_rooms');
    }
  } catch {}
}
