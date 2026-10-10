export type OriginCallback = (error: Error | null, allow?: boolean) => void;

/**
 * Keep Express and Socket.IO on the same origin policy. In production, only
 * the explicitly configured frontend origin is trusted; suffix/prefix matches
 * can accidentally grant credentials to an attacker-controlled domain.
 */
export function isAllowedOrigin(origin: string | undefined, callback: OriginCallback): void {
  if (!origin || process.env.NODE_ENV !== 'production') {
    callback(null, true);
    return;
  }

  const configuredFrontendUrl = process.env.FRONTEND_URL;
  if (configuredFrontendUrl) {
    try {
      const requestOrigin = new URL(origin);
      const frontendOrigin = new URL(configuredFrontendUrl);
      const isWebOrigin = (url: URL) => url.protocol === 'http:' || url.protocol === 'https:';

      if (
        isWebOrigin(requestOrigin) &&
        isWebOrigin(frontendOrigin) &&
        requestOrigin.origin === origin &&
        requestOrigin.origin === frontendOrigin.origin
      ) {
        callback(null, true);
        return;
      }
    } catch {
      // Invalid origins and malformed configuration fail closed below.
    }
  }

  callback(new Error('CORS origin rejected'), false);
}
