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
  const mediaStatus = document.getElementById('mediaStatus');
  const mediaControlsRow = document.getElementById('mediaControlsRow');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const seekBackBtn = document.getElementById('seekBackBtn');
  const seekFwdBtn = document.getElementById('seekFwdBtn');

  const roomCodeBadge = document.getElementById('roomCodeBadge');
  const roomCodeInput = document.getElementById('roomCodeInput') as HTMLInputElement;
  const joinBtn = document.getElementById('joinBtn');
  const detectBtn = document.getElementById('detectBtn');
  const joinSection = document.getElementById('joinSection');
  const connectedSection = document.getElementById('connectedSection');
  const readyToggleBtn = document.getElementById('readyToggleBtn');
  const openRoomBtn = document.getElementById('openRoomBtn');
  const leaveBtn = document.getElementById('leaveBtn');
  const webAppLink = document.getElementById('webAppLink') as HTMLAnchorElement;
  const tabSelect = document.getElementById('tabSelect') as HTMLSelectElement;
  const streamTabBtn = document.getElementById('streamTabBtn');
  const stopTabStreamBtn = document.getElementById('stopTabStreamBtn');
  const tabStreamBadge = document.getElementById('tabStreamBadge');

  let currentPartyState: any = null;
  let currentActiveTabId: number | null = null;
  let currentPlaybackState: any = null;

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

        if (webAppLink) {
          webAppLink.href = `http://localhost:5173/${currentPartyState.roomId}`;
          webAppLink.textContent = `Open Room ${currentPartyState.roomId} ↗`;
        }

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
        if (webAppLink) {
          webAppLink.href = 'http://localhost:5173';
          webAppLink.textContent = 'Open SyncTube Web App ↗';
        }
      }
    });
  }

  async function checkActiveTabMedia() {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;
      currentActiveTabId = activeTab.id;

      chrome.tabs.sendMessage(activeTab.id, { action: 'GET_STATE' }, (response) => {
        if (chrome.runtime.lastError || !response?.success || !response.state) {
          if (platformTag) platformTag.textContent = 'None';
          if (mediaTitle) mediaTitle.textContent = 'No media detected on this tab';
          if (mediaStatus) {
            mediaStatus.textContent = 'IDLE';
            mediaStatus.className = 'playback-status';
          }
          mediaControlsRow?.classList.add('hidden');
          return;
        }

        const { state } = response;
        currentPlaybackState = state;
        mediaControlsRow?.classList.remove('hidden');

        if (state.mediaIdentity) {
          if (platformTag) platformTag.textContent = state.mediaIdentity.platform.toUpperCase();
          if (mediaTitle) mediaTitle.textContent = state.mediaIdentity.title || 'Playing Stream';
        }

        if (mediaTime) mediaTime.textContent = formatTime(state.currentTime);
        if (mediaDuration) mediaDuration.textContent = formatTime(state.duration);

        const isPlaying = state.status === 'PLAYING';
        if (mediaStatus) {
          mediaStatus.textContent = state.status;
          mediaStatus.className = `playback-status ${isPlaying ? 'status-playing' : 'status-paused'}`;
        }

        if (playPauseBtn) {
          playPauseBtn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
        }
      });
    });
  }

  playPauseBtn?.addEventListener('click', () => {
    if (!currentActiveTabId || !currentPlaybackState) return;
    const isPlaying = currentPlaybackState.status === 'PLAYING';
    const nextAction = isPlaying ? 'PAUSE' : 'PLAY';

    chrome.tabs.sendMessage(currentActiveTabId, { action: nextAction }, () => {
      setTimeout(checkActiveTabMedia, 150);
    });
  });

  seekBackBtn?.addEventListener('click', () => {
    if (!currentActiveTabId || !currentPlaybackState) return;
    const cur = currentPlaybackState.currentTime || 0;
    const target = Math.max(0, cur - 10);
    chrome.tabs.sendMessage(currentActiveTabId, { action: 'SEEK', time: target }, () => {
      setTimeout(checkActiveTabMedia, 150);
    });
  });

  seekFwdBtn?.addEventListener('click', () => {
    if (!currentActiveTabId || !currentPlaybackState) return;
    const cur = currentPlaybackState.currentTime || 0;
    const target = cur + 10;
    chrome.tabs.sendMessage(currentActiveTabId, { action: 'SEEK', time: target }, () => {
      setTimeout(checkActiveTabMedia, 150);
    });
  });

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

  openRoomBtn?.addEventListener('click', () => {
    if (!currentPartyState?.roomId) return;
    const roomUrl = `http://localhost:5173/${currentPartyState.roomId}`;
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: roomUrl });
    } else {
      window.open(roomUrl, '_blank');
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

  async function populateTabsList() {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
    chrome.tabs.query({}, (tabs) => {
      if (!tabSelect) return;
      tabSelect.innerHTML = '';
      let added = 0;
      tabs.forEach((tab) => {
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return;
        const opt = document.createElement('option');
        opt.value = String(tab.id);
        const title = tab.title || tab.url;
        opt.textContent = title.length > 34 ? title.substring(0, 34) + '...' : title;
        if (tab.active) {
          opt.selected = true;
        }
        tabSelect.appendChild(opt);
        added++;
      });
      if (added === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No open web tabs found';
        tabSelect.appendChild(opt);
      }
    });
  }

  function triggerTabShareInRoom(roomId: string, tabTitle: string) {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;

    chrome.tabs.query({}, (allTabs) => {
      const roomTab = allTabs.find(
        (t) => t.url && (t.url.includes(`/room/${roomId}`) || t.url.includes(`/${roomId}`))
      );

      if (roomTab?.id) {
        chrome.tabs.update(roomTab.id, { active: true });
        chrome.tabs.sendMessage(
          roomTab.id,
          { action: 'START_TAB_SHARE', tabTitle, roomId },
          () => {
            // Also notify window directly via script injection
            chrome.scripting?.executeScript?.({
              target: { tabId: roomTab.id! },
              func: (title: string, rId: string) => {
                window.postMessage({ type: 'SYNCTUBE_START_TAB_SHARE', tabTitle: title, roomId: rId }, '*');
              },
              args: [tabTitle, roomId],
            }).catch?.(() => {});
          }
        );
      } else {
        chrome.tabs.create({ url: `http://localhost:5173/room/${roomId}` }, (newTab) => {
          setTimeout(() => {
            if (newTab?.id) {
              chrome.scripting?.executeScript?.({
                target: { tabId: newTab.id },
                func: (title: string, rId: string) => {
                  window.postMessage({ type: 'SYNCTUBE_START_TAB_SHARE', tabTitle: title, roomId: rId }, '*');
                },
                args: [tabTitle, roomId],
              }).catch?.(() => {});
            }
          }, 1500);
        });
      }

      if (streamTabBtn) streamTabBtn.classList.add('hidden');
      if (stopTabStreamBtn) stopTabStreamBtn.classList.remove('hidden');
      if (tabStreamBadge) {
        tabStreamBadge.textContent = 'STREAMING LIVE';
        tabStreamBadge.style.color = '#10b981';
      }
    });
  }

  streamTabBtn?.addEventListener('click', () => {
    const roomId = currentPartyState?.roomId || roomCodeInput?.value.trim().toUpperCase();
    if (!roomId) {
      alert('Please connect to or enter a Room Code first!');
      return;
    }

    const selectedTabId = Number(tabSelect?.value);
    let chosenTitle = 'Movie Stream Tab';
    if (typeof chrome !== 'undefined' && chrome.tabs?.get && selectedTabId) {
      chrome.tabs.get(selectedTabId, (tab) => {
        if (tab?.title) chosenTitle = tab.title;
        triggerTabShareInRoom(roomId, chosenTitle);
      });
    } else {
      triggerTabShareInRoom(roomId, chosenTitle);
    }
  });

  stopTabStreamBtn?.addEventListener('click', () => {
    const roomId = currentPartyState?.roomId || roomCodeInput?.value.trim().toUpperCase();
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({}, (allTabs) => {
        const roomTab = allTabs.find(
          (t) => t.url && (t.url.includes(`/room/${roomId}`) || t.url.includes(`/${roomId}`))
        );
        if (roomTab?.id) {
          chrome.tabs.sendMessage(roomTab.id, { action: 'STOP_TAB_SHARE' }, () => {
            chrome.scripting?.executeScript?.({
              target: { tabId: roomTab.id! },
              func: () => {
                window.postMessage({ type: 'SYNCTUBE_STOP_TAB_SHARE' }, '*');
              },
            }).catch?.(() => {});
          });
        }
      });
    }
    if (streamTabBtn) streamTabBtn.classList.remove('hidden');
    if (stopTabStreamBtn) stopTabStreamBtn.classList.add('hidden');
    if (tabStreamBadge) {
      tabStreamBadge.textContent = 'WebRTC P2P';
      tabStreamBadge.style.color = 'inherit';
    }
  });

  detectBtn?.addEventListener('click', () => {
    checkActiveTabMedia();
    populateTabsList();
  });

  await updatePartyUI();
  await checkActiveTabMedia();
  await populateTabsList();

  // Periodic polling while popup is open for smooth updates
  const interval = setInterval(() => {
    checkActiveTabMedia();
  }, 1500);

  window.addEventListener('unload', () => {
    clearInterval(interval);
  });
});
