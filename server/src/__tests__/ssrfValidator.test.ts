import { describe, it, expect } from 'vitest';
import { validateSafeUrl } from '../utils/ssrfValidator.js';

describe('SSRF and Security URL Validator', () => {
  it('allows safe public websites', async () => {
    const res1 = await validateSafeUrl('https://example.com');
    expect(res1.safe).toBe(true);
    expect(res1.normalizedUrl).toBe('https://example.com/');

    const res2 = await validateSafeUrl('duckduckgo.com');
    expect(res2.safe).toBe(true);
    expect(res2.normalizedUrl).toBe('https://duckduckgo.com/');

    const res3 = await validateSafeUrl('https://en.wikipedia.org/wiki/Main_Page');
    expect(res3.safe).toBe(true);
    expect(res3.normalizedUrl).toBe('https://en.wikipedia.org/wiki/Main_Page');
  });

  it('rejects dangerous and non-http protocols', async () => {
    const res1 = await validateSafeUrl('file:///etc/passwd');
    expect(res1.safe).toBe(false);
    expect(res1.error).toContain('Protocol "file:" is not allowed');

    const res2 = await validateSafeUrl('javascript:alert(1)');
    expect(res2.safe).toBe(false);

    const res3 = await validateSafeUrl('data:text/html,<h1>Hello</h1>');
    expect(res3.safe).toBe(false);

    const res4 = await validateSafeUrl('gopher://example.com');
    expect(res4.safe).toBe(false);
  });

  it('blocks loopback and localhost destinations', async () => {
    const res1 = await validateSafeUrl('http://localhost:10000');
    expect(res1.safe).toBe(false);
    expect(res1.error).toContain('blocked for security');

    const res2 = await validateSafeUrl('http://127.0.0.1:8080');
    expect(res2.safe).toBe(false);

    const res3 = await validateSafeUrl('http://127.0.1.1');
    expect(res3.safe).toBe(false);
  });

  it('blocks private IPv4 networks (RFC 1918)', async () => {
    const res1 = await validateSafeUrl('http://10.0.0.1/admin');
    expect(res1.safe).toBe(false);

    const res2 = await validateSafeUrl('http://192.168.1.1');
    expect(res2.safe).toBe(false);

    const res3 = await validateSafeUrl('http://172.16.0.5:3000');
    expect(res3.safe).toBe(false);

    const res4 = await validateSafeUrl('http://172.31.255.255');
    expect(res4.safe).toBe(false);
  });

  it('blocks cloud metadata endpoints (169.254.169.254)', async () => {
    const res1 = await validateSafeUrl('http://169.254.169.254/latest/meta-data/');
    expect(res1.safe).toBe(false);
    expect(res1.error).toContain('blocked');

    const res2 = await validateSafeUrl('http://metadata.google.internal/computeMetadata/v1/');
    expect(res2.safe).toBe(false);
  });

  it('rejects empty and malformed inputs', async () => {
    const res1 = await validateSafeUrl('');
    expect(res1.safe).toBe(false);

    const res2 = await validateSafeUrl('   ');
    expect(res2.safe).toBe(false);
  });
});
