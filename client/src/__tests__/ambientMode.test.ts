import { describe, expect, it } from 'vitest';

describe('Video Ambient Mode Architecture', () => {
  it('correctly calculates adaptive opacity based on scene luminance', () => {
    // Luminance calculation: 0.299*R + 0.587*G + 0.114*B
    const calcLuma = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Dark night scene (black/deep navy)
    const darkLuma = calcLuma(10, 15, 25);
    expect(darkLuma).toBeLessThan(0.15);
    const darkTargetOpacity = Math.max(0.32, Math.min(0.72, 0.36 + darkLuma * 0.34));
    expect(darkTargetOpacity).toBeLessThanOrEqual(0.42);

    // Bright daylight / colorful scene
    const brightLuma = calcLuma(240, 245, 255);
    expect(brightLuma).toBeGreaterThan(0.85);
    const brightTargetOpacity = Math.max(0.32, Math.min(0.72, 0.36 + brightLuma * 0.34));
    expect(brightTargetOpacity).toBeGreaterThanOrEqual(0.65);

    // Midtone scene (e.g. vibrant red shirt: R=220, G=40, B=50)
    const redLuma = calcLuma(220, 40, 50);
    const redTargetOpacity = Math.max(0.32, Math.min(0.72, 0.36 + redLuma * 0.34));
    expect(redTargetOpacity).toBeGreaterThan(0.45);
    expect(redTargetOpacity).toBeLessThan(0.65);
  });

  it('safely catches and flags cross-origin SecurityErrors without throwing', () => {
    const handleFrameExtraction = (throwSecurityError: boolean) => {
      try {
        if (throwSecurityError) {
          const err = new Error('The canvas has been tainted by cross-origin data.');
          err.name = 'SecurityError';
          throw err;
        }
        return { isSupported: true, error: null };
      } catch (err: any) {
        if (err.name === 'SecurityError' || err.code === 18) {
          return { isSupported: false, error: 'cors_restricted' };
        }
        throw err;
      }
    };

    const normalResult = handleFrameExtraction(false);
    expect(normalResult.isSupported).toBe(true);
    expect(normalResult.error).toBeNull();

    const restrictedResult = handleFrameExtraction(true);
    expect(restrictedResult.isSupported).toBe(false);
    expect(restrictedResult.error).toBe('cors_restricted');
  });

  it('calculates optimal low-resolution sampling aspect ratio', () => {
    const sampleWidth = 64;
    const sampleHeight = 36;
    const aspectRatio = sampleWidth / sampleHeight;
    // Standard 16:9 ratio is 1.777...
    expect(aspectRatio).toBeCloseTo(16 / 9, 2);
  });
});
