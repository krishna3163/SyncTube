import { describe, it, expect } from 'vitest';
import { serverSentry } from '../services/sentry.js';

describe('Sentry Backend Service', () => {
  it('handles captureException gracefully without throwing', () => {
    const error = new Error('Test server exception');
    expect(() => serverSentry.captureException(error, { test: true })).not.toThrow();
  });

  it('handles captureMessage gracefully with different severity levels', () => {
    expect(() => serverSentry.captureMessage('Info test', 'info')).not.toThrow();
    expect(() => serverSentry.captureMessage('Warning test', 'warning')).not.toThrow();
    expect(() => serverSentry.captureMessage('Error test', 'error')).not.toThrow();
  });

  it('records breadcrumbs safely', () => {
    expect(() => serverSentry.addBreadcrumb({ message: 'User joined room', category: 'room' })).not.toThrow();
  });
});
