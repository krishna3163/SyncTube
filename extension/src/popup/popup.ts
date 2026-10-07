function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const platformTag = document.getElementById('platformTag');
  const mediaTitle = document.getElementById('mediaTitle');
  const mediaTime = document.getElementById('mediaTime');
  const mediaDuration = document.getElementById('mediaDuration');
  const roomCodeBadge = document.getElementById('roomCodeBadge');
  const roomCodeInput = document.getElementById('roomCodeInput') as HTMLInputElement;
  const joinBtn = document.getElementById('joinBtn');
  const detectBtn = document.getElementById('detectBtn');
  const joinSection = document.getElementById('joinSection');
  const connectedSection = document.getElementById('connectedSection');
  const readyToggleBtn = document.getElementById('readyToggleBtn');
  const leaveBtn = document.getElementById('leaveBtn');

  let currentPartyState: any = null;

  async function updatePartyUI() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

    chrome.runtime.sendMessage({ type: 'GET_PARTY_STATE' }, (res) => {
      if (!res?.partyState) return;
      currentPartyState = res.partyState;

      if (currentPartyState.connected && currentPartyState.roomId) {
        statusIndicator?.classList.add('connected');
        if (statusText) statusText.textContent = 'Party Active';
        if (roomCodeBadge) roomCodeBadge.textContent = currentPartyState.roomId;
        joinSection?.classList.add('hidden');
        connectedSection?.classList.remove('hidden');

        if (readyToggleBtn) {
          readyToggleBtn.textContent =
            currentPartyState.readiness === 'ready' ? '🟢 Ready' : '🟡 Buffering / Not Ready';
        }
      } else {
        statusIndicator?.classList.remove('connected');
        if (statusText) statusText.textContent = 'Disconnected';
        if (roomCodeBadge) roomCodeBadge.textContent = 'None';
        joinSection?.classList.remove('hidden');
        connectedSection?.classList.add('hidden');
      }
    });
  }

  async function checkActiveTabMedia() {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;

      chrome.tabs.sendMessage(activeTab.id, { action: 'GET_STATE' }, (response) => {
        if (chrome.runtime.lastError || !response?.success || !response.state) {
          if (platformTag) platformTag.textContent = 'None';
          if (mediaTitle) mediaTitle.textContent = 'No media detected on this tab';
          return;
        }

        const { state } = response;
        if (state.mediaIdentity) {
          if (platformTag) platformTag.textContent = state.mediaIdentity.platform.toUpperCase();
          if (mediaTitle) mediaTitle.textContent = state.mediaIdentity.title || 'Playing Stream';
        }
        if (mediaTime) mediaTime.textContent = formatTime(state.currentTime);
        if (mediaDuration) mediaDuration.textContent = formatTime(state.duration);
      });
    });
  }

  joinBtn?.addEventListener('click', () => {
    const code = roomCodeInput?.value.trim().toUpperCase();
    if (!code || code.length < 4) return;

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        {
          type: 'SET_PARTY_STATE',
          data: { connected: true, roomId: code, readiness: 'ready' },
        },
        () => {
          updatePartyUI();
        }
      );
    }
  });

  leaveBtn?.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'DISCONNECT_PARTY' }, () => {
        updatePartyUI();
      });
    }
  });

  readyToggleBtn?.addEventListener('click', () => {
    if (!currentPartyState) return;
    const nextStatus = currentPartyState.readiness === 'ready' ? 'loading' : 'ready';
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        {
          type: 'SET_PARTY_STATE',
          data: { readiness: nextStatus },
        },
        () => {
          updatePartyUI();
        }
      );
    }
  });

  detectBtn?.addEventListener('click', () => {
    checkActiveTabMedia();
  });

  await updatePartyUI();
  await checkActiveTabMedia();
});
