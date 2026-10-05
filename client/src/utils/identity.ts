const USER_ID_KEY = 'synctube_user_id';
const ROOM_TOKEN_PREFIX = 'synctube_room_identity:';
const USER_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export function getOrCreateUserId(): string {
  const current = localStorage.getItem(USER_ID_KEY);
  if (current && USER_ID_PATTERN.test(current)) return current;

  const userId = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, userId);
  sessionStorage.setItem(USER_ID_KEY, userId);
  return userId;
}

export function getRoomIdentityToken(roomId: string): string | undefined {
  const token = localStorage.getItem(`${ROOM_TOKEN_PREFIX}${roomId.toUpperCase()}`);
  return token && TOKEN_PATTERN.test(token) ? token : undefined;
}

export function saveRoomIdentityToken(roomId: string, token: string): void {
  if (!TOKEN_PATTERN.test(token)) return;
  localStorage.setItem(`${ROOM_TOKEN_PREFIX}${roomId.toUpperCase()}`, token);
}

export function getSafeYouTubeThumbnailUrl(thumbnail: string | undefined, videoId: string): string {
  if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    const fallback = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    if (!thumbnail) return fallback;

    try {
      const url = new URL(thumbnail);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol === 'https:' &&
        (host === 'img.youtube.com' || host === 'i.ytimg.com' || host.endsWith('.ytimg.com') || host.endsWith('.ggpht.com'))
      ) {
        return url.href;
      }
    } catch {
      return fallback;
    }

    return fallback;
  }
  return '';
}
