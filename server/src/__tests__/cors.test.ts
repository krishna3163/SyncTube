import { afterEach, describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../utils/cors.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalFrontendUrl = process.env.FRONTEND_URL;

function checkOrigin(origin: string | undefined) {
  let result: { error: Error | null; allowed?: boolean } | undefined;
  isAllowedOrigin(origin, (error, allowed) => {
    result = { error, allowed };
  });
  return result!;
}

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = originalFrontendUrl;
});

describe('production CORS origin policy', () => {
  it('allows the exact configured frontend origin', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://watch.example.com/app/';

    expect(checkOrigin('https://watch.example.com')).toEqual({ error: null, allowed: true });
  });

  it('rejects attacker-controlled origins that merely share a prefix or hosting suffix', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://watch.example.com';

    for (const origin of [
      'https://watch.example.com.attacker.test',
      'https://attacker.vercel.app',
      'https://localhost.attacker.test',
    ]) {
      const result = checkOrigin(origin);
      expect(result?.error?.message).toBe('CORS origin rejected');
      expect(result?.allowed).toBe(false);
    }
  });

  it('fails closed when production has no valid frontend URL configured', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FRONTEND_URL;

    const result = checkOrigin('https://watch.example.com');
    expect(result?.error?.message).toBe('CORS origin rejected');
    expect(result?.allowed).toBe(false);
  });

  it('allows requests without an Origin header and development origins', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.FRONTEND_URL;

    expect(checkOrigin(undefined)).toEqual({ error: null, allowed: true });
    expect(checkOrigin('https://local.test')).toEqual({ error: null, allowed: true });
  });
});
