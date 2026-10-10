import { describe, expect, it } from 'vitest';
import { isClusterEnabled } from '../utils/cluster.js';

describe('cluster configuration', () => {
  it('defaults to a single process when no cluster flag is provided', () => {
    const configuredClusterValue = process.env.CLUSTER;
    delete process.env.CLUSTER;
    try {
      expect(isClusterEnabled()).toBe(false);
    } finally {
      if (configuredClusterValue === undefined) delete process.env.CLUSTER;
      else process.env.CLUSTER = configuredClusterValue;
    }
  });

  it('only enables clustering when explicitly requested', () => {
    expect(isClusterEnabled('1')).toBe(true);
    expect(isClusterEnabled('true')).toBe(true);
    expect(isClusterEnabled('TRUE')).toBe(true);
    expect(isClusterEnabled('0')).toBe(false);
    expect(isClusterEnabled('')).toBe(false);
  });
});
