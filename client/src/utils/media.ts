import { extractYouTubeId } from './youtube.js';

export type PlaybackCategory = 'youtube' | 'direct_stream' | 'movie_website' | 'temp_browser' | 'tab_share';

export interface MediaBadgeInfo {
  label: string;
  badgeClass: string;
  icon: string;
  description: string;
  category: PlaybackCategory;
}

export interface DetectedClientMedia {
  platform: 'youtube' | 'direct' | 'netflix' | 'prime' | 'disney' | 'crunchyroll' | 'twitch' | 'generic' | 'temp_browser' | 'tab_share';
  mediaId: string;
  url?: string;
  title: string;
  isDirectStream: boolean;
  category: PlaybackCategory;
  badge: MediaBadgeInfo;
}

const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.m3u8', '.mov', '.mpd'];

export function detectClientMedia(input: string): DetectedClientMedia | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return null;

  // 0. Temporary Browser session check
  if (trimmed.startsWith('tb:') || trimmed.startsWith('browser:')) {
    return {
      platform: 'temp_browser',
      mediaId: trimmed,
      title: 'Temporary Browser Cinema Stream',
      isDirectStream: false,
      category: 'temp_browser',
      badge: {
        label: 'Temporary Browser Cinema',
        badgeClass: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
        icon: '🌐',
        description: 'Live composited Chromium cinema stream with synchronized friends',
        category: 'temp_browser',
      },
    };
  }

  // 1. YouTube check
  const ytId = extractYouTubeId(trimmed);
  if (ytId) {
    return {
      platform: 'youtube',
      mediaId: ytId,
      url: `https://www.youtube.com/watch?v=${ytId}`,
      title: 'YouTube Video',
      isDirectStream: false,
      category: 'youtube',
      badge: {
        label: 'YouTube Video',
        badgeClass: 'bg-red-500/15 text-red-400 border border-red-500/30',
        icon: '▶️',
        description: 'Synchronized native YouTube player with auto-buffering',
        category: 'youtube',
      },
    };
  }

  // 2. URL parsing
  try {
    const url = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const pathname = url.pathname.toLowerCase();
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

    // Direct Video Stream (MP4 / WebM / HLS / DASH / MovieBox Proxy)
    const isMovieProxy =
      pathname.includes('/api/movies/proxy') ||
      pathname.includes('/movies/proxy') ||
      pathname.includes('/api/movies/dash') ||
      pathname.includes('/movies/dash');
    const isDirect =
      DIRECT_VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext) || pathname.includes(`${ext}?`)) ||
      isMovieProxy;

    if (isDirect) {
      const paramTitle = url.searchParams.get('title');
      const rawName = pathname.split('/').pop()?.split('?')[0] || 'Direct Stream';
      const cleanName = paramTitle ? decodeURIComponent(paramTitle) : decodeURIComponent(rawName);
      return {
        platform: 'direct',
        mediaId: url.toString(),
        url: url.toString(),
        title: cleanName,
        isDirectStream: true,
        category: 'direct_stream',
        badge: {
          label: isMovieProxy ? 'HD Cinema Stream (MovieBox)' : 'Direct Movie Stream (MP4/HLS)',
          badgeClass: isMovieProxy
            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
          icon: isMovieProxy ? '🎬' : '🎞️',
          description: isMovieProxy
            ? 'HD Movie/Show stream with synchronized timeline and real-time Ambient Mode'
            : 'Plays directly in-room with synchronized timeline and ultra-low drift',
          category: 'direct_stream',
        },
      };
    }

    // Specific streaming services
    if (hostname.includes('netflix.com')) {
      return {
        platform: 'netflix',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Netflix Watch Party',
        isDirectStream: false,
        category: 'movie_website',
        badge: {
          label: 'Netflix Cinema',
          badgeClass: 'bg-red-600/20 text-red-300 border border-red-500/30',
          icon: '🍿',
          description: 'Synchronizes your Netflix playback across tabs via SyncTube extension',
          category: 'movie_website',
        },
      };
    }

    if (hostname.includes('primevideo.com') || (hostname.includes('amazon.') && pathname.includes('/video/'))) {
      return {
        platform: 'prime',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Prime Video Movie Party',
        isDirectStream: false,
        category: 'movie_website',
        badge: {
          label: 'Prime Video',
          badgeClass: 'bg-blue-600/20 text-blue-300 border border-blue-500/30',
          icon: '🍿',
          description: 'Synchronizes Amazon Prime Video playback with party members',
          category: 'movie_website',
        },
      };
    }

    if (hostname.includes('disneyplus.com') || hostname.includes('hotstar.com')) {
      return {
        platform: 'disney',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Disney+ / Hotstar Party',
        isDirectStream: false,
        category: 'movie_website',
        badge: {
          label: 'Disney+ / Hotstar',
          badgeClass: 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30',
          icon: '✨',
          description: 'Synchronizes Disney+ streaming with your party',
          category: 'movie_website',
        },
      };
    }

    if (hostname.includes('crunchyroll.com')) {
      return {
        platform: 'crunchyroll',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Crunchyroll Anime Party',
        isDirectStream: false,
        category: 'movie_website',
        badge: {
          label: 'Crunchyroll Anime',
          badgeClass: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
          icon: '🍥',
          description: 'Synchronizes anime stream with live anime reactions',
          category: 'movie_website',
        },
      };
    }

    if (hostname.includes('twitch.tv')) {
      return {
        platform: 'twitch',
        mediaId: url.toString(),
        url: url.toString(),
        title: 'Twitch Stream Party',
        isDirectStream: false,
        category: 'movie_website',
        badge: {
          label: 'Twitch Stream',
          badgeClass: 'bg-purple-600/20 text-purple-300 border border-purple-500/30',
          icon: '🎮',
          description: 'Synchronizes Twitch live stream watch party',
          category: 'movie_website',
        },
      };
    }

    // Generic Movie Website or Anime platform
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
      title: `${capitalizedHost} Movie Stream`,
      isDirectStream: false,
      category: 'movie_website',
      badge: {
        label: `${capitalizedHost} Movie Website`,
        badgeClass: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
        icon: '🎬',
        description: 'Universal Cinema Sync: coordinates play/pause/seek across browser tabs via extension',
        category: 'movie_website',
      },
    };
  } catch {
    return null;
  }
}

export const CINEMA_SAMPLE_PRESETS = [
  {
    name: 'Sintel Trailer (MP4)',
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    category: 'direct_stream' as const,
    icon: '🐉',
    badge: 'Direct Stream',
  },
  {
    name: 'Oceans Nature (4K MP4)',
    url: 'https://vjs.zencdn.net/v/oceans.mp4',
    category: 'direct_stream' as const,
    icon: '🌊',
    badge: 'Direct Stream',
  },
  {
    name: 'Big Buck Bunny (MP4)',
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
    category: 'direct_stream' as const,
    icon: '🐰',
    badge: 'Direct Stream',
  },
  {
    name: 'Lofi Girl Live (YouTube)',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    category: 'youtube' as const,
    icon: '🎧',
    badge: 'YouTube',
  },
];
