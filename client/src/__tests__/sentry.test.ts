import { describe, it, expect } from 'vitest';
import { clientSentry } from '../services/sentry.js';

describe('Sentry Client Service', () => {
  it('handles client-side exceptions without throwing', () => {
    const error = new Error('React render test error');
    expect(() => clientSentry.captureException(error, { component: 'Stage' })).not.toThrow();
  });

  it('handles client messages without crashing', () => {
    expect(() => clientSentry.captureMessage('WebSocket connected', 'info')).not.toThrow();
    expect(() => clientSentry.captureMessage('Sync delay warning', 'warning')).not.toThrow();
  });

  it('records client breadcrumbs', () => {
    expect(() => clientSentry.addBreadcrumb({ message: 'Clicked play', category: 'ui' })).not.toThrow();
  });
});
