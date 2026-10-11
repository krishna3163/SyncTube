export type OriginCallback = (error: Error | null, allow?: boolean) => void;

// Production trusted domains for SyncTube
const DEFAULT_TRUSTED_ORIGINS = new Set([
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
    if (
      (requestOrigin.protocol === 'http:' || requestOrigin.protocol === 'https:') &&
      allowedOrigins.has(requestOrigin.origin) &&
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
