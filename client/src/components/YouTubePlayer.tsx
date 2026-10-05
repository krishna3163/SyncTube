import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Role, SyncStatePayload } from '../types.js';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerHandle {
  resync: () => void;
  isMuted: () => boolean;
  setQuality: (quality: string) => void;
  getCurrentQuality: () => string;
  toggleCaptions: () => boolean;
  isCaptionsOn: () => boolean;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
}

interface YouTubePlayerProps {
  videoId: string;
  syncState: SyncStatePayload | null;
  userRole: Role;
  playbackSpeed?: number;
  isMuted?: boolean;
  onLocalPlay: (time: number) => void;
  onLocalPause: (time: number) => void;
  onLocalSeek: (time: number) => void;
  onCurrentTimeChange: (time: number, duration: number) => void;
  onVideoEnded?: () => void;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(({
  videoId,
  syncState,
  userRole,
  playbackSpeed = 1,
  isMuted = false,
  onLocalPlay,
  onLocalPause,
  onLocalSeek,
  onCurrentTimeChange,
  onVideoEnded,
}, ref) => {
  const playerRef = useRef<any>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const mutedRef = useRef(isMuted);
  mutedRef.current = isMuted;
  const targetPlaybackRateRef = useRef<number>(playbackSpeed);

  useEffect(() => {
    targetPlaybackRateRef.current = playbackSpeed;
    if (playerReady && playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
      try {
        playerRef.current.setPlaybackRate(playbackSpeed);
      } catch {}
    }
  }, [playbackSpeed, playerReady]);

  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    try {
      if (isMuted) playerRef.current.mute();
      else playerRef.current.unMute();
    } catch {
      // Keep the requested state; the player will receive it on the next ready event.
    }
  }, [isMuted, playerReady]);

  // Dynamic refs to avoid stale closures in YouTube callbacks
  const userRoleRef = useRef<Role>(userRole);
  userRoleRef.current = userRole;

  const onLocalPlayRef = useRef(onLocalPlay);
  onLocalPlayRef.current = onLocalPlay;

  const onLocalPauseRef = useRef(onLocalPause);
  onLocalPauseRef.current = onLocalPause;

  const syncStateRef = useRef<SyncStatePayload | null>(syncState);
  syncStateRef.current = syncState;

  const onVideoEndedRef = useRef(onVideoEnded);
  onVideoEndedRef.current = onVideoEnded;

  const lastKnownVideoIdRef = useRef<string>(videoId);

  // Timestamp threshold to ignore programmatic player events
  const ignoreStateChangesUntilRef = useRef<number>(0);

  // Initialize YouTube IFrame API script
  useEffect(() => {
    let isMounted = true;

    const initPlayer = () => {
      if (!isMounted || !window.YT || !window.YT.Player) return;

      if (!slotRef.current) return;
      slotRef.current.innerHTML = '';
      const mountPoint = document.createElement('div');
      slotRef.current.appendChild(mountPoint);

      playerRef.current = new window.YT.Player(mountPoint, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        host: 'https://www.youtube.com',
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          playsinline: 1,
          disablekb: 1,
        },
        events: {
          onReady: (event: any) => {
            if (isMounted) {
              if (mutedRef.current) event.target.mute();
              else event.target.unMute();
              setPlayerReady(true);
            }
          },
          onStateChange: (event: any) => {
            if (!isMounted) return;

            // Ignore state changes caused by programmatic updates from remote sync
            if (Date.now() < ignoreStateChangesUntilRef.current) {
              return;
            }

            // Always check latest role via ref to avoid stale closure
            const canControl = userRoleRef.current === 'HOST' || userRoleRef.current === 'MODERATOR';

            // YT.PlayerState.ENDED = 0, PLAYING = 1, PAUSED = 2
            if (event.data === window.YT.PlayerState.ENDED) {
              if (canControl && onVideoEndedRef.current) {
                onVideoEndedRef.current();
              }
            } else if (event.data === window.YT.PlayerState.PLAYING) {
              if (canControl) {
                // If server is ALREADY in playing state, this PLAYING event is just the player
                // completing the transition commanded by the server - do NOT echo back to server!
                if (syncStateRef.current?.playState === 'playing') {
                  return;
                }
                const currentTime = playerRef.current?.getCurrentTime() || 0;
                onLocalPlayRef.current(currentTime);
              } else {
                // Participant clicked play: snap back to server authoritative state
                reconcileWithServer();
              }
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              if (canControl) {
                // If server is ALREADY in paused state, this PAUSED event is just the player
                // completing the transition commanded by the server - do NOT echo back to server!
                if (syncStateRef.current?.playState === 'paused') {
                  return;
                }
                const currentTime = playerRef.current?.getCurrentTime() || 0;
                onLocalPauseRef.current(currentTime);
              } else {
                // Participant clicked pause: snap back to server authoritative state
                reconcileWithServer();
              }
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }

      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        initPlayer();
      };
    }

    return () => {
      isMounted = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
      if (slotRef.current) {
        try {
          slotRef.current.innerHTML = '';
        } catch {}
      }
    };
  }, []);

  // Handle Video ID change
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;

    if (videoId !== lastKnownVideoIdRef.current) {
      lastKnownVideoIdRef.current = videoId;
      ignoreStateChangesUntilRef.current = Date.now() + 1000;
      try {
        playerRef.current.loadVideoById(videoId);
      } catch (err) {
        console.error('Failed to load video by ID:', err);
      }
    }
  }, [videoId, playerReady]);

  // Local receipt timestamp to eliminate device-to-device clock skew
  const localReceivedAtRef = useRef<number>(Date.now());
  const receivedAnchorTimeRef = useRef<number>(0);

  // Reconcile player state with incoming server sync_state
  const reconcileWithServer = () => {
    if (
      !playerReady ||
      !playerRef.current ||
      typeof playerRef.current.getCurrentTime !== 'function' ||
      typeof playerRef.current.getPlayerState !== 'function' ||
      !syncStateRef.current
    ) return;

    const { videoId: targetVideoId, playState, currentTime } = syncStateRef.current;

    // Load new video if changed
    if (targetVideoId !== lastKnownVideoIdRef.current) {
      lastKnownVideoIdRef.current = targetVideoId;
      ignoreStateChangesUntilRef.current = Date.now() + 1000;
      playerRef.current.loadVideoById(targetVideoId);
    }

    // If PAUSED on server, strictly enforce pause and exact timestamp
    if (playState === 'paused') {
      const currentYtState = playerRef.current.getPlayerState();
      const localTime = playerRef.current.getCurrentTime() || 0;

      // If drifted by more than 1s from the pause point, seek to pause point
      if (Math.abs(localTime - currentTime) > 1.0) {
        ignoreStateChangesUntilRef.current = Date.now() + 1000;
        playerRef.current.seekTo(currentTime, true);
      }

      if (currentYtState !== window.YT?.PlayerState?.PAUSED) {
        ignoreStateChangesUntilRef.current = Date.now() + 1000;
        playerRef.current.pauseVideo();
      }
      return;
    }

    // If PLAYING on server, calculate effective target time using local elapsed time
    const elapsed = Math.max(0, (Date.now() - localReceivedAtRef.current) / 1000);
    const targetTime = receivedAnchorTimeRef.current + elapsed;

    const localTime = playerRef.current.getCurrentTime() || 0;
    const drift = localTime - targetTime; // positive = viewer ahead, negative = viewer behind

    const baseRate = targetPlaybackRateRef.current || 1.0;

    // Large drift (> 3s): hard seek to catch up quickly
    if (Math.abs(drift) > 3.0) {
      ignoreStateChangesUntilRef.current = Date.now() + 1200;
      playerRef.current.seekTo(targetTime, true);
      try { playerRef.current.setPlaybackRate(baseRate); } catch {}
    } else if (Math.abs(drift) > 0.5) {
      // Medium drift: adjust playback rate gently (no seek = no buffering)
      const rate = drift > 0 ? baseRate * 0.92 : baseRate * 1.08;
      try { playerRef.current.setPlaybackRate(rate); } catch {}
    } else {
      // In sync: restore chosen rate
      try { playerRef.current.setPlaybackRate(baseRate); } catch {}
    }

    // Match playing state
    const currentYtState = playerRef.current.getPlayerState();
    if (currentYtState !== window.YT?.PlayerState?.PLAYING) {
      ignoreStateChangesUntilRef.current = Date.now() + 1000;
      playerRef.current.playVideo();
    }
  };

  // Reconcile whenever syncState updates from server
  const lastProcessedSyncStateRef = useRef<SyncStatePayload | null>(null);
  useEffect(() => {
    if (syncState && syncState !== lastProcessedSyncStateRef.current) {
      lastProcessedSyncStateRef.current = syncState;
      localReceivedAtRef.current = Date.now();
      receivedAnchorTimeRef.current = syncState.currentTime;
    }
    reconcileWithServer();
  }, [syncState, playerReady]);

  // Periodic progress tracker and drift guard (ONLY active while PLAYING)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!playerReady || !playerRef.current) return;

      try {
        const time = playerRef.current.getCurrentTime() || 0;
        const dur = playerRef.current.getDuration() || 0;
        onCurrentTimeChange(time, dur);

        const currentSync = syncStateRef.current;
        // Non-host viewers: gentle rate-based correction to eliminate buffering
        if (
          userRoleRef.current !== 'HOST' &&
          currentSync &&
          currentSync.playState === 'playing' &&
          Date.now() > ignoreStateChangesUntilRef.current
        ) {
          const elapsed = Math.max(0, (Date.now() - localReceivedAtRef.current) / 1000);
          const expected = receivedAnchorTimeRef.current + elapsed;
          const drift = time - expected; // positive = ahead, negative = behind
          const baseRate = targetPlaybackRateRef.current || 1.0;

          if (Math.abs(drift) > 3.0) {
            // Large drift: hard seek
            ignoreStateChangesUntilRef.current = Date.now() + 1200;
            playerRef.current.seekTo(expected, true);
            try { playerRef.current.setPlaybackRate(baseRate); } catch {}
          } else if (Math.abs(drift) > 0.5) {
            // Medium drift: rate adjustment only (no buffering!)
            const rate = drift > 0 ? baseRate * 0.92 : baseRate * 1.08;
            try { playerRef.current.setPlaybackRate(rate); } catch {}
          } else {
            // In sync
            try { playerRef.current.setPlaybackRate(baseRate); } catch {}
          }
        }
      } catch {}
    }, 500);

    return () => clearInterval(timer);
  }, [playerReady, onCurrentTimeChange]);

  useImperativeHandle(ref, () => ({
    resync: () => {
      reconcileWithServer();
    },
    isMuted: () => {
      try {
        const playerMuted = playerRef.current?.isMuted?.();
        if (typeof playerMuted === 'boolean') mutedRef.current = playerMuted;
      } catch {
        // Keep last requested mute state if player API is unavailable.
      }
      return mutedRef.current;
    },
    setQuality: (quality: string) => {
      if (!playerRef.current) return;
      try {
        if (typeof playerRef.current.setPlaybackQuality === 'function') {
          playerRef.current.setPlaybackQuality(quality);
        }
      } catch {}
    },
    getCurrentQuality: () => {
      try {
        return playerRef.current?.getPlaybackQuality?.() || 'auto';
      } catch {
        return 'auto';
      }
    },
    toggleCaptions: () => {
      if (!playerRef.current) return false;
      try {
        const track = playerRef.current.getOption?.('captions', 'track');
        if (track && Object.keys(track).length > 0) {
          playerRef.current.unloadModule?.('captions');
          playerRef.current.setOption?.('captions', 'track', {});
          return false;
        } else {
          playerRef.current.loadModule?.('captions');
          playerRef.current.setOption?.('captions', 'track', { languageCode: 'en' });
          return true;
        }
      } catch {
        return false;
      }
    },
    isCaptionsOn: () => {
      try {
        const track = playerRef.current?.getOption?.('captions', 'track');
        return Boolean(track && Object.keys(track).length > 0);
      } catch {
        return false;
      }
    },
    setPlaybackRate: (rate: number) => {
      targetPlaybackRateRef.current = rate;
      if (!playerRef.current) return;
      try {
        if (typeof playerRef.current.setPlaybackRate === 'function') {
          playerRef.current.setPlaybackRate(rate);
        }
      } catch {}
    },
    getPlaybackRate: () => {
      try {
        return playerRef.current?.getPlaybackRate?.() || targetPlaybackRateRef.current;
      } catch {
        return targetPlaybackRateRef.current;
      }
    }
  }));

  return (
    <div className="video-wrapper">
      <div className="video-iframe" ref={slotRef} />
      {userRole !== 'HOST' && userRole !== 'MODERATOR' && (
        <div 
          className="viewer-video-shield" 
          style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'default' }}
          title="Playback is controlled by the Host" 
        />
      )}
    </div>
  );
});
