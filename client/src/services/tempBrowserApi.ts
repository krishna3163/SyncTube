import { io, Socket } from 'socket.io-client';
import { getApiUrl } from '../pages/HomePage.js';

export interface DownloadedFileInfo {
  id: string;
  name: string;
  size: number;
  date: number;
}

export interface SessionInfo {
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

export interface CreateSessionResponse {
  success: boolean;
  session?: SessionInfo;
  token?: string;
  error?: string;
}

export async function createBrowserSession(
  initialUrl?: string,
  viewport?: { width: number; height: number }
): Promise<{ session: SessionInfo; token: string }> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initialUrl, viewport }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to start temporary browser session.');
  }

  return { session: data.session, token: data.token };
}

export async function getBrowserSession(sessionId: string, token: string): Promise<SessionInfo> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch session status.');
  }

  return data.session;
}

export async function navigateBrowserSession(sessionId: string, token: string, url: string): Promise<SessionInfo> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/navigate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Navigation request failed.');
  }

  return data.session;
}

export async function deleteBrowserSession(sessionId: string, token: string): Promise<void> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete session.');
  }
}

export async function printBrowserPdf(
  sessionId: string,
  token: string
): Promise<{ data: string; filename: string }> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/print`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Print to PDF failed.');
  }

  return { data: data.data, filename: data.filename };
}

export async function getBrowserDownloads(
  sessionId: string,
  token: string
): Promise<DownloadedFileInfo[]> {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/sessions/${sessionId}/downloads`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to load session downloads.');
  }

  return data.files || [];
}

export function getDownloadFileUrl(sessionId: string, token: string, filename: string): string {
  const apiUrl = getApiUrl();
  return `${apiUrl}/api/sessions/${sessionId}/downloads/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`;
}

export function connectBrowserSocket(
  sessionId: string,
  sessionToken: string,
  callbacks: {
    onFrame: (frame: { data: string; timestamp: number; width: number; height: number }) => void;
    onNavigated: (nav: { url: string; title: string; isLoading: boolean; canGoBack: boolean; canGoForward: boolean }) => void;
    onClosed: () => void;
    onDownloadAdded?: (file: DownloadedFileInfo) => void;
    onQualityChanged?: (quality: { quality: number; maxFps: number }) => void;
    onMediaChanged?: (media: { soundEnabled: boolean; micEnabled: boolean; webcamEnabled: boolean }) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
  }
): Socket {
  const apiUrl = getApiUrl();
  const socket = io(apiUrl, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
  });

  socket.on('connect', () => {
    callbacks.onConnect?.();
    socket.emit('browser:join', { sessionId, sessionToken }, (res: any) => {
      if (!res?.success) {
        console.error('Failed to join browser session room:', res?.error);
      }
    });
  });

  socket.on('browser:frame', callbacks.onFrame);
  socket.on('browser:navigated', callbacks.onNavigated);
  socket.on('browser:closed', callbacks.onClosed);

  if (callbacks.onDownloadAdded) {
    socket.on('browser:download_added', callbacks.onDownloadAdded);
  }
  if (callbacks.onQualityChanged) {
    socket.on('browser:quality_changed', callbacks.onQualityChanged);
  }
  if (callbacks.onMediaChanged) {
    socket.on('browser:media_changed', callbacks.onMediaChanged);
  }

  socket.on('disconnect', () => {
    callbacks.onDisconnect?.();
  });

  return socket;
}
