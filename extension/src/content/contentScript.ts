import { AdapterRegistry } from '../adapters/registry.js';
import type { PlaybackEvent } from '../types.js';

const registry = new AdapterRegistry();

function getAdapter() {
  return registry.getAdapterForUrl(window.location.href);
}

let currentAdapter = getAdapter();
let unsubscribeFromEvents: (() => void) | null = null;

function setupActiveAdapter() {
  if (unsubscribeFromEvents) {
    unsubscribeFromEvents();
    unsubscribeFromEvents = null;
  }

  currentAdapter = getAdapter();
  if (!currentAdapter) return;

  console.log(`[SyncTube] Activated ${currentAdapter.platformId} adapter on ${window.location.href}`);

  unsubscribeFromEvents = currentAdapter.subscribeToEvents((event: PlaybackEvent) => {
    // Send event to extension background / runtime
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SYNC_MEDIA_EVENT',
          platformId: currentAdapter?.platformId || 'generic',
          event,
        });
      }
    } catch {
      // Background worker might be idle
    }

    // Broadcast event to window for web page clients
    try {
      window.postMessage(
        {
          type: 'SYNCTUBE_TAB_EVENT',
          platformId: currentAdapter?.platformId || 'generic',
          event,
        },
        '*'
      );
    } catch {
      // ignore
    }
  });
}

// Initial setup
setupActiveAdapter();

// Track URL changes for Single Page Applications (YouTube, Netflix, Twitch)
let lastUrl = window.location.href;
function handlePossibleUrlChange() {
  const nowUrl = window.location.href;
  if (nowUrl !== lastUrl) {
    lastUrl = nowUrl;
    setupActiveAdapter();
  }
}

window.addEventListener('popstate', handlePossibleUrlChange);
window.addEventListener('yt-navigate-finish', handlePossibleUrlChange);
window.addEventListener('spfdone', handlePossibleUrlChange);
setInterval(handlePossibleUrlChange, 1000);

// Listen for control commands from SyncTube extension popup or background
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.action) return false;

    (async () => {
      try {
        const adapter = getAdapter();
        if (!adapter) {
          sendResponse({ success: false, error: 'No adapter matches this URL' });
          return;
        }

        switch (message.action) {
          case 'DETECT_MEDIA': {
            const media = await adapter.detectMedia();
            sendResponse({ success: true, media });
            break;
          }
          case 'GET_STATE': {
            const state = await adapter.getState();
            sendResponse({ success: true, state });
            break;
          }
          case 'PLAY': {
            await adapter.play();
            sendResponse({ success: true });
            break;
          }
          case 'PAUSE': {
            await adapter.pause();
            sendResponse({ success: true });
            break;
          }
          case 'SEEK': {
            if (typeof message.time === 'number') {
              await adapter.seek(message.time);
            }
            sendResponse({ success: true });
            break;
          }
          case 'SET_RATE': {
            if (typeof message.rate === 'number') {
              await adapter.setPlaybackRate(message.rate);
            }
            sendResponse({ success: true });
            break;
          }
          case 'START_TAB_SHARE': {
            window.postMessage(
              {
                type: 'SYNCTUBE_START_TAB_SHARE',
                tabTitle: message.tabTitle,
                roomId: message.roomId,
              },
              '*'
            );
            sendResponse({ success: true });
            break;
          }
          case 'STOP_TAB_SHARE': {
            window.postMessage(
              {
                type: 'SYNCTUBE_STOP_TAB_SHARE',
              },
              '*'
            );
            sendResponse({ success: true });
            break;
          }
          default:
            sendResponse({ success: false, error: 'Unknown action' });
        }
      } catch (err: any) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();

    return true; // Keep channel open for async response
  });
}

// Global detection bridge for web application (SyncTube client tab on localhost:5173 or web)
window.addEventListener('message', async (event) => {
  if (!event.data) return;

  if (event.data.type === 'SYNCTUBE_EXTENSION_PING' || event.data.type === 'SYNCTUBE_ROOM_ANNOUNCE') {
    if (event.data.roomId && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'SET_PARTY_STATE',
          data: { connected: true, roomId: event.data.roomId, readiness: 'ready' },
        });
      } catch {
        // background may be inactive
      }
    }

    const adapter = getAdapter();
    let media = null;
    try {
      if (adapter) media = await adapter.detectMedia();
    } catch {
      // ignore
    }
    window.postMessage(
      {
        type: 'SYNCTUBE_EXTENSION_PONG',
        version: '2.0.0',
        platformId: adapter ? adapter.platformId : null,
        media,
      },
      '*'
    );
  }

  if (event.data.type === 'SYNCTUBE_CONTROL_MEDIA') {
    const adapter = getAdapter();
    if (adapter) {
      const { action, time, rate } = event.data;
      if (action === 'PLAY') adapter.play();
      else if (action === 'PAUSE') adapter.pause();
      else if (action === 'SEEK' && typeof time === 'number') adapter.seek(time);
      else if (action === 'SET_RATE' && typeof rate === 'number') adapter.setPlaybackRate(rate);
    }
  }
});
