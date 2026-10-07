import { AdapterRegistry } from '../adapters/registry.js';
import type { PlaybackEvent } from '../types.js';

const registry = new AdapterRegistry();
const adapter = registry.getAdapterForUrl(window.location.href);

if (adapter) {
  console.log(`[SyncTube] Activated ${adapter.platformId} adapter on ${window.location.href}`);

  adapter.subscribeToEvents((event: PlaybackEvent) => {
    // Send event to extension background / runtime
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'SYNC_MEDIA_EVENT',
          platformId: adapter.platformId,
          event,
        });
      }
    } catch {
      // Background worker might be sleeping
    }
  });

  // Listen for control commands from SyncTube extension popup or background
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || !message.action) return false;

      (async () => {
        try {
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
            default:
              sendResponse({ success: false, error: 'Unknown action' });
          }
        } catch (err: any) {
          sendResponse({ success: false, error: err.message });
        }
      })();

      return true; // Keep channel open for async response
    });
  }
}
