const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function isValidYouTubeId(id: string): boolean {
  return typeof id === 'string' && YOUTUBE_ID_REGEX.test(id.trim());
}

export function extractYouTubeId(input: string): string | null {
  if (!input || typeof input !== 'string' || input.length > 2048) {
    return null;
  }

  const trimmed = input.trim();

  // If it's already an 11-char ID
  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

    // youtu.be/ID
    if (hostname === 'youtu.be') {
      const pathname = url.pathname.slice(1);
      const id = pathname.split('/')[0];
      if (isValidYouTubeId(id)) {
        return id;
      }
    }

    // youtube.com (or youtube-nocookie.com, music.youtube.com)
    if (hostname === 'youtube.com' || hostname === 'youtube-nocookie.com' || hostname === 'music.youtube.com') {
      // /watch?v=ID
      const v = url.searchParams.get('v');
      if (v && isValidYouTubeId(v)) {
        return v;
      }

      // /embed/ID or /v/ID or /shorts/ID or /live/ID
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['embed', 'v', 'shorts', 'live'].includes(parts[0])) {
        const id = parts[1];
        if (isValidYouTubeId(id)) {
          return id;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function formatTime(seconds: number): string {
  const rounded = Math.floor(Math.max(0, seconds));
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
