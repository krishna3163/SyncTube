import type { Server } from 'socket.io';
import type { Room } from '../models/Room.js';
import { tempBrowserManager } from './tempBrowserManager.js';

interface RoomSubscription {
  sessionId: string;
  removeListeners: () => void;
}

class RoomBrowserStreamService {
  private subscriptions = new Map<string, RoomSubscription>();

  /**
   * Binds an active Temporary Browser session to a SyncTube room so all participants
   * receive live composited screencast frames and synchronized navigations.
   */
  public startStreaming(
    io: Server,
    room: Room,
    sessionId: string,
    sessionToken: string,
    guestControl: boolean = false
  ): { success: boolean; error?: string } {
    if (!tempBrowserManager.verifyToken(sessionId, sessionToken)) {
      return { success: false, error: 'Unauthorized: Invalid browser session token.' };
    }

    const session = tempBrowserManager.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Temporary browser session not found or already closed.' };
    }

    // Clean up any existing stream on this room
    this.stopStreaming(io, room, 'replaced_by_new_stream');

    room.attachBrowserSession(sessionId, sessionToken, guestControl);

    const onFrame = (frameData: any) => {
      io.to(room.id).emit('room:browser_frame', frameData);
    };

    const onNav = (navData: any) => {
      io.to(room.id).emit('room:browser_navigated', navData);
    };

    const onClosed = () => {
      room.detachBrowserSession();
      this.subscriptions.delete(room.id);
      io.to(room.id).emit('room:browser_stream_stopped', { reason: 'session_closed' });
      io.to(room.id).emit('sync_state', room.toSyncStatePayload());
    };

    session.emitter.on('frame', onFrame);
    session.emitter.on('navigation', onNav);
    session.emitter.on('closed', onClosed);

    this.subscriptions.set(room.id, {
      sessionId,
      removeListeners: () => {
        session.emitter.off('frame', onFrame);
        session.emitter.off('navigation', onNav);
        session.emitter.off('closed', onClosed);
      },
    });

    const syncPayload = room.toSyncStatePayload();
    io.to(room.id).emit('sync_state', syncPayload);
    io.to(room.id).emit('room:browser_stream_started', {
      sessionId,
      currentUrl: session.currentUrl,
      currentTitle: session.currentTitle,
      guestControl: room.browserGuestControl,
    });
    io.to(room.id).emit('media_changed', {
      platform: 'temp_browser',
      mediaId: `tb:${sessionId}`,
      title: session.currentTitle || 'Temporary Browser Cinema Stream',
      url: session.currentUrl,
    });

    console.log(`[RoomBrowserStream] Session ${sessionId} attached and streaming to Room ${room.id}`);
    return { success: true };
  }

  /**
   * Stops streaming the temporary browser into the room and detaches the session.
   */
  public stopStreaming(io: Server, room: Room, reason: string = 'stopped_by_host'): void {
    const sub = this.subscriptions.get(room.id);
    if (sub) {
      sub.removeListeners();
      this.subscriptions.delete(room.id);
    }

    if (room.browserSessionId) {
      room.detachBrowserSession();
      io.to(room.id).emit('room:browser_stream_stopped', { reason });
      io.to(room.id).emit('sync_state', room.toSyncStatePayload());
      console.log(`[RoomBrowserStream] Stream stopped for Room ${room.id} (${reason})`);
    }
  }

  /**
   * Grants or revokes co-browsing guest control for room participants.
   */
  public setGuestControl(io: Server, room: Room, guestControl: boolean): void {
    room.browserGuestControl = guestControl;
    io.to(room.id).emit('room:browser_guest_control_changed', { guestControl });
    io.to(room.id).emit('sync_state', room.toSyncStatePayload());
  }

  /**
   * Dispatches interactive inputs (click, scroll, keystroke, navigate) to the temporary browser.
   */
  public dispatchInput(room: Room, input: any): void {
    const sId = room.browserSessionId;
    if (!sId) return;

    const { action, x, y, button, clickCount, deltaX, deltaY, key, url } = input;
    switch (action) {
      case 'click':
        if (x !== undefined && y !== undefined) {
          tempBrowserManager.dispatchClick(sId, x, y, button || 'left', clickCount || 1);
        }
        break;
      case 'mouse_move':
        if (x !== undefined && y !== undefined) {
          tempBrowserManager.dispatchMouseMove(sId, x, y);
        }
        break;
      case 'mouse_down':
        if (x !== undefined && y !== undefined) {
          tempBrowserManager.dispatchMouseDown(sId, x, y, button || 'left');
        }
        break;
      case 'mouse_up':
        if (x !== undefined && y !== undefined) {
          tempBrowserManager.dispatchMouseUp(sId, x, y, button || 'left');
        }
        break;
      case 'wheel':
        if (deltaX !== undefined && deltaY !== undefined) {
          tempBrowserManager.dispatchWheel(sId, deltaX, deltaY);
        }
        break;
      case 'key_down':
        if (key) tempBrowserManager.dispatchKeyDown(sId, key);
        break;
      case 'key_up':
        if (key) tempBrowserManager.dispatchKeyUp(sId, key);
        break;
      case 'key_press':
        if (key) tempBrowserManager.dispatchKeyPress(sId, key);
        break;
      case 'navigate':
        if (url) {
          tempBrowserManager.navigate(sId, url).catch(() => {});
        }
        break;
      case 'back':
        tempBrowserManager.goBack(sId);
        break;
      case 'forward':
        tempBrowserManager.goForward(sId);
        break;
      case 'reload':
        tempBrowserManager.reload(sId);
        break;
    }
  }
}

export const roomBrowserStreamService = new RoomBrowserStreamService();
