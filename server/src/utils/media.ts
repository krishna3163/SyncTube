import { extractYouTubeId } from './youtube.js';

export interface DetectedMedia {
  platform: 'youtube' | 'direct' | 'netflix' | 'prime' | 'disney' | 'crunchyroll' | 'twitch' | 'generic';
  mediaId: string;
  url?: string;
  title: string;
  isDirectStream: boolean;
}

const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.m3u8', '.mov'];

export function detectMediaSource(input: string): DetectedMedia | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;

  // 1. YouTube check
  const ytId = extractYouTubeId(trimmed);
  if (ytId) {
    return {
      platform: 'youtube',
      mediaId: ytId,
      url: `https://www.youtube.com/watch?v=${ytId}`,
      title: 'YouTube Video',
      isDirectStream: false,
    };
  }

  // 2. Validate URL structure
  try {
    const url = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const pathname = url.pathname.toLowerCase();
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

    // 2a. Direct video stream file
    const isDirect = DIRECT_VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext) || pathname.includes(`${ext}?`));
    if (isDirect) {
      const filename = pathname.split('/').pop()?.split('?')[0] || 'Direct Stream';
      return {
        platform: 'direct',
        mediaId: url.toString(),
        url: url.toString(),
        title: decodeURIComponent(filename),
        isDirectStream: true,
      };
    }

    // 2b. Known Movie / Anime / Streaming platforms
    if (hostname.includes('netflix.com')) {
      return {
        platform: 'netflix',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Netflix Movie',
        isDirectStream: false,
      };
    }
    if (hostname.includes('primevideo.com') || hostname.includes('amazon.') && pathname.includes('/video/')) {
      return {
        platform: 'prime',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Prime Video Movie',
        isDirectStream: false,
      };
    }
    if (hostname.includes('disneyplus.com') || hostname.includes('hotstar.com')) {
      return {
        platform: 'disney',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Disney+ / Hotstar Movie',
        isDirectStream: false,
      };
    }
    if (hostname.includes('crunchyroll.com')) {
      return {
        platform: 'crunchyroll',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Crunchyroll Anime',
        isDirectStream: false,
      };
    }
    if (hostname.includes('twitch.tv')) {
      return {
        platform: 'twitch',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Twitch Stream',
        isDirectStream: false,
      };
    }

    // 2c. Generic Movie Website / Streaming Website (e.g. vidsrc, soap2day, myflixer, anime platforms, etc.)
    const isCinemaSite = /movie|stream|anime|cinema|watch|video|film|flix|vidsrc|soap2day|myflixer|123movies|bilibili|dailymotion|vimeo/i.test(hostname + pathname);
    if (!isCinemaSite) {
      return null;
    }

    const cleanHost = hostname.replace(/\.(com|org|net|to|is|io|tv|app|dev|me|co)$/, '');
    const capitalizedHost = cleanHost.charAt(0).toUpperCase() + cleanHost.slice(1);
    return {
      platform: 'generic',
      mediaId: url.toString(),
      url: url.toString(),
      title: `${capitalizedHost} Cinema Stream`,
      isDirectStream: false,
    };
  } catch {
    return null;
  }
}
