import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHevcCodec, supportsStreamCodec, checkBrowserHevcSupport } from '../utils/codec.js';

describe('HEVC Codec Support & Detection', () => {
  it('correctly identifies HEVC/H.265 codec strings', () => {
    expect(isHevcCodec('hevc')).toBe(true);
    expect(isHevcCodec('HEVC')).toBe(true);
    expect(isHevcCodec('h265')).toBe(true);
    expect(isHevcCodec('h.265')).toBe(true);
    expect(isHevcCodec('hev1.1.6.L93.B0')).toBe(true);
    expect(isHevcCodec('hvc1.1.6.L93.B0')).toBe(true);
    expect(isHevcCodec('h264')).toBe(false);
    expect(isHevcCodec('avc1')).toBe(false);
    expect(isHevcCodec('vp9')).toBe(false);
    expect(isHevcCodec('')).toBe(false);
    expect(isHevcCodec(undefined)).toBe(false);
  });

  it('supportsStreamCodec always returns true for non-HEVC streams', () => {
    expect(supportsStreamCodec('h264')).toBe(true);
    expect(supportsStreamCodec('avc1.64001f')).toBe(true);
    expect(supportsStreamCodec(undefined)).toBe(true);
  });

  it('checks browser HEVC support via MediaSource when adaptive', () => {
    // Mock MediaSource
    const originalMediaSource = globalThis.MediaSource;
    try {
      (globalThis as any).MediaSource = {
        isTypeSupported: vi.fn((mime: string) => mime.includes('hev1.1.6.L93.B0')),
      };

      expect(checkBrowserHevcSupport(true)).toBe(true);
      expect((globalThis as any).MediaSource.isTypeSupported).toHaveBeenCalled();
    } finally {
      (globalThis as any).MediaSource = originalMediaSource;
    }
  });

  it('returns false gracefully when MediaSource does not support HEVC', () => {
    const originalMediaSource = globalThis.MediaSource;
    try {
      (globalThis as any).MediaSource = {
        isTypeSupported: vi.fn(() => false),
      };

      expect(checkBrowserHevcSupport(true)).toBe(false);
    } finally {
      (globalThis as any).MediaSource = originalMediaSource;
    }
  });
});
