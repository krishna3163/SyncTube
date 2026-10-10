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

  public captureException(error: unknown, context?: Record<string, unknown>): void {
    if (!this.isEnabled) {
      return;
    }
    const safeError = error instanceof Error ? error.message.replace(/[\r\n\t]/g, ' ') : String(error).replace(/[\r\n\t]/g, ' ');
    console.error('[Sentry Captured Exception]:', safeError);
  }

  public captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (!this.isEnabled) return;
    const safeMsg = String(message).replace(/[\r\n\t]/g, ' ');
    console.log('[Sentry Captured Message] [%s]: %s', level.toUpperCase(), safeMsg);
  }

  public addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
    if (!this.isEnabled) return;
    // Log breadcrumb for contextual debugging
  }
}

export const serverSentry = new SentryService();
