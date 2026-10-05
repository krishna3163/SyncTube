import { describe, expect, it } from 'vitest';
import { getSafeYouTubeThumbnailUrl } from '../utils/identity.js';

describe('Identity and external thumbnail helpers', () => {
  it('uses only HTTPS YouTube image hosts for supplied thumbnails', () => {
    expect(
      getSafeYouTubeThumbnailUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', 'dQw4w9WgXcQ')
    ).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(
      getSafeYouTubeThumbnailUrl('https://attacker.example/image.jpg', 'dQw4w9WgXcQ')
    ).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(getSafeYouTubeThumbnailUrl('javascript:alert(1)', 'invalid')).toBe('');
  });
});
