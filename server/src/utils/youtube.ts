/**
 * YouTube URL Parser and Validator
 * Supports:
 * - youtube.com/watch?v=ID
 * - youtu.be/ID
 * - youtube.com/embed/ID
 * - youtube.com/v/ID
 * - youtube.com/shorts/ID
 * - Raw 11-char video ID
 */

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function isValidYouTubeId(id: string): boolean {
  return typeof id === 'string' && YOUTUBE_ID_REGEX.test(id.trim());
}

export function extractYouTubeId(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();

  // If it's already an 11-char ID
  if (YOUTUBE_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    // Try URL parsing
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

    // youtube.com (or youtube-nocookie.com)
    if (hostname === 'youtube.com' || hostname === 'youtube-nocookie.com') {
      // /watch?v=ID
      const v = url.searchParams.get('v');
      if (v && isValidYouTubeId(v)) {
        return v;
      }

      // /embed/ID or /v/ID or /shorts/ID
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['embed', 'v', 'shorts'].includes(parts[0])) {
        const id = parts[1];
        if (isValidYouTubeId(id)) {
          return id;
        }
      }
    }
  } catch {
    // Fall back to regex search for robust matching
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/);
    if (match && match[1] && isValidYouTubeId(match[1])) {
      return match[1];
    }
  }

  return null;
}
