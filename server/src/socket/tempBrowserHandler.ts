import type { Server, Socket } from 'socket.io';
import { tempBrowserManager } from '../services/tempBrowserManager.js';
import type { RoomManager } from '../models/RoomManager.js';
import { roomBrowserStreamService } from '../services/roomBrowserStreamService.js';

export function setupTempBrowserSocketHandlers(io: Server, roomManager?: RoomManager): void {
  io.on('connection', (socket: Socket) => {
    let currentSessionId: string | null = null;
    let removeListeners: (() => void) | null = null;

    socket.on('browser:join', ({ sessionId, sessionToken }: { sessionId: string; sessionToken: string }, callback) => {
      if (!sessionId || !sessionToken) {
        return callback?.({ success: false, error: 'Missing sessionId or sessionToken' });
      }

      if (!tempBrowserManager.verifyToken(sessionId, sessionToken)) {
        return callback?.({ success: false, error: 'Unauthorized: Invalid session token' });
      }

      const session = tempBrowserManager.getSession(sessionId);
      if (!session) {
        return callback?.({ success: false, error: 'Session not found or already closed' });
      }

      currentSessionId = sessionId;
      const room = `browser:${sessionId}`;
      socket.join(room);

      // Bind session frame, nav, download, and quality events
      const onFrame = (frameData: any) => {
        socket.emit('browser:frame', frameData);
      };

      const onNav = (navData: any) => {
        socket.emit('browser:navigated', navData);
      };

      const onDownload = (fileData: any) => {
        socket.emit('browser:download_added', fileData);
      };

      const onQuality = (qualityData: any) => {
        socket.emit('browser:quality_changed', qualityData);
      };

      const onMedia = (mediaData: any) => {
        socket.emit('browser:media_changed', mediaData);
      };

      const onClosed = () => {
        socket.emit('browser:closed');
        socket.leave(room);
      };

      session.emitter.on('frame', onFrame);
      session.emitter.on('navigation', onNav);
      session.emitter.on('download', onDownload);
      session.emitter.on('quality_changed', onQuality);
      session.emitter.on('media_toggles', onMedia);
      session.emitter.on('closed', onClosed);

      removeListeners = () => {
        session.emitter.off('frame', onFrame);
        session.emitter.off('navigation', onNav);
        session.emitter.off('download', onDownload);
        session.emitter.off('quality_changed', onQuality);
        session.emitter.off('media_toggles', onMedia);
        session.emitter.off('closed', onClosed);
      };

      callback?.({
        success: true,
        session: tempBrowserManager.getSessionPublicInfo(sessionId),
      });
    });

    const verify = (sessionId: string, sessionToken: string): boolean => {
      if (!sessionId || !sessionToken) return false;
      return tempBrowserManager.verifyToken(sessionId, sessionToken);
    };

    socket.on('browser:mouse_move', ({ sessionId, sessionToken, x, y }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.dispatchMouseMove(sessionId, x, y);
      }
    });

    socket.on('browser:mouse_down', ({ sessionId, sessionToken, x, y, button }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.dispatchMouseDown(sessionId, x, y, button);
      }
    });

    socket.on('browser:mouse_up', ({ sessionId, sessionToken, x, y, button }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.dispatchMouseUp(sessionId, x, y, button);
      }
    });

    socket.on('browser:click', ({ sessionId, sessionToken, x, y, button, clickCount }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.dispatchClick(sessionId, x, y, button, clickCount);
      }
    });

    socket.on('browser:wheel', ({ sessionId, sessionToken, deltaX, deltaY }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.dispatchWheel(sessionId, deltaX, deltaY);
      }
    });

    socket.on('browser:key_down', ({ sessionId, sessionToken, key }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.dispatchKeyDown(sessionId, key);
      }
    });

    socket.on('browser:key_up', ({ sessionId, sessionToken, key }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.dispatchKeyUp(sessionId, key);
      }
    });

    socket.on('browser:key_press', ({ sessionId, sessionToken, key }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.dispatchKeyPress(sessionId, key);
      }
    });

    socket.on('browser:resize', ({ sessionId, sessionToken, width, height }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.dispatchResize(sessionId, width, height);
      }
    });

    socket.on('browser:set_quality', ({ sessionId, sessionToken, quality, fps }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.setStreamingQuality(sessionId, quality, fps);
      }
    });

    socket.on('browser:set_media', ({ sessionId, sessionToken, sound, mic, webcam }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.setMediaToggles(sessionId, { sound, mic, webcam });
      }
    });

    socket.on('browser:clipboard_send', async ({ sessionId, sessionToken, text }, callback) => {
      if (!verify(sessionId, sessionToken)) {
        return callback?.({ success: false, error: 'Unauthorized' });
      }
      const ok = await tempBrowserManager.setRemoteClipboard(sessionId, text || '');
      callback?.({ success: ok });
    });

    socket.on('browser:clipboard_read', async ({ sessionId, sessionToken }, callback) => {
      if (!verify(sessionId, sessionToken)) {
        return callback?.({ success: false, error: 'Unauthorized' });
      }
      const text = await tempBrowserManager.getRemoteClipboard(sessionId);
      callback?.({ success: true, text });
    });

    socket.on('browser:print_pdf', async ({ sessionId, sessionToken }, callback) => {
      if (!verify(sessionId, sessionToken)) {
        return callback?.({ success: false, error: 'Unauthorized' });
      }
      try {
        const result = await tempBrowserManager.printToPdf(sessionId);
        callback?.({ success: true, data: result.data, filename: result.filename });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || 'Print to PDF failed' });
      }
    });

    socket.on('browser:get_downloads', ({ sessionId, sessionToken }, callback) => {
      if (!verify(sessionId, sessionToken)) {
        return callback?.({ success: false, error: 'Unauthorized' });
      }
      const files = tempBrowserManager.getDownloadedFiles(sessionId);
      callback?.({ success: true, files });
    });

    socket.on('browser:set_user_agent', async ({ sessionId, sessionToken, userAgent }, callback) => {
      if (!verify(sessionId, sessionToken)) {
        return callback?.({ success: false, error: 'Unauthorized' });
      }
      await tempBrowserManager.setUserAgent(sessionId, userAgent);
      callback?.({ success: true });
    });

    socket.on('browser:ping', ({ timestamp }, callback) => {
      callback?.({ pong: true, clientTime: timestamp, serverTime: Date.now() });
    });

    socket.on('browser:navigate', async ({ sessionId, sessionToken, url }, callback) => {
      if (!verify(sessionId, sessionToken)) {
        return callback?.({ success: false, error: 'Unauthorized' });
      }
      try {
        const info = await tempBrowserManager.navigate(sessionId, url);
        callback?.({ success: true, session: info });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || String(err) });
      }
    });

    socket.on('browser:back', ({ sessionId, sessionToken }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.goBack(sessionId);
      }
    });

    socket.on('browser:forward', ({ sessionId, sessionToken }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.goForward(sessionId);
      }
    });

    socket.on('browser:reload', ({ sessionId, sessionToken }) => {
      if (verify(sessionId, sessionToken)) {
        tempBrowserManager.reload(sessionId);
      }
    });

    socket.on('browser:cast_to_room', ({ sessionId, sessionToken, roomId, guestControl }: { sessionId: string; sessionToken: string; roomId: string; guestControl?: boolean }, callback) => {
      if (!verify(sessionId, sessionToken)) {
        return callback?.({ success: false, error: 'Unauthorized: Invalid session token' });
      }

      if (!roomManager || !roomId) {
        return callback?.({ success: false, error: 'Room ID is required to cast stream.' });
      }

      const normalizedRoomId = roomId.trim().toUpperCase();
      const room = roomManager.getRoom(normalizedRoomId);
      if (!room) {
        return callback?.({ success: false, error: `Room "${normalizedRoomId}" not found.` });
      }

      const res = roomBrowserStreamService.startStreaming(io, room, sessionId, sessionToken, !!guestControl);
      if (!res.success) {
        return callback?.({ success: false, error: res.error });
      }

      callback?.({ success: true, roomId: normalizedRoomId });
    });

    socket.on('browser:stop_cast', ({ sessionId, sessionToken, roomId }: { sessionId: string; sessionToken: string; roomId: string }, callback) => {
      if (!verify(sessionId, sessionToken)) {
        return callback?.({ success: false, error: 'Unauthorized: Invalid session token' });
      }
      if (roomManager && roomId) {
        const room = roomManager.getRoom(roomId.trim().toUpperCase());
        if (room) {
          roomBrowserStreamService.stopStreaming(io, room, 'cast_stopped_from_browser');
        }
      }
      callback?.({ success: true });
    });

    socket.on('disconnect', () => {
      if (removeListeners) {
        removeListeners();
        removeListeners = null;
      }
    });
  });
}
