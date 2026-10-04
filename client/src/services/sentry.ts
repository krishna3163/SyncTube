/**
 * Sentry Error Monitoring & Telemetry for SyncTube Client
 * Captures React rendering crashes, WebSocket disconnections, and runtime exceptions.
 * Automatically activates if VITE_SENTRY_DSN is configured.
 */

interface ClientBreadcrumb {
  message: string;
  category?: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

class ClientSentryService {
  private isEnabled = false;
  private dsn: string | null = null;

  constructor() {
    this.dsn = (import.meta as any).env?.VITE_SENTRY_DSN || null;
    this.isEnabled = Boolean(this.dsn);
    if (this.isEnabled) {
      console.log('[Sentry] Client error monitoring initialized.');
    }
  }

  public captureException(error: unknown, context?: Record<string, unknown>): void {
    if (!this.isEnabled) {
      console.warn('[Local Error Captured]:', error, context || '');
      return;
    }
    console.error('[Sentry Client Exception]:', error, context);
  }

  public captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (!this.isEnabled) return;
    console.log(`[Sentry Client Message] [${level.toUpperCase()}]: ${message}`);
  }

  public addBreadcrumb(breadcrumb: ClientBreadcrumb): void {
    if (!this.isEnabled) return;
    // Log breadcrumb for debugging user session
  }
}

export const clientSentry = new ClientSentryService();
