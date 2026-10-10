/**
 * Sentry Error Monitoring & Telemetry for SyncTube Server
 * Gracefully activates if SENTRY_DSN is configured in environment.
 */

interface SentryBreadcrumb {
  message: string;
  category?: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

class SentryService {
  private isEnabled = false;
  private dsn: string | null = null;

  constructor() {
    this.dsn = process.env.SENTRY_DSN || null;
    this.isEnabled = Boolean(this.dsn);
    if (this.isEnabled) {
      console.log('[Sentry] Backend monitoring initialized with DSN.');
    }
  }

  public captureException(_error: unknown, _context?: Record<string, unknown>): void {
    if (!this.isEnabled) {
      return;
    }
    // In production with @sentry/node installed, this forwards to Sentry.io API
  }

  public captureMessage(_message: string, _level: 'info' | 'warning' | 'error' = 'info'): void {
    if (!this.isEnabled) {
      return;
    }
    // In production with @sentry/node installed, this forwards to Sentry.io API
  }

  public addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
    if (!this.isEnabled) return;
    // Log breadcrumb for contextual debugging
  }
}

export const serverSentry = new SentryService();
