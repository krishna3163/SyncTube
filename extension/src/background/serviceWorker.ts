import type { ExtensionPartyState } from '../types.js';

let partyState: ExtensionPartyState = {
  connected: false,
  roomId: null,
  isHost: false,
  userId: null,
  serverUrl: 'https://youtube-watch-party-api-buaf.onrender.com',
  readiness: 'not_connected',
};

// Restore state from storage if available
if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  chrome.storage.local.get(['partyState'], (res) => {
    if (res.partyState) {
      partyState = { ...partyState, ...res.partyState };
    }
  });
}

function persistState() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ partyState });
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return false;

    switch (message.type) {
      case 'GET_PARTY_STATE': {
        sendResponse({ success: true, partyState });
        break;
      }
      case 'SET_PARTY_STATE': {
        partyState = { ...partyState, ...message.data };
        persistState();
        sendResponse({ success: true, partyState });
        break;
      }
      case 'DISCONNECT_PARTY': {
        partyState.connected = false;
        partyState.roomId = null;
        partyState.readiness = 'not_connected';
        persistState();
        sendResponse({ success: true, partyState });
        break;
      }
      case 'RELAY_COMMAND_TO_TAB': {
        if (typeof chrome.tabs?.query !== 'undefined') {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab?.id) {
              chrome.tabs.sendMessage(activeTab.id, message.command, (response) => {
                sendResponse(response || { success: false });
              });
            } else {
              sendResponse({ success: false, error: 'No active tab found' });
            }
          });
          return true;
        }
        break;
      }
      default:
        break;
    }

    return true;
  });
}
