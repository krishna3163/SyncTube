import { chromium, type Browser, type BrowserContext, type Page, type CDPSession } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { validateSafeUrl } from '../utils/ssrfValidator.js';

export interface DownloadedFileInfo {
  id: string;
  name: string;
  size: number;
  date: number;
}

export interface TempBrowserSession {
  id: string;
  token: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  cdp: CDPSession | null;
  tempDir: string;
  currentUrl: string;
  currentTitle: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewport: { width: number; height: number };
  streamingQuality: { quality: number; maxFps: number };
  soundEnabled: boolean;
  micEnabled: boolean;
  webcamEnabled: boolean;
  userAgent: string;
  downloadedFiles: DownloadedFileInfo[];
  clipboardHistory: string[];
  emitter: EventEmitter;
  isClosed: boolean;
}

export interface SessionPublicInfo {
  id: string;
  createdAt: number;
  expiresAt: number;
  currentUrl: string;
  currentTitle: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  viewport: { width: number; height: number };
  streamingQuality?: { quality: number; maxFps: number };
  soundEnabled?: boolean;
  micEnabled?: boolean;
  webcamEnabled?: boolean;
  userAgent?: string;
  downloadsCount?: number;
}

function findChromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }
  const candidates = [
    '/home/krishna/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    '/home/krishna/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/sbin/google-chrome',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export class TempBrowserManager {
  private sessions = new Map<string, TempBrowserSession>();
  private maxSessions = parseInt(process.env.MAX_CONCURRENT_BROWSER_SESSIONS || '5', 10);
  private sessionTtlMs = 15 * 60 * 1000; // 15 minutes max lifetime
  private inactivityTtlMs = 8 * 60 * 1000; // 8 minutes idle timeout
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    // Background sweep every 30 seconds for expired or inactive sessions
    this.cleanupTimer = setInterval(() => {
      this.sweepExpiredSessions();
    }, 30 * 1000);
    this.cleanupTimer.unref();
  }

  public getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Spawns a fresh, isolated temporary browser session.
   */
  public async createSession(initialUrl = 'https://duckduckgo.com', viewport = { width: 1280, height: 800 }): Promise<{
    session: SessionPublicInfo;
    token: string;
  }> {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Server resource limit reached: maximum of ${this.maxSessions} temporary browser sessions can run simultaneously.`);
    }

    // SSRF Check on initial URL
    const urlCheck = await validateSafeUrl(initialUrl);
    if (!urlCheck.safe) {
      throw new Error(urlCheck.error || 'Initial navigation URL is not allowed.');
    }
    const targetUrl = urlCheck.normalizedUrl!;

    const sessionId = crypto.randomUUID();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `synctube-tb-${sessionId}-`));
    const downloadsDir = path.join(tempDir, 'downloads');
    fs.mkdirSync(downloadsDir, { recursive: true });
    const now = Date.now();

    const emitter = new EventEmitter();
    emitter.setMaxListeners(50);

    const defaultUa = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SyncTube/2.0';

    const session: TempBrowserSession = {
      id: sessionId,
      token: sessionToken,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + this.sessionTtlMs,
      browser: null,
      context: null,
      page: null,
      cdp: null,
      tempDir,
      currentUrl: targetUrl,
      currentTitle: 'New Session',
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      viewport,
      streamingQuality: { quality: 70, maxFps: 30 },
      soundEnabled: true,
      micEnabled: false,
      webcamEnabled: false,
      userAgent: defaultUa,
      downloadedFiles: [],
      clipboardHistory: [],
      emitter,
      isClosed: false,
    };

    this.sessions.set(sessionId, session);

    try {
      const execPath = findChromiumPath();
      console.log(`[TempBrowser] Launching browser for session ${sessionId} (execPath: ${execPath || 'default'})...`);

      const browser = await chromium.launch({
        executablePath: execPath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--hide-scrollbars',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-extensions',
        ],
      });

      session.browser = browser;

      const context = await browser.newContext({
        viewport,
        userAgent: defaultUa,
        locale: 'en-US',
        timezoneId: 'UTC',
        acceptDownloads: true,
      });
      session.context = context;

      try {
        await context.grantPermissions(['clipboard-read', 'clipboard-write', 'camera', 'microphone']);
      } catch {
        // non-fatal if permissions grant fails in headless
      }

      const page = await context.newPage();
      session.page = page;

      // In-flight network firewall: blocks subresource SSRF, private IPs, and dangerous non-HTTP ports
      await page.route('**/*', async (route) => {
        try {
          const reqUrl = route.request().url();
          if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:') || reqUrl.startsWith('about:')) {
            return route.continue();
          }

          const parsed = new URL(reqUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return route.abort('blockedbyclient');
          }

          const DANGEROUS_PORTS = new Set([
            21, 22, 23, 25, 53, 69, 110, 135, 137, 138, 139, 143, 389, 445, 1433,
            1521, 2049, 3306, 3389, 5432, 5900, 6379, 8000, 9200, 10000, 11211, 27017
          ]);
          const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
          if (DANGEROUS_PORTS.has(port)) {
            return route.abort('blockedbyclient');
          }

          const host = parsed.hostname.toLowerCase();
          if (
            host === 'localhost' ||
            host.endsWith('.localhost') ||
            host === '127.0.0.1' ||
            host === '0.0.0.0' ||
            host === '::1' ||
            host === '169.254.169.254' ||
            host.startsWith('10.') ||
            host.startsWith('192.168.') ||
            host.endsWith('.internal') ||
            host.endsWith('.local')
          ) {
            return route.abort('blockedbyclient');
          }

          return route.continue();
        } catch {
          return route.abort('blockedbyclient');
        }
      });

      // Listen for browser file downloads
      page.on('download', async (download) => {
        try {
          const filename = download.suggestedFilename() || `file-${Date.now()}`;
          const savePath = path.join(downloadsDir, filename);
          await download.saveAs(savePath);
          const stats = fs.statSync(savePath);
          const fileInfo: DownloadedFileInfo = {
            id: crypto.randomUUID(),
            name: filename,
            size: stats.size,
            date: Date.now(),
          };
          session.downloadedFiles.unshift(fileInfo);
          session.emitter.emit('download', fileInfo);
          console.log(`[TempBrowser] Download completed for session ${sessionId}: ${filename} (${stats.size} bytes)`);
        } catch (dlErr) {
          console.warn(`[TempBrowser] Download error in session ${sessionId}:`, dlErr);
        }
      });

      // Attach CDP session for live composited screencasting
      const cdp = await context.newCDPSession(page);
      session.cdp = cdp;

      cdp.on('Page.screencastFrame', async ({ data, sessionId: frameSessionId, metadata }) => {
        try {
          if (!session.isClosed && session.cdp) {
            await cdp.send('Page.screencastFrameAck', { sessionId: frameSessionId });
            session.emitter.emit('frame', {
              data,
              timestamp: metadata?.timestamp || Date.now(),
              width: session.viewport.width,
              height: session.viewport.height,
            });
          }
        } catch {
          // Frame ack may fail if session closes concurrently
        }
      });

      // Start live JPEG screencast (70% quality balanced for real-time responsiveness)
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 70,
        maxWidth: viewport.width,
        maxHeight: viewport.height,
        everyNthFrame: 1,
      });

      // Hook navigation and title updates
      const updateNavState = async () => {
        if (session.isClosed || !session.page) return;
        try {
          session.currentUrl = session.page.url();
          session.currentTitle = (await session.page.title()) || session.currentUrl;
          session.emitter.emit('navigation', {
            url: session.currentUrl,
            title: session.currentTitle,
            isLoading: session.isLoading,
            canGoBack: session.canGoBack,
            canGoForward: session.canGoForward,
          });
        } catch {
          // ignore
        }
      };

      page.on('load', async () => {
        session.isLoading = false;
        await updateNavState();
      });

      page.on('domcontentloaded', async () => {
        await updateNavState();
      });

      page.on('framenavigated', async (frame) => {
        if (frame === page.mainFrame()) {
          session.lastActiveAt = Date.now();
          await updateNavState();
        }
      });

      page.on('crash', () => {
        console.error(`[TempBrowser] Session ${sessionId} page crashed.`);
        this.closeSession(sessionId);
      });

      page.on('close', () => {
        if (!session.isClosed) {
          this.closeSession(sessionId);
        }
      });

      // Initial navigation
      page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch((err) => {
        console.warn(`[TempBrowser] Initial page load warning for ${targetUrl}:`, err.message);
        session.isLoading = false;
        updateNavState();
      });

      return {
        session: this.toPublicInfo(session),
        token: sessionToken,
      };
    } catch (err: any) {
      console.error(`[TempBrowser] Failed to create session ${sessionId}:`, err);
      await this.closeSession(sessionId);
      throw new Error(`Failed to initialize temporary browser session: ${err?.message || String(err)}`);
    }
  }

  public getSession(sessionId: string): TempBrowserSession | null {
    const s = this.sessions.get(sessionId);
    if (!s || s.isClosed) return null;
    return s;
  }

  public verifyToken(sessionId: string, token: string): boolean {
    const s = this.sessions.get(sessionId);
    if (!s || s.isClosed) return false;
    return crypto.timingSafeEqual(Buffer.from(s.token), Buffer.from(token));
  }

  public getSessionPublicInfo(sessionId: string): SessionPublicInfo | null {
    const s = this.getSession(sessionId);
    if (!s) return null;
    return this.toPublicInfo(s);
  }

  /**
   * Navigates the browser to a user-supplied URL with strict SSRF validation.
   */
  public async navigate(sessionId: string, rawUrl: string): Promise<SessionPublicInfo> {
    const session = this.getSession(sessionId);
    if (!session || !session.page) {
      throw new Error('Session not found or already closed.');
    }

    const check = await validateSafeUrl(rawUrl);
    if (!check.safe) {
      throw new Error(check.error || 'Blocked by security policy.');
    }

    const targetUrl = check.normalizedUrl!;
    session.isLoading = true;
    session.lastActiveAt = Date.now();

    session.emitter.emit('navigation', {
      url: targetUrl,
      title: 'Loading...',
      isLoading: true,
      canGoBack: session.canGoBack,
      canGoForward: session.canGoForward,
    });

    try {
      await session.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      session.currentUrl = session.page.url();
      session.currentTitle = (await session.page.title()) || session.currentUrl;
      session.isLoading = false;
    } catch (err: any) {
      session.isLoading = false;
      session.currentTitle = 'Failed to load page';
      throw new Error(`Navigation failed: ${err?.message || String(err)}`);
    } finally {
      session.emitter.emit('navigation', {
        url: session.currentUrl,
        title: session.currentTitle,
        isLoading: false,
        canGoBack: session.canGoBack,
        canGoForward: session.canGoForward,
      });
    }

    return this.toPublicInfo(session);
  }

  public async goBack(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.goBack({ timeout: 15000 });
    } catch {
      // cannot go back
    }
  }

  public async goForward(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.goForward({ timeout: 15000 });
    } catch {
      // cannot go forward
    }
  }

  public async reload(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.reload({ timeout: 20000 });
    } catch {
      // reload failed
    }
  }

  // --- MOUSE & KEYBOARD INPUT DISPATCHING ---

  public async dispatchMouseMove(sessionId: string, x: number, y: number): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.mouse.move(x, y);
    } catch {
      // ignore input errors during navigation
    }
  }

  public async dispatchMouseDown(sessionId: string, x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.mouse.move(x, y);
      await session.page.mouse.down({ button });
    } catch {
      // ignore
    }
  }

  public async dispatchMouseUp(sessionId: string, x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.mouse.move(x, y);
      await session.page.mouse.up({ button });
    } catch {
      // ignore
    }
  }

  public async dispatchClick(sessionId: string, x: number, y: number, button: 'left' | 'right' | 'middle' = 'left', clickCount = 1): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.mouse.click(x, y, { button, clickCount });
    } catch {
      // ignore
    }
  }

  public async dispatchWheel(sessionId: string, deltaX: number, deltaY: number): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.mouse.wheel(deltaX, deltaY);
    } catch {
      // ignore
    }
  }

  public async dispatchKeyDown(sessionId: string, key: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.keyboard.down(key);
    } catch {
      // ignore
    }
  }

  public async dispatchKeyUp(sessionId: string, key: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.keyboard.up(key);
    } catch {
      // ignore
    }
  }

  public async dispatchKeyPress(sessionId: string, key: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page) return;
    session.lastActiveAt = Date.now();
    try {
      await session.page.keyboard.press(key);
    } catch {
      // ignore
    }
  }

  public async dispatchResize(sessionId: string, width: number, height: number): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.page || !session.cdp) return;
    session.lastActiveAt = Date.now();
    session.viewport = { width, height };
    try {
      await session.page.setViewportSize({ width, height });
      await session.cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 70,
        maxWidth: width,
        maxHeight: height,
        everyNthFrame: 1,
      });
    } catch {
      // ignore
    }
  }

  /**
   * Closes and permanently erases all session data, files, and processes.
   */
  public async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.isClosed = true;
    this.sessions.delete(sessionId);

    console.log(`[TempBrowser] Closing and securely cleaning session ${sessionId}...`);
    session.emitter.emit('closed', { sessionId });
    session.emitter.removeAllListeners();

    try {
      if (session.cdp) {
        await session.cdp.send('Page.stopScreencast').catch(() => {});
        await session.cdp.detach().catch(() => {});
      }
      if (session.page) {
        await session.page.close().catch(() => {});
      }
      if (session.context) {
        await session.context.close().catch(() => {});
      }
      if (session.browser) {
        await session.browser.close().catch(() => {});
      }
    } catch (err) {
      console.warn(`[TempBrowser] Warning during browser shutdown for ${sessionId}:`, err);
    }

    // Securely wipe isolated temporary directory
    if (session.tempDir && fs.existsSync(session.tempDir)) {
      try {
        fs.rmSync(session.tempDir, { recursive: true, force: true });
        console.log(`[TempBrowser] Wiped temp storage: ${session.tempDir}`);
      } catch (rmErr) {
        console.error(`[TempBrowser] Error wiping temp dir ${session.tempDir}:`, rmErr);
      }
    }
  }

  /**
   * Sweeps expired or inactive browser sessions.
   */
  private sweepExpiredSessions(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      const isExpired = now >= s.expiresAt;
      const isInactive = now - s.lastActiveAt >= this.inactivityTtlMs;
      if (isExpired || isInactive) {
        console.log(`[TempBrowser] Reaping session ${id} (expired: ${isExpired}, inactive: ${isInactive})`);
        this.closeSession(id);
      }
    }
  }

  public async setStreamingQuality(sessionId: string, quality: number, fps: number): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.cdp) return;
    session.lastActiveAt = Date.now();
    const cleanQuality = Math.max(20, Math.min(100, Math.round(quality)));
    const cleanFps = Math.max(10, Math.min(60, Math.round(fps)));
    session.streamingQuality = { quality: cleanQuality, maxFps: cleanFps };
    try {
      await session.cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: cleanQuality,
        maxWidth: session.viewport.width,
        maxHeight: session.viewport.height,
        everyNthFrame: cleanFps >= 45 ? 1 : cleanFps >= 25 ? 1 : 2,
      });
      session.emitter.emit('quality_changed', session.streamingQuality);
    } catch {
      // ignore
    }
  }

  public async printToPdf(sessionId: string): Promise<{ data: string; filename: string }> {
    const session = this.getSession(sessionId);
    if (!session?.cdp) throw new Error('Session not found or already closed');
    session.lastActiveAt = Date.now();

    const result = await session.cdp.send('Page.printToPDF', {
      printBackground: true,
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4,
    });

    const filename = `document-${Date.now()}.pdf`;
    const downloadDir = path.join(session.tempDir, 'downloads');
    fs.mkdirSync(downloadDir, { recursive: true });
    const buffer = Buffer.from(result.data, 'base64');
    fs.writeFileSync(path.join(downloadDir, filename), buffer);

    const fileInfo: DownloadedFileInfo = {
      id: crypto.randomUUID(),
      name: filename,
      size: buffer.length,
      date: Date.now(),
    };
    session.downloadedFiles.unshift(fileInfo);
    session.emitter.emit('download', fileInfo);

    return { data: result.data, filename };
  }

  public async setRemoteClipboard(sessionId: string, text: string): Promise<boolean> {
    const session = this.getSession(sessionId);
    if (!session?.page) return false;
    session.lastActiveAt = Date.now();
    try {
      await session.page.evaluate(async (txt) => {
        try {
          await navigator.clipboard.writeText(txt);
        } catch {
          const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
          if (active && 'value' in active) {
            const start = active.selectionStart ?? active.value.length;
            const end = active.selectionEnd ?? active.value.length;
            active.value = active.value.slice(0, start) + txt + active.value.slice(end);
          }
        }
      }, text);
      session.clipboardHistory.unshift(text);
      if (session.clipboardHistory.length > 20) session.clipboardHistory.pop();
      return true;
    } catch {
      return false;
    }
  }

  public async getRemoteClipboard(sessionId: string): Promise<string> {
    const session = this.getSession(sessionId);
    if (!session?.page) return '';
    session.lastActiveAt = Date.now();
    try {
      const text = await session.page.evaluate(() => {
        return window.getSelection()?.toString() || '';
      });
      return text;
    } catch {
      return '';
    }
  }

  public getDownloadedFiles(sessionId: string): DownloadedFileInfo[] {
    const session = this.getSession(sessionId);
    if (!session) return [];
    return session.downloadedFiles;
  }

  public getDownloadedFilePath(sessionId: string, filename: string): string | null {
    const session = this.getSession(sessionId);
    if (!session) return null;
    const safeName = path.basename(filename);
    const fullPath = path.join(session.tempDir, 'downloads', safeName);
    if (fs.existsSync(fullPath)) return fullPath;
    return null;
  }

  public async setUserAgent(sessionId: string, userAgent: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session?.cdp) return;
    session.lastActiveAt = Date.now();
    session.userAgent = userAgent;
    try {
      await session.cdp.send('Network.setUserAgentOverride', { userAgent });
    } catch {
      // ignore
    }
  }

  public setMediaToggles(sessionId: string, toggles: { sound?: boolean; mic?: boolean; webcam?: boolean }): void {
    const session = this.getSession(sessionId);
    if (!session) return;
    if (toggles.sound !== undefined) session.soundEnabled = toggles.sound;
    if (toggles.mic !== undefined) session.micEnabled = toggles.mic;
    if (toggles.webcam !== undefined) session.webcamEnabled = toggles.webcam;
    session.emitter.emit('media_toggles', {
      soundEnabled: session.soundEnabled,
      micEnabled: session.micEnabled,
      webcamEnabled: session.webcamEnabled,
    });
  }

  private toPublicInfo(s: TempBrowserSession): SessionPublicInfo {
    return {
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      currentUrl: s.currentUrl,
      currentTitle: s.currentTitle,
      isLoading: s.isLoading,
      canGoBack: s.canGoBack,
      canGoForward: s.canGoForward,
      viewport: s.viewport,
      streamingQuality: s.streamingQuality,
      soundEnabled: s.soundEnabled,
      micEnabled: s.micEnabled,
      webcamEnabled: s.webcamEnabled,
      userAgent: s.userAgent,
      downloadsCount: s.downloadedFiles.length,
    };
  }
}

export const tempBrowserManager = new TempBrowserManager();
