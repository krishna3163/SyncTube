/**
 * Known HEVC/H.265 MIME types and parameter profiles.
 * Note: Chromium requires full profile/level parameters (e.g. hev1.1.6.L93.B0)
 * rather than simple "hev1" or "hvc1" to report supported codecs.
 */
export const HEVC_MIME_TYPES = [
  'video/mp4; codecs="hev1.1.6.L93.B0"',
  'video/mp4; codecs="hev1.1.6.L120.B0"',
  'video/mp4; codecs="hev1.1.6.L150.B0"',
  'video/mp4; codecs="hev1.1.6.L153.B0"',
  'video/mp4; codecs="hev1.2.4.L120.B0"',
  'video/mp4; codecs="hvc1.1.6.L93.B0"',
  'video/mp4; codecs="hvc1.1.6.L120.B0"',
  'video/mp4; codecs="hvc1.1.6.L150.B0"',
  'video/mp4; codecs="hvc1.1.6.L153.B0"',
  'video/mp4; codecs="hvc1.2.4.L120.B0"',
  'video/mp4; codecs="hev1"',
  'video/mp4; codecs="hvc1"',
];

/**
 * Checks whether the current browser environment can decode HEVC (H.265) streams.
 * If isAdaptive is true, tests MediaSource.isTypeSupported (used by Dash.js).
 * Otherwise tests HTMLMediaElement.canPlayType.
 */
export function checkBrowserHevcSupport(isAdaptive = false): boolean {
  if (isAdaptive) {
    const ms: typeof MediaSource | undefined =
      typeof MediaSource !== 'undefined'
        ? MediaSource
        : typeof (globalThis as any).MediaSource !== 'undefined'
        ? (globalThis as any).MediaSource
        : undefined;

    if (!ms || typeof ms.isTypeSupported !== 'function') return false;
    return HEVC_MIME_TYPES.some((mime) => {
      try {
        return ms.isTypeSupported(mime);
      } catch {
        return false;
      }
    });
  }

  const doc = typeof document !== 'undefined' ? document : (globalThis as any).document;
  if (!doc || typeof doc.createElement !== 'function') return false;
  try {
    const video = doc.createElement('video');
    return HEVC_MIME_TYPES.some((mime) => {
      const res = video.canPlayType(mime);
      return res === 'probably' || res === 'maybe';
    });
  } catch {
    return false;
  }
}

/**
 * Returns true if the codec string designates HEVC / H.265.
 */
export function isHevcCodec(codec?: string): boolean {
  if (!codec) return false;
  return /hevc|h\.?265|hev1|hvc1/i.test(codec);
}

/**
 * Checks whether a stream's codec is supported by the current browser.
 */
export function supportsStreamCodec(codec?: string, adaptive = false): boolean {
  if (!isHevcCodec(codec)) return true;
  return checkBrowserHevcSupport(adaptive);
}
