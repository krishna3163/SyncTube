import { StoredWatchParty } from '../types.js';

const STORAGE_KEY = 'synctube_stored_watch_parties';

export function getStoredParties(): StoredWatchParty[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let parties: StoredWatchParty[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parties = parsed;
      }
    } else {
      // Seed initial sample parties matching mockup
      parties = [
        {
          roomId: 'FAGRTU',
          username: 'h',
          role: 'HOST' as const,
          videoId: '6RMuQdkIZQo',
          avatarId: 'tanjiro',
          lastVisited: Date.now() - 30 * 60 * 1000,
        },
        {
          roomId: 'ZTQXZY',
          username: 'bcdbcb',
          role: 'HOST' as const,
          videoId: '6RMuQdkIZQo',
          avatarId: 'naruto',
          lastVisited: Date.now() - 30 * 60 * 1000,
        },
      ];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parties));
    }
    return parties.sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));
  } catch {
    return [];
  }
}

export function saveStoredParty(party: Partial<StoredWatchParty> & { roomId: string; username: string }): void {
  try {
    const existing = getStoredParties();
    const prev = existing.find((p) => p.roomId === party.roomId);

    const updatedParty: StoredWatchParty = {
      roomId: party.roomId,
      username: party.username || prev?.username || 'Viewer',
      role: party.role || prev?.role || 'PARTICIPANT',
      videoId: party.videoId || prev?.videoId || 'LXb3EKWsInQ',
      videoTitle: party.videoTitle || prev?.videoTitle,
      avatarId: party.avatarId || prev?.avatarId,
      lastVisited: Date.now(),
    };

    const nextList = [
      updatedParty,
      ...existing.filter((p) => p.roomId !== party.roomId),
    ].slice(0, 15); // keep last 15 parties

    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
  } catch {}
}

export function removeStoredParty(roomId: string): StoredWatchParty[] {
  try {
    const existing = getStoredParties().filter((p) => p.roomId !== roomId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    return existing;
  } catch {
    return [];
  }
}

export function clearStoredParties(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('synctube_recent_rooms');
  } catch {}
}
