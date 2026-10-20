export type OriginCallback = (error: Error | null, allow?: boolean) => void;

// Production trusted domains for SyncTube
const DEFAULT_TRUSTED_ORIGINS = new Set([
  'https://synctube-qg7l.onrender.com',
  'https://synctube-2ar4.onrender.com',
  'https://sync-tube-krishna3163s-projects.vercel.app',
  'https://sync-tube-tqda.vercel.app',
  'https://synctube.vercel.app',
  'https://sync-tube.vercel.app',
]);

/**
 * Keep Express and Socket.IO on the same origin policy. In production, only
 * explicitly trusted frontend origins and configured FRONTEND_URL values are accepted.
 */
export function isAllowedOrigin(origin: string | undefined, callback: OriginCallback): void {
  if (!origin || process.env.NODE_ENV !== 'production') {
    callback(null, true);
    return;
  }

  // Allow localhost / 127.0.0.1 on any port
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      callback(null, true);
      return;
    }
  } catch {
    // Malformed origin string
  }

  // Allow browser extensions (Chrome, Firefox)
  if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
    callback(null, true);
    return;
  }

  const allowedOrigins = new Set<string>(DEFAULT_TRUSTED_ORIGINS);

  // Render external URL environment variable (set automatically on Render)
  if (process.env.RENDER_EXTERNAL_URL) {
    try {
      allowedOrigins.add(new URL(process.env.RENDER_EXTERNAL_URL).origin);
    } catch {
      // ignore malformed
    }
  }

  // Configured FRONTEND_URL environment variable (supports single or comma-separated list of URLs)
  const configuredFrontendUrl = process.env.FRONTEND_URL;
  if (configuredFrontendUrl) {
    const list = configuredFrontendUrl.split(',').map((u) => u.trim()).filter(Boolean);
    for (const item of list) {
      try {
        const parsed = new URL(item);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          allowedOrigins.add(parsed.origin);
        }
      } catch {
        // ignore malformed
      }
    }
  }

  try {
    const requestOrigin = new URL(origin);
    const isVercelOrigin =
      requestOrigin.hostname.endsWith('.vercel.app') &&
      (requestOrigin.hostname.includes('sync-tube') || requestOrigin.hostname.includes('synctube'));

    if (
      (requestOrigin.protocol === 'http:' || requestOrigin.protocol === 'https:') &&
      (allowedOrigins.has(requestOrigin.origin) || isVercelOrigin) &&
      requestOrigin.origin === origin
    ) {
      callback(null, true);
      return;
    }
  } catch {
    // Invalid origins fail closed below.
  }

  callback(new Error('CORS origin rejected'), false);
}
