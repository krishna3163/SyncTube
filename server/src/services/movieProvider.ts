import crypto from 'node:crypto';

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
  return (
    lower.includes('1c7de0bd3393702d9191801f15f88f8d') ||
    lower.includes('9a0461bc39da389663bf3dbb17091d3f') ||
    lower.includes('b164fbfb4347792950bdfbfb563d39d9') ||
    lower.includes('/notice.mp4') ||
    (lower.includes('macdn.aoneroom.com') && lower.includes('/other/'))
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
  codec?: string;
  sizeBytes?: number;
  streamUrl: string;
  proxiedUrl: string;
}

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
}

function randomHex(len: number): string {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function randomUuid(): string {
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
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

  public async searchMedia(query: string, page = 1): Promise<MovieSearchResult[]> {
    if (!query || !query.trim()) return [];

    const payload = {
      keyword: query.trim(),
      page: Math.max(1, page),
      perPage: 15,
      subjectType: 0,
    };

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
  }

  public async getMediaDetails(subjectId: string): Promise<MovieDetails> {
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

    return result;
  }

  public async getStreamSources(
    subjectId: string,
    season = 0,
    episode = 0,
    proxyBase = '/api/movies/proxy'
  ): Promise<PlayStreamsResult> {
    const query = season > 0 && episode > 0
      ? `subjectId=${encodeURIComponent(subjectId)}&se=${season}&ep=${episode}`
      : `subjectId=${encodeURIComponent(subjectId)}`;

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
          list?: Array<{
            resourceId?: string | number;
            title?: string;
            resourceLink?: string;
            resolution?: number;
            size?: string | number;
            codecName?: string;
            extCaptions?: Array<{
              lanName?: string;
              lan?: string;
              url?: string;
            }>;
          }>;
        };
      }>(`/wefeed-mobile-bff/subject-api/resource?${query}&page=1&perPage=10`, 'GET'),
    ]);

    const playData = playInfo.status === 'fulfilled' ? playInfo.value?.data : null;
    const resourceList = resourceRes.status === 'fulfilled' ? resourceRes.value?.data?.list || [] : [];

    const title = (playData?.title || resourceList[0]?.title || 'Movie Stream').trim();
    const streams: MovieStreamOption[] = [];
    const subtitles: MovieSubtitle[] = [];
    const seenUrls = new Set<string>();

    // 1. Process play-info streams (MovieBox DASH streams & signed cookies)
    if (Array.isArray(playData?.streams)) {
      for (const st of playData.streams) {
        // A. Resolve real DASH manifest from signCookie (Primary full-length movie source)
        if (st.signCookie) {
          const dashManifestUrl = resolveDashManifestFromPolicy(st.signCookie);
          if (dashManifestUrl && !seenUrls.has(dashManifestUrl)) {
            seenUrls.add(dashManifestUrl);

            const resList = (st.resolutions || playData.displayResolutions || '1080,720,480')
              .split(',')
              .map((r) => r.trim())
              .filter(Boolean);

            const primaryRes = resList[0] ? `${resList[0]}p` : '1080p';
            const codec = st.codecName || st.codec || 'hevc';
            const format = 'DASH';

            const token = encodeDashToken(dashManifestUrl, st.signCookie);
            const proxiedUrl = `/api/movies/dash/${token}/index.mpd?title=${encodeURIComponent(title)}`;

            streams.push({
              id: String(st.id || streams.length + 1),
              title: `${title} (${primaryRes} Ultra HD DASH)`,
              format,
              resolution: primaryRes,
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

          const resList = (st.resolutions || playData.displayResolutions || '1080,720,480')
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean);

          const primaryRes = resList[0] ? `${resList[0]}p` : '1080p';
          const codec = st.codecName || st.codec || 'h264';
          const format = (st.format || 'MP4').toUpperCase();

          const encoded = encodeURIComponent(streamUrl);
          const proxiedUrl = `${proxyBase}?url=${encoded}&title=${encodeURIComponent(title)}`;

          streams.push({
            id: String(st.id || streams.length + 1),
            title: `${title} (${primaryRes} ${format})`,
            format,
            resolution: primaryRes,
            codec,
            sizeBytes: st.size ? Number(st.size) : undefined,
            streamUrl,
            proxiedUrl,
          });
        }
      }
    }

    // 2. Process resource list items (filter out deprecation notices)
    for (const resItem of resourceList) {
      const link = (resItem.resourceLink || '').trim();
      if (!link || !link.startsWith('http') || isDeprecationNoticeUrl(link) || seenUrls.has(link)) continue;
      seenUrls.add(link);

      const resLabel = resItem.resolution ? `${resItem.resolution}p` : '720p';
      const encoded = encodeURIComponent(link);
      const proxiedUrl = `${proxyBase}?url=${encoded}&title=${encodeURIComponent(resItem.title || title)}`;

      streams.push({
        id: String(resItem.resourceId || streams.length + 1),
        title: `${resItem.title || title} (${resLabel})`,
        format: link.includes('.m3u8') ? 'HLS' : 'MP4',
        resolution: resLabel,
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
    }

    return {
      title,
      mediaType: season > 0 && episode > 0 ? 'series' : 'movie',
      season: season > 0 ? season : undefined,
      episode: episode > 0 ? episode : undefined,
      streams,
      subtitles,
    };
  }
}

export const movieProvider = new MovieProviderService();
