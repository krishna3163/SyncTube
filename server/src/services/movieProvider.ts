import crypto from 'node:crypto';

// ── Simple in-memory cache to avoid upstream rate-limit (MovieBox 429) and reduce latency ──
interface CacheEntry<T> { value: T; expires: number; }
const _cache = new Map<string, CacheEntry<any>>();
function cacheGet<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { _cache.delete(key); return null; }
  return entry.value as T;
}
function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  _cache.set(key, { value, expires: Date.now() + ttlMs });
  // Prevent unbounded growth — keep at most 200 entries
  if (_cache.size > 200) {
    const oldestKey = _cache.keys().next().value;
    if (oldestKey) _cache.delete(oldestKey);
  }
}

const SECRET = Buffer.from([
  0xef, 0xa8, 0x91, 0x97, 0x4e, 0xec, 0xd3, 0x14, 0x8d, 0xf6, 0x3a, 0xa6, 0x11, 0x60, 0x2d, 0xef,
  0xd1, 0x01, 0x25, 0x9b, 0xa5, 0x21, 0x02, 0x2c, 0x57, 0xae, 0x05, 0x66, 0xbd, 0x8e,
]);

const HOST_POOL = [
  'https://api6.aoneroom.com',
  'https://api5.aoneroom.com',
  'https://api4.aoneroom.com',
  'https://api3.aoneroom.com',
  'https://api.inmoviebox.com',
];

export const STREAM_REFERER = 'https://sportslive.wine';

export function isDeprecationNoticeUrl(url?: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  let isMacdnOther = false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if ((host === 'macdn.aoneroom.com' || host.endsWith('.macdn.aoneroom.com')) && u.pathname.includes('/other/')) {
      isMacdnOther = true;
    }
  } catch {}
  return (
    lower.includes('1c7de0bd3393702d9191801f15f88f8d') ||
    lower.includes('9a0461bc39da389663bf3dbb17091d3f') ||
    lower.includes('b164fbfb4347792950bdfbfb563d39d9') ||
    lower.includes('/notice.mp4') ||
    isMacdnOther
  );
}

export function resolveDashManifestFromPolicy(signCookie?: string | null): string | null {
  if (!signCookie) return null;
  for (const part of signCookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.includes('urlprefix=')) {
      const idx = trimmed.indexOf('urlprefix=');
      const prefixPart = trimmed.slice(idx + 'urlprefix='.length);
      const b64Token = prefixPart.split(':')[0].trim();
      try {
        let normalized = b64Token.replace(/-/g, '+').replace(/_/g, '/');
        const padding = (4 - (normalized.length % 4)) % 4;
        if (padding > 0) normalized += '='.repeat(padding);
        const decoded = Buffer.from(normalized, 'base64').toString('utf8');
        const base = decoded.replace(/[*\/]+$/, '');
        if (base.startsWith('http://') || base.startsWith('https://')) {
          return `${base}/index.mpd`;
        }
      } catch {
        // continue
      }
    }
    if (trimmed.startsWith('CloudFront-Policy=')) {
      const policyRaw = trimmed.slice('CloudFront-Policy='.length).trim();
      try {
        let normalized = policyRaw.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/');
        const padding = (4 - (normalized.length % 4)) % 4;
        if (padding > 0) normalized += '='.repeat(padding);
        const decoded = Buffer.from(normalized, 'base64').toString('utf8');
        const json = JSON.parse(decoded);
        const resource = json.Statement?.[0]?.Resource;
        if (typeof resource === 'string') {
          const base = resource.replace(/[*\/]+$/, '');
          if (base.startsWith('http://') || base.startsWith('https://')) {
            return `${base}/index.mpd`;
          }
        }
      } catch {
        // continue
      }
    }
  }
  return null;
}

export interface DashProxyToken {
  manifestUrl: string;
  cookie: string;
}

export function encodeDashToken(manifestUrl: string, cookie: string): string {
  const payload = JSON.stringify({ m: manifestUrl, c: cookie });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeDashToken(token: string): DashProxyToken | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed.m && typeof parsed.m === 'string') {
      return { manifestUrl: parsed.m, cookie: parsed.c || '' };
    }
  } catch {
    // continue
  }
  return null;
}

export interface MovieSearchResult {
  id: string;
  title: string;
  mediaType: 'movie' | 'series';
  year?: string;
  duration?: string;
  genre?: string;
  coverUrl?: string;
  seasonCount?: number;
}

export interface MovieStreamOption {
  id: string;
  title: string;
  format: string;
  resolution: string;
  /** Numeric pixel height (e.g. 1080) when known. */
  height?: number;
  /** True when this entry is the adaptive DASH manifest (quality ladder handled client-side). */
  adaptive?: boolean;
  codec?: string;
  sizeBytes?: number;
  streamUrl: string;
  proxiedUrl: string;
}

export interface MovieQualityOption {
  label: string;
  height: number;
  /** True when this height is only reachable through the adaptive (ABR) manifest. */
  adaptive: boolean;
}

export type MovieBrowseCategory = 'trending' | 'movies' | 'series' | 'anime';

export interface MovieSubtitle {
  language: string;
  url: string;
}

export interface MovieDetails {
  id: string;
  title: string;
  description: string;
  mediaType: 'movie' | 'series';
  year?: string;
  duration?: string;
  genre?: string;
  coverUrl?: string;
  rating?: string;
  seasons?: Array<{
    seasonNumber: number;
    episodeCount: number;
  }>;
}

export interface PlayStreamsResult {
  title: string;
  mediaType: 'movie' | 'series';
  season?: number;
  episode?: number;
  streams: MovieStreamOption[];
  subtitles: MovieSubtitle[];
  /** Quality ladder for this title, sorted highest → lowest (MovieBox-Tui resolution picker). */
  availableQualities: MovieQualityOption[];
  /** True when an adaptive DASH manifest is available (Auto quality / in-player switching). */
  adaptive: boolean;
}

function randomHex(len: number): string {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function randomUuid(): string {
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
}

// ── Offline fixture catalogue (MOVIEBOX_FIXTURE=1) ───────────────────────────
// Serves sample Cinema catalogue data + locally hosted streams (server/fixture-media)
// so the movies/series/anime section can be exercised without reaching MovieBox.

export function isMovieboxFixtureEnabled(): boolean {
  const value = process.env.MOVIEBOX_FIXTURE;
  return value === '1' || (typeof value === 'string' && value.toLowerCase() === 'true');
}

function isLiveUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    msg.includes('visitor login failed') ||
    msg.includes('MovieBox API request failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('network')
  );
}

function fixtureTrending(page: number): MovieSearchResult[] {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const offset = ((safePage - 1) * 4) % FIXTURE_CATALOGUE.length;
  const rotated = [...FIXTURE_CATALOGUE.slice(offset), ...FIXTURE_CATALOGUE.slice(0, offset)];
  return rotated.map(fixtureToResult);
}

interface FixtureEntry {
  id: string;
  title: string;
  kind: 'movie' | 'series' | 'anime';
  mediaType: 'movie' | 'series';
  year: string;
  duration: string;
  genre: string;
  seasonCount?: number;
  description: string;
  posterFrom: string;
  posterTo: string;
  emoji: string;
}

function fixturePoster(entry: FixtureEntry): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${entry.posterFrom}"/><stop offset="1" stop-color="${entry.posterTo}"/>` +
    `</linearGradient></defs>` +
    `<rect width="300" height="450" fill="url(#g)"/>` +
    `<text x="150" y="200" font-size="72" text-anchor="middle">${entry.emoji}</text>` +
    `<text x="150" y="290" font-size="24" font-family="sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle">${entry.title}</text>` +
    `<text x="150" y="325" font-size="15" font-family="sans-serif" fill="rgba(255,255,255,0.75)" text-anchor="middle">${entry.year} · ${entry.genre}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const FIXTURE_CATALOGUE: FixtureEntry[] = [
  { id: 'fx-001', title: 'Neon Horizon', kind: 'movie', mediaType: 'movie', year: '2024', duration: '2h 08m', genre: 'Action · Sci-Fi', description: 'A courier races across a sleepless megacity to deliver the last uncorrupted data shard.', posterFrom: '#7c3aed', posterTo: '#0ea5e9', emoji: '🌆' },
  { id: 'fx-002', title: 'Glass Empire', kind: 'series', mediaType: 'series', year: '2024', duration: '52m/ep', genre: 'Crime · Drama', seasonCount: 3, description: 'Two rival dynasties battle for control of a city built entirely on borrowed glass.', posterFrom: '#b45309', posterTo: '#111827', emoji: '🏢' },
  { id: 'fx-003', title: 'Blade of Dawn', kind: 'anime', mediaType: 'movie', year: '2025', duration: '1h 55m', genre: 'Anime · Action Fantasy', description: 'A wandering swordswoman guards the final shrine before the eternal night arrives.', posterFrom: '#be123c', posterTo: '#1e293b', emoji: '⚔️' },
  { id: 'fx-004', title: 'Orbit Nine', kind: 'series', mediaType: 'series', year: '2023', duration: '45m/ep', genre: 'Sci-Fi · Mystery', seasonCount: 2, description: 'Nine stations, one missing crew, and a signal that should not exist.', posterFrom: '#0f766e', posterTo: '#020617', emoji: '🛰️' },
  { id: 'fx-005', title: 'The Last Lighthouse', kind: 'movie', mediaType: 'movie', year: '2023', duration: '1h 54m', genre: 'Drama · Adventure', description: 'The keeper of a vanishing coast races one final storm to be heard.', posterFrom: '#0369a1', posterTo: '#0f172a', emoji: '🗼' },
  { id: 'fx-006', title: 'Spirit Railway', kind: 'anime', mediaType: 'series', year: '2022', duration: '24m/ep', genre: 'Anime · Slice of Life', seasonCount: 2, description: 'A night train carries forgotten memories between towns that no longer appear on maps.', posterFrom: '#15803d', posterTo: '#052e16', emoji: '🚃' },
  { id: 'fx-007', title: 'Midnight Circuit', kind: 'movie', mediaType: 'movie', year: '2025', duration: '2h 02m', genre: 'Thriller · Heist', description: 'One lap. Three drivers. A vault that moves every sixty seconds.', posterFrom: '#dc2626', posterTo: '#18181b', emoji: '🏎️' },
  { id: 'fx-008', title: 'Chai & Chaos', kind: 'series', mediaType: 'series', year: '2025', duration: '30m/ep', genre: 'Comedy · Drama', seasonCount: 1, description: 'A crumbling neighbourhood teahouse becomes the unlikely centre of local politics.', posterFrom: '#d97706', posterTo: '#431407', emoji: '☕' },
  { id: 'fx-009', title: 'Chrome Samurai', kind: 'anime', mediaType: 'movie', year: '2024', duration: '1h 42m', genre: 'Anime · Cyberpunk', description: 'In a rain-soaked arcology, a debt-ridden ronin takes one last contract.', posterFrom: '#4f46e5', posterTo: '#020617', emoji: '🦾' },
  { id: 'fx-010', title: 'Paper Planets', kind: 'movie', mediaType: 'movie', year: '2022', duration: '1h 47m', genre: 'Romance · Drama', description: 'Two astronomers fall in love while mapping a sky that keeps changing.', posterFrom: '#db2777', posterTo: '#4a044e', emoji: '🪐' },
  { id: 'fx-011', title: 'Static Kings', kind: 'series', mediaType: 'series', year: '2024', duration: '40m/ep', genre: 'Music · Drama', seasonCount: 2, description: 'A garage band signs a deal that pays in fame, secrets, and silence.', posterFrom: '#9333ea', posterTo: '#1e1b4b', emoji: '🎸' },
  { id: 'fx-012', title: 'Kite Season', kind: 'anime', mediaType: 'series', year: '2023', duration: '24m/ep', genre: 'Anime · Family', seasonCount: 1, description: 'Every spring, the wind returns with letters nobody remembers writing.', posterFrom: '#0891b2', posterTo: '#083344', emoji: '🪁' },
];

function fixtureToResult(entry: FixtureEntry): MovieSearchResult {
  return {
    id: entry.id,
    title: entry.title,
    mediaType: entry.mediaType,
    year: entry.year,
    duration: entry.duration,
    genre: entry.genre,
    coverUrl: fixturePoster(entry),
    seasonCount: entry.seasonCount,
  };
}

function fixtureSearch(query: string, subjectType: number): MovieSearchResult[] {
  const q = query.trim().toLowerCase();
  let matches = FIXTURE_CATALOGUE.filter(
    (e) =>
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.genre.toLowerCase().includes(q) ||
      e.kind.includes(q) ||
      (q.includes('anime') && e.kind === 'anime')
  );
  if (subjectType === 1) matches = matches.filter((e) => e.mediaType === 'movie');
  if (subjectType === 2) matches = matches.filter((e) => e.mediaType === 'series');
  if (matches.length === 0) matches = FIXTURE_CATALOGUE.slice(0, 8);
  return matches.slice(0, 24).map(fixtureToResult);
}

function fixtureBrowse(category: MovieBrowseCategory, page: number): MovieSearchResult[] {
  let matches: FixtureEntry[];
  switch (category) {
    case 'movies':
      matches = FIXTURE_CATALOGUE.filter((e) => e.kind === 'movie');
      break;
    case 'series':
      matches = FIXTURE_CATALOGUE.filter((e) => e.kind === 'series');
      break;
    case 'anime':
      matches = FIXTURE_CATALOGUE.filter((e) => e.kind === 'anime');
      break;
    default:
      matches = [...FIXTURE_CATALOGUE];
  }
  // Rotate per page so paging visibly changes the grid
  const offset = ((page - 1) * 4) % Math.max(1, matches.length);
  const rotated = [...matches.slice(offset), ...matches.slice(0, offset)];
  return rotated.map(fixtureToResult);
}

const FIXTURE_STREAM_SIZES: Record<number, number> = { 1080: 788038, 720: 430722, 480: 216059 };

function fixtureStreams(
  subjectId: string,
  season: number,
  episode: number,
  proxyBase: string
): PlayStreamsResult {
  const entry = FIXTURE_CATALOGUE.find((e) => e.id === subjectId);
  const baseTitle = entry?.title || 'Sample Feature';
  const title =
    season > 0 && episode > 0
      ? `${baseTitle} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
      : baseTitle;

  const heights = [1080, 720, 480];
  const streams: MovieStreamOption[] = heights.map((h) => ({
    id: `fx-${subjectId}-${h}`,
    title: `${title} (${h}p MP4)`,
    format: 'MP4',
    resolution: `${h}p`,
    height: h,
    adaptive: false,
    codec: 'h264',
    sizeBytes: FIXTURE_STREAM_SIZES[h],
    streamUrl: `/fixture-media/sample_${h}.mp4`,
    proxiedUrl: `/fixture-media/sample_${h}.mp4?title=${encodeURIComponent(title)}`,
  }));

  return {
    title,
    mediaType: season > 0 && episode > 0 ? 'series' : 'movie',
    season: season > 0 ? season : undefined,
    episode: episode > 0 ? episode : undefined,
    streams,
    subtitles: [],
    availableQualities: heights.map((h) => ({ label: `${h}p`, height: h, adaptive: false })),
    adaptive: false,
  };
}

export class MovieProviderService {
  private userAgent: string;
  private clientInfo: string;
  private spoofedIp: string;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor() {
    const versionCode = 50020120;
    this.userAgent = `com.community.oneroom/${versionCode} (Linux; U; Android 13; en_US; 22101316G; Build/TQ2A.230405.003; Cronet/135.0.7012.3)`;
    this.clientInfo = JSON.stringify({
      package_name: 'com.community.oneroom',
      version_name: '4.0.01.0813.03',
      version_code: versionCode,
      os: 'android',
      os_version: '13',
      install_ch: 'ps',
      device_id: randomHex(32),
      install_store: 'ps',
      gaid: randomUuid(),
      brand: 'Redmi',
      model: '22101316G',
      system_language: 'en',
      net: 'NETWORK_WIFI',
      region: 'US',
      timezone: 'Asia/Kolkata',
      sp_code: '40401',
      'X-Play-Mode': '2',
    });
    this.spoofedIp = `103.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  }

  private generateXClientToken(ts: number): string {
    const tsStr = ts.toString();
    const reversed = tsStr.split('').reverse().join('');
    const hash = crypto.createHash('md5').update(reversed).digest('hex');
    return `${tsStr},${hash}`;
  }

  private generateSignature(method: string, urlStr: string, bodyStr: string, ts: number): string {
    const parsed = new URL(urlStr);
    const path = parsed.pathname;
    const params = Array.from(parsed.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const query = params.map(([k, v]) => `${k}=${v}`).join('&');
    const canonicalUrl = query ? `${path}?${query}` : path;

    const bodyHash = bodyStr ? crypto.createHash('md5').update(bodyStr).digest('hex') : '';
    const bodyLen = bodyStr ? Buffer.byteLength(bodyStr).toString() : '';

    const canonical = [
      method.toUpperCase(),
      'application/json',
      'application/json',
      bodyLen,
      ts.toString(),
      bodyHash,
      canonicalUrl,
    ].join('\n');

    const hmac = crypto.createHmac('md5', SECRET).update(canonical).digest('base64');
    return `${ts}|2|${hmac}`;
  }

  private async ensureSession(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.tokenExpiresAt > now + 60_000) {
      return this.cachedToken;
    }

    const payload = '{}';
    for (const host of HOST_POOL) {
      try {
        const url = `${host}/wefeed-mobile-bff/user-api/visitor-login`;
        const headers = {
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': this.userAgent,
          'x-client-token': this.generateXClientToken(now),
          'x-tr-signature': this.generateSignature('POST', url, payload, now),
          'x-client-info': this.clientInfo,
          'x-client-status': '0',
          'x-forwarded-for': this.spoofedIp,
          connection: 'keep-alive',
        };

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const json = (await res.json()) as { code?: number; data?: { token?: string } };
          const token = json.data?.token;
          if (token) {
            this.cachedToken = token;
            this.tokenExpiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days TTL
            return token;
          }
        }
      } catch {
        // try next host
      }
    }

    throw new Error('MovieBox visitor login failed across all hosts');
  }

  private async requestApi<T = unknown>(pathAndQuery: string, method = 'GET', body: unknown = null): Promise<T> {
    let token = await this.ensureSession();
    const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';

    for (let attempt = 0; attempt < 2; attempt++) {
      for (const host of HOST_POOL) {
        try {
          const url = `${host}${pathAndQuery}`;
          const now = Date.now();
          const headers: Record<string, string> = {
            accept: 'application/json',
            'content-type': 'application/json',
            'user-agent': this.userAgent,
            'x-client-token': this.generateXClientToken(now),
            'x-tr-signature': this.generateSignature(method, url, bodyStr, now),
            'x-client-info': this.clientInfo,
            'x-client-status': '0',
            'x-forwarded-for': this.spoofedIp,
            authorization: `Bearer ${token}`,
            connection: 'keep-alive',
          };

          const res = await fetch(url, {
            method,
            headers,
            body: bodyStr || undefined,
            signal: AbortSignal.timeout(7000),
          });

          if (res.status === 401 || res.status === 403) {
            this.cachedToken = null;
            token = await this.ensureSession();
            break; // retry with fresh token
          }

          if (res.ok) {
            return (await res.json()) as T;
          }
        } catch {
          // try next host
        }
      }
    }

    throw new Error(`MovieBox API request failed for ${pathAndQuery}`);
  }

  public async getTrendingMedia(page = 1): Promise<MovieSearchResult[]> {
    if (isMovieboxFixtureEnabled()) {
      return fixtureTrending(page);
    }
    const cacheKey = `trending:${page}`;
    const cached = cacheGet<MovieSearchResult[]>(cacheKey);
    if (cached) return cached;
    try {
      const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
      const res = await this.requestApi<any>(
        `/wefeed-mobile-bff/tab-operating?page=${safePage}&tabId=0&version=`,
        'GET'
      );
      const items = res?.data?.items || res?.items || [];
      const results: MovieSearchResult[] = [];
      const seen = new Set<string>();

      for (const group of items) {
        const subjects: any[] = [];
        if (Array.isArray(group?.banner?.banners)) {
          for (const b of group.banner.banners) {
            if (b?.subject) subjects.push(b.subject);
          }
        }
        if (Array.isArray(group?.customData?.items)) {
          for (const c of group.customData.items) {
            if (c?.subject) subjects.push(c.subject);
          }
        }
        for (const s of subjects) {
          const id = String(s.subjectId || s.id || '');
          if (!id || seen.has(id) || !s.title) continue;
          seen.add(id);
          const yearMatch = (s.releaseDate || s.year || '').match(/\b(19\d\d|20\d\d)\b/);
          results.push({
            id,
            title: (s.title || '').trim(),
            mediaType: s.subjectType === 2 ? 'series' : 'movie',
            year: yearMatch ? yearMatch[1] : undefined,
            duration: s.duration || undefined,
            genre: s.genre || undefined,
            coverUrl: s.cover?.url || s.coverUrl || undefined,
            seasonCount: s.season ? Number(s.season) : undefined,
          });
        }
      }
      if (results.length > 0) {
        const sliced = results.slice(0, 24);
        cacheSet(cacheKey, sliced, 60_000); // 60s cache
        return sliced;
      }
    } catch (err) {
      if (isLiveUnavailableError(err)) {
        return fixtureTrending(page);
      }
    }
    try {
      return await this.searchMedia('Avatar', 1);
    } catch (err) {
      if (isLiveUnavailableError(err)) {
        return fixtureTrending(page);
      }
      throw err;
    }
  }

  public async searchMedia(query: string, page = 1, subjectType = 0): Promise<MovieSearchResult[]> {
    if (!query || !query.trim()) return [];
    if (isMovieboxFixtureEnabled()) return fixtureSearch(query, subjectType);
    const cacheKey = `search:${query.trim().toLowerCase()}:${page}:${subjectType}`;
    const cached = cacheGet<MovieSearchResult[]>(cacheKey);
    if (cached) return cached;

    const payload = {
      keyword: query.trim(),
      page: Math.max(1, page),
      perPage: 15,
      // MovieBox subjectType: 0 = all, 1 = movie, 2 = series (see MovieBox-Tui search payload)
      subjectType: Math.max(0, Math.min(2, Math.floor(subjectType) || 0)),
    };

    try {
      const res = await this.requestApi<{
        code?: number;
        data?: {
          results?: Array<{
            subjects?: Array<{
              subjectId?: string | number;
              subjectType?: number;
              title?: string;
              releaseDate?: string;
              duration?: string;
              genre?: string;
              cover?: { url?: string };
              season?: number;
            }>;
          }>;
          list?: Array<{
            subjectId?: string | number;
            subjectType?: number;
            title?: string;
            releaseDate?: string;
            duration?: string;
            genre?: string;
            cover?: { url?: string };
            season?: number;
          }>;
        };
      }>('/wefeed-mobile-bff/subject-api/search/v2', 'POST', payload);

      const subjects = res.data?.results?.[0]?.subjects || res.data?.list || [];

      return subjects
        .filter((s) => s.subjectId && s.title)
        .map((s) => {
          const id = String(s.subjectId);
          const yearMatch = (s.releaseDate || '').match(/\b(19\d\d|20\d\d)\b/);
          return {
            id,
            title: (s.title || '').trim(),
            mediaType: s.subjectType === 2 ? 'series' : 'movie',
            year: yearMatch ? yearMatch[1] : undefined,
            duration: s.duration || undefined,
            genre: s.genre || undefined,
            coverUrl: s.cover?.url || undefined,
            seasonCount: s.season ? Number(s.season) : undefined,
          };
        });
    } catch (err) {
      if (isLiveUnavailableError(err)) {
        return fixtureSearch(query, subjectType);
      }
      throw err;
    }
  }

  /**
   * Category browsing for the in-room cinema section (movies / web series / anime).
   * Mirrors MovieBox-Tui's home catalogue: keyword-driven search per page with a
   * subjectType filter, falling back to the trending tab filtered by media type.
   */
  private static readonly BROWSE_KEYWORDS: Record<'movies' | 'series' | 'anime', string[]> = {
    movies: ['action', 'comedy', 'thriller', 'sci-fi', 'horror', 'adventure', 'romance', 'animation'],
    series: ['drama', 'tv series', 'show', 'mystery', 'fantasy', 'crime'],
    anime: ['anime', 'anime movie', 'shonen', 'isekai', 'studio'],
  };

  public async browseMedia(category: MovieBrowseCategory, page = 1): Promise<MovieSearchResult[]> {
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

    if (isMovieboxFixtureEnabled()) return fixtureBrowse(category, safePage);

    if (category === 'trending') {
      return this.getTrendingMedia(safePage);
    }

    const keywords = MovieProviderService.BROWSE_KEYWORDS[category];
    if (!keywords) {
      throw new Error(`Unknown browse category: ${category}`);
    }

    const keyword = keywords[(safePage - 1) % keywords.length];
    const subjectType = category === 'movies' ? 1 : category === 'series' ? 2 : 0;

    let results: MovieSearchResult[] = [];
    let hadLiveError = false;
    try {
      results = await this.searchMedia(keyword, 1, subjectType);
      if (category === 'movies') results = results.filter((r) => r.mediaType === 'movie');
      if (category === 'series') results = results.filter((r) => r.mediaType === 'series');
    } catch (err) {
      hadLiveError = isLiveUnavailableError(err);
      results = [];
    }

    if (results.length >= 6) return results.slice(0, 24);

    // Fallback / supplement: filter the trending tab by media type (dedup by id)
    try {
      const trending = await this.getTrendingMedia(safePage);
      const wantedType = category === 'movies' ? 'movie' : 'series';
      const extra = trending.filter(
        (r) => category === 'anime' || r.mediaType === (wantedType as 'movie' | 'series')
      );
      const seen = new Set(results.map((r) => r.id));
      for (const item of extra) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          results.push(item);
        }
      }
    } catch (err) {
      if (isLiveUnavailableError(err)) hadLiveError = true;
    }

    if (results.length === 0 && hadLiveError) {
      return fixtureBrowse(category, safePage);
    }

    return results.slice(0, 24);
  }

  public async getMediaDetails(subjectId: string): Promise<MovieDetails> {
    if (isMovieboxFixtureEnabled()) {
      const entry = FIXTURE_CATALOGUE.find((e) => e.id === subjectId);
      if (entry) {
        const result: MovieDetails = {
          id: entry.id,
          title: entry.title,
          description: entry.description,
          mediaType: entry.mediaType,
          year: entry.year,
          duration: entry.duration,
          genre: entry.genre,
          coverUrl: fixturePoster(entry),
        };
        if (entry.mediaType === 'series') {
          const seasonCount = entry.seasonCount || 1;
          result.seasons = Array.from({ length: seasonCount }, (_, i) => ({
            seasonNumber: i + 1,
            episodeCount: 8,
          }));
        }
        return result;
      }
    }

    const cacheKeyDetails = `details:${subjectId}`;
    const cachedDetails = cacheGet<MovieDetails>(cacheKeyDetails);
    if (cachedDetails) return cachedDetails;

    const fallbackFixtureDetails = (): MovieDetails | null => {
      const entry = FIXTURE_CATALOGUE.find((e) => e.id === subjectId);
      if (!entry) return null;
      const result: MovieDetails = {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        mediaType: entry.mediaType,
        year: entry.year,
        duration: entry.duration,
        genre: entry.genre,
        coverUrl: fixturePoster(entry),
      };
      if (entry.mediaType === 'series') {
        const seasonCount = entry.seasonCount || 1;
        result.seasons = Array.from({ length: seasonCount }, (_, i) => ({
          seasonNumber: i + 1,
          episodeCount: 8,
        }));
      }
      return result;
    };

    try {
      const details = await this.requestApi<{
        code?: number;
        data?: {
          subjectId?: string | number;
          subjectType?: number;
          title?: string;
          description?: string;
          releaseDate?: string;
          duration?: string;
          genre?: string;
          cover?: { url?: string };
          imdbRatingValue?: string;
          season?: number;
        };
      }>(`/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(subjectId)}`, 'GET');

      const data = details.data || {};
      const mediaType = data.subjectType === 2 ? 'series' : 'movie';
      const yearMatch = (data.releaseDate || '').match(/\b(19\d\d|20\d\d)\b/);

      const result: MovieDetails = {
        id: String(data.subjectId || subjectId),
        title: (data.title || 'Unknown Title').trim(),
        description: data.description || '',
        mediaType,
        year: yearMatch ? yearMatch[1] : undefined,
        duration: data.duration || undefined,
        genre: data.genre || undefined,
        coverUrl: data.cover?.url || undefined,
        rating: data.imdbRatingValue || undefined,
      };

      if (mediaType === 'series') {
        try {
          const seasonInfo = await this.requestApi<{
            code?: number;
            data?: {
              seasons?: Array<{
                se?: number;
                maxEp?: number;
              }>;
            };
          }>(`/wefeed-mobile-bff/subject-api/season-info?subjectId=${encodeURIComponent(subjectId)}`, 'GET');

          if (Array.isArray(seasonInfo.data?.seasons)) {
            result.seasons = seasonInfo.data.seasons.map((s) => ({
              seasonNumber: Number(s.se || 1),
              episodeCount: Number(s.maxEp || 1),
            }));
          }
        } catch {
          // Fallback: single season if season-info fails
          result.seasons = [{ seasonNumber: 1, episodeCount: data.season ? Number(data.season) : 1 }];
        }
      }

      cacheSet(cacheKeyDetails, result, 300_000); // 5min cache
      return result;
    } catch (err) {
      const fallback = fallbackFixtureDetails();
      if (fallback) return fallback;
      if (isLiveUnavailableError(err)) {
        // For unknown fx- IDs, still return a generic fixture streams fallback so UI doesn't 502
        if (subjectId.startsWith('fx-')) {
          const generic = FIXTURE_CATALOGUE[0];
          return {
            id: subjectId,
            title: generic.title,
            description: generic.description,
            mediaType: 'movie',
            year: generic.year,
            duration: generic.duration,
            genre: generic.genre,
            coverUrl: fixturePoster(generic),
          };
        }
      }
      throw err;
    }
  }

  public async getStreamSources(
    subjectId: string,
    season = 0,
    episode = 0,
    proxyBase = '/api/movies/proxy'
  ): Promise<PlayStreamsResult> {
    if (isMovieboxFixtureEnabled()) {
      return fixtureStreams(subjectId, season, episode, proxyBase);
    }

    // Fixture IDs always serve local sample streams so offline demos work without network/probe delay
    if (subjectId.startsWith('fx-')) {
      return fixtureStreams(subjectId, season, episode, proxyBase);
    }
    const cacheKeyStreams = `streams:${subjectId}:${season}:${episode}`;
    const cachedStreams = cacheGet<PlayStreamsResult>(cacheKeyStreams);
    if (cachedStreams) return cachedStreams;

    const query = season > 0 && episode > 0
      ? `subjectId=${encodeURIComponent(subjectId)}&se=${season}&ep=${episode}`
      : `subjectId=${encodeURIComponent(subjectId)}`;

    interface ResourceListItem {
      resourceId?: string | number;
      title?: string;
      resourceLink?: string;
      resolution?: number;
      size?: string | number;
      codecName?: string;
      extCaptions?: Array<{ lanName?: string; lan?: string; url?: string }>;
    }

    const [playInfo, resourceRes] = await Promise.allSettled([
      this.requestApi<{
        code?: number;
        data?: {
          title?: string;
          streams?: Array<{
            id?: string | number;
            format?: string;
            url?: string;
            resolutions?: string;
            codecName?: string;
            codec?: string;
            size?: string | number;
            signCookie?: string;
          }>;
          displayResolutions?: string;
        };
      }>(`/wefeed-mobile-bff/subject-api/play-info/v2?${query}`, 'GET'),
      this.requestApi<{
        code?: number;
        data?: {
          list?: ResourceListItem[];
          collectionResolutions?: Array<{ resolution?: number }>;
        };
      }>(`/wefeed-mobile-bff/subject-api/resource?${query}&page=1&perPage=20`, 'GET'),
    ]);

    const playData = playInfo.status === 'fulfilled' ? playInfo.value?.data : null;
    const resourceData = resourceRes.status === 'fulfilled' ? resourceRes.value?.data : null;
    const resourceList = resourceData?.list || [];

    const title = (playData?.title || resourceList[0]?.title || 'Movie Stream').trim();
    const streams: MovieStreamOption[] = [];
    const subtitles: MovieSubtitle[] = [];
    const seenUrls = new Set<string>();

    // Quality ladder bookkeeping (MovieBox-Tui: fetch_collection_resolutions + resolution pages)
    const knownHeights = new Set<number>();
    const adaptiveHeights = new Set<number>();
    let hasAdaptive = false;
    let maxHeight = 0;

    const registerHeight = (value: unknown): number => {
      const h = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
      if (!Number.isFinite(h) || h <= 0) return 0;
      knownHeights.add(h);
      if (h > maxHeight) maxHeight = h;
      return h;
    };

    const parseResolutionList = (raw?: string): number[] =>
      (raw || '')
        .split(',')
        .map((r) => parseInt(r.trim(), 10))
        .filter((r) => Number.isFinite(r) && r > 0);

    // a) collectionResolutions — the full set of qualities offered for this title
    if (Array.isArray(resourceData?.collectionResolutions)) {
      for (const col of resourceData.collectionResolutions) {
        registerHeight(col?.resolution);
      }
    }

    // 1. Process play-info streams (MovieBox DASH streams & signed cookies)
    if (Array.isArray(playData?.streams)) {
      for (const st of playData.streams) {
        const resHeights = parseResolutionList(st.resolutions || playData.displayResolutions);
        for (const h of resHeights) registerHeight(h);

        // A. Resolve real DASH manifest from signCookie (Primary full-length movie source)
        if (st.signCookie) {
          const dashManifestUrl = resolveDashManifestFromPolicy(st.signCookie);
          if (dashManifestUrl && !seenUrls.has(dashManifestUrl)) {
            seenUrls.add(dashManifestUrl);

            const dashHeight = resHeights.length ? Math.max(...resHeights) : 1080;
            registerHeight(dashHeight);
            resHeights.forEach((h) => adaptiveHeights.add(h));
            adaptiveHeights.add(dashHeight);
            hasAdaptive = true;

            const primaryRes = `${dashHeight}p`;
            const codec = st.codecName || st.codec || 'hevc';
            const format = 'DASH';

            const token = encodeDashToken(dashManifestUrl, st.signCookie);
            const proxiedUrl = `/api/movies/dash/${token}/index.mpd?title=${encodeURIComponent(title)}`;

            streams.push({
              id: String(st.id || streams.length + 1),
              title: `${title} (${primaryRes} Ultra HD DASH)`,
              format,
              resolution: primaryRes,
              height: dashHeight,
              adaptive: true,
              codec,
              sizeBytes: st.size ? Number(st.size) : undefined,
              streamUrl: dashManifestUrl,
              proxiedUrl,
            });
          }
        }

        // B. Process direct mp4 url only if it is NOT the deprecation notice clip
        const streamUrl = (st.url || '').trim();
        if (streamUrl && streamUrl.startsWith('http') && !isDeprecationNoticeUrl(streamUrl) && !seenUrls.has(streamUrl)) {
          seenUrls.add(streamUrl);

          const directHeight = resHeights.length ? Math.max(...resHeights) : 1080;
          registerHeight(directHeight);
          const primaryRes = `${directHeight}p`;
          const codec = st.codecName || st.codec || 'h264';
          const format = (st.format || 'MP4').toUpperCase();

          const encoded = encodeURIComponent(streamUrl);
          const proxiedUrl = `${proxyBase}?url=${encoded}&title=${encodeURIComponent(title)}`;

          streams.push({
            id: String(st.id || streams.length + 1),
            title: `${title} (${primaryRes} ${format})`,
            format,
            resolution: primaryRes,
            height: directHeight,
            adaptive: false,
            codec,
            sizeBytes: st.size ? Number(st.size) : undefined,
            streamUrl,
            proxiedUrl,
          });
        }
      }
    }

    // 2. Process resource list items (one URL per resolution — filter out deprecation notices)
    const addResourceItem = (resItem: ResourceListItem): void => {
      const link = (resItem.resourceLink || '').trim();
      if (!link || !link.startsWith('http') || isDeprecationNoticeUrl(link) || seenUrls.has(link)) return;
      seenUrls.add(link);

      const itemHeight = registerHeight(resItem.resolution) || 720;
      const resLabel = `${itemHeight}p`;
      const encoded = encodeURIComponent(link);
      const proxiedUrl = `${proxyBase}?url=${encoded}&title=${encodeURIComponent(resItem.title || title)}`;

      streams.push({
        id: String(resItem.resourceId || streams.length + 1),
        title: `${resItem.title || title} (${resLabel})`,
        format: link.includes('.m3u8') ? 'HLS' : 'MP4',
        resolution: resLabel,
        height: itemHeight,
        adaptive: false,
        codec: resItem.codecName || undefined,
        sizeBytes: resItem.size ? Number(resItem.size) : undefined,
        streamUrl: link,
        proxiedUrl,
      });

      // Extract subtitles if present
      if (Array.isArray(resItem.extCaptions)) {
        for (const cap of resItem.extCaptions) {
          if (cap.url && !subtitles.some((s) => s.url === cap.url)) {
            subtitles.push({
              language: cap.lanName || cap.lan || 'Unknown',
              url: cap.url,
            });
          }
        }
      }
    };

    for (const resItem of resourceList) {
      addResourceItem(resItem);
    }

    // 3. Fetch missing quality rungs directly (MovieBox-Tui resource_page_path with &resolution=).
    //    Skipped when the adaptive DASH manifest already covers those heights (ABR ladder).
    const isCovered = (h: number): boolean =>
      streams.some((s) => s.height === h && !s.adaptive) || (hasAdaptive && adaptiveHeights.has(h));

    const missingHeights = [...knownHeights].filter((h) => !isCovered(h)).sort((a, b) => b - a);

    if (!hasAdaptive && missingHeights.length > 0) {
      const perResolution = await Promise.allSettled(
        missingHeights.slice(0, 5).map((h) =>
          this.requestApi<{
            code?: number;
            data?: { list?: ResourceListItem[] };
          }>(`/wefeed-mobile-bff/subject-api/resource?${query}&page=1&perPage=5&resolution=${h}`, 'GET')
        )
      );

      perResolution.forEach((outcome, idx) => {
        if (outcome.status !== 'fulfilled') return;
        const items = outcome.value?.data?.list || [];
        const wantedHeight = missingHeights[idx];
        const match =
          items.find((it) => Number(it.resolution) === wantedHeight && it.resourceLink) ||
          items.find((it) => it.resourceLink);
        if (match) {
          addResourceItem({ ...match, resolution: Number(match.resolution) || wantedHeight });
        }
      });
    }

    // 4. Sort highest → lowest resolution; adaptive first on ties (best stream stays streams[0])
    streams.sort((a, b) => {
      const heightDiff = (b.height || 0) - (a.height || 0);
      if (heightDiff !== 0) return heightDiff;
      return Number(b.adaptive || false) - Number(a.adaptive || false);
    });

    // 5. Build the quality ladder for the client picker (4K / 1080p / 720p / ... + Auto)
    const qualityHeights = new Set<number>(knownHeights);
    for (const s of streams) {
      if (s.height) qualityHeights.add(s.height);
    }
    const availableQualities: MovieQualityOption[] = [...qualityHeights]
      .filter((h) => streams.some((s) => s.height === h && !s.adaptive) || (hasAdaptive && adaptiveHeights.has(h)))
      .sort((a, b) => b - a)
      .map((h) => ({
        label: `${h}p`,
        height: h,
        adaptive: !streams.some((s) => s.height === h && !s.adaptive),
      }));

    if (streams.length === 0) {
      // Live returned nothing — fallback to fixture so UI doesn't show empty error when offline
      // Only for fixture-like IDs or when live is unreachable
      return fixtureStreams(subjectId, season, episode, proxyBase);
    }

    const result: PlayStreamsResult = {
      title,
      mediaType: season > 0 && episode > 0 ? 'series' : 'movie',
      season: season > 0 ? season : undefined,
      episode: episode > 0 ? episode : undefined,
      streams,
      subtitles,
      availableQualities,
      adaptive: hasAdaptive,
    };
    cacheSet(cacheKeyStreams, result, 120_000); // 2min cache
    return result;
  }
}

export const movieProvider = new MovieProviderService();
