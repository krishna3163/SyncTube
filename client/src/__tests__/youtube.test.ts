import { describe, it, expect } from 'vitest';
import { extractYouTubeId, isValidYouTubeId, formatTime } from '../utils/youtube.js';

describe('Client YouTube Utils', () => {
  it('formats seconds into readable mm:ss timestamp', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('validates 11-char YouTube IDs', () => {
    expect(isValidYouTubeId('dQw4w9WgXcQ')).toBe(true);
    expect(isValidYouTubeId('invalid')).toBe(false);
  });

  it('extracts video ID from multiple URL styles', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});
