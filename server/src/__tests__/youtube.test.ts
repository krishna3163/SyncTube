import { describe, it, expect } from 'vitest';
import { extractYouTubeId, isValidYouTubeId } from '../utils/youtube.js';

describe('YouTube Utility', () => {
  it('validates 11-character video IDs correctly', () => {
    expect(isValidYouTubeId('dQw4w9WgXcQ')).toBe(true);
    expect(isValidYouTubeId('M7lc1UVf-VE')).toBe(true);
    expect(isValidYouTubeId('1234567890_')).toBe(true);
    expect(isValidYouTubeId('short')).toBe(false);
    expect(isValidYouTubeId('too_long_video_id_here')).toBe(false);
    expect(isValidYouTubeId('contains*inv')).toBe(false);
  });

  it('extracts ID from various YouTube URL formats', () => {
    // Raw ID
    expect(extractYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');

    // Standard watch URL
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('http://youtube.com/watch?v=dQw4w9WgXcQ&t=40s')).toBe('dQw4w9WgXcQ');

    // Shortened URL
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ');

    // Embed URL
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');

    // Shorts URL
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');

    // Mobile URL
    expect(extractYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');

    // Invalid URLs
    expect(extractYouTubeId('https://vimeo.com/12345')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
    expect(extractYouTubeId('')).toBeNull();
  });
});
