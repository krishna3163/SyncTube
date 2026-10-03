import React, { useEffect, useRef, useState } from 'react';
import { PlayState, Role, SyncStatePayload } from '../types.js';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps {
  videoId: string;
  syncState: SyncStatePayload | null;
  userRole: Role;
  onLocalPlay: (time: number) => void;
  onLocalPause: (time: number) => void;
  onLocalSeek: (time: number) => void;
  onCurrentTimeChange: (time: number, duration: number) => void;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  syncState,
  userRole,
  onLocalPlay,
  onLocalPause,
  onLocalSeek,
  onCurrentTimeChange,
}) => {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playerReady, setPlayerReady] = useState(false);

  // Dynamic refs to avoid stale closures in YouTube callbacks
  const userRoleRef = useRef<Role>(userRole);
  userRoleRef.current = userRole;

  const onLocalPlayRef = useRef(onLocalPlay);
  onLocalPlayRef.current = onLocalPlay;

  const onLocalPauseRef = useRef(onLocalPause);
  onLocalPauseRef.current = onLocalPause;

  const syncStateRef = useRef<SyncStatePayload | null>(syncState);
  syncStateRef.current = syncState;

  const lastKnownVideoIdRef = useRef<string>(videoId);

  // Timestamp threshold to ignore programmatic player events
  const ignoreStateChangesUntilRef = useRef<number>(0);

  // Initialize YouTube IFrame API script
  useEffect(() => {
    let isMounted = true;

    const initPlayer = () => {
      if (!isMounted || !window.YT || !window.YT.Player) return;

      if (!containerRef.current) return;
      containerRef.current.innerHTML = '<div class="video-iframe"></div>';
      const slot = containerRef.current.firstElementChild as HTMLElement;

      playerRef.current = new window.YT.Player(slot, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        host: 'https://www.youtube.com',
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (isMounted) {
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

            // YT.PlayerState.PLAYING = 1, PAUSED = 2
            if (event.data === window.YT.PlayerState.PLAYING) {
              if (canControl) {
                const currentTime = playerRef.current?.getCurrentTime() || 0;
                onLocalPlayRef.current(currentTime);
              } else {
                // Participant clicked play: snap back to server authoritative state
                reconcileWithServer();
              }
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              if (canControl) {
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

  // Reconcile player state with incoming server sync_state
  const reconcileWithServer = () => {
    if (!playerReady || !playerRef.current || !syncStateRef.current) return;

    const { videoId: targetVideoId, playState, currentTime, updatedAt } = syncStateRef.current;

    // Load new video if changed
    if (targetVideoId !== lastKnownVideoIdRef.current) {
      lastKnownVideoIdRef.current = targetVideoId;
      ignoreStateChangesUntilRef.current = Date.now() + 1000;
      playerRef.current.loadVideoById(targetVideoId);
    }

    // If PAUSED on server, strictly enforce pause without any elapsed time addition
    if (playState === 'paused') {
      const currentYtState = playerRef.current.getPlayerState();
      const localTime = playerRef.current.getCurrentTime() || 0;

      // If drifted by more than 1.5s from the pause point, seek to pause point
      if (Math.abs(localTime - currentTime) > 1.5) {
        ignoreStateChangesUntilRef.current = Date.now() + 1000;
        playerRef.current.seekTo(currentTime, true);
      }

      if (currentYtState !== window.YT?.PlayerState?.PAUSED) {
        ignoreStateChangesUntilRef.current = Date.now() + 1000;
        playerRef.current.pauseVideo();
      }
      return;
    }

    // If PLAYING on server, calculate effective target time factoring elapsed time
    const elapsed = Math.max(0, (Date.now() - updatedAt) / 1000);
    const targetTime = currentTime + elapsed;

    const localTime = playerRef.current.getCurrentTime() || 0;
    const drift = Math.abs(localTime - targetTime);

    // If drift is significant (> 1.5 seconds), seek
    if (drift > 1.5) {
      ignoreStateChangesUntilRef.current = Date.now() + 1000;
      playerRef.current.seekTo(targetTime, true);
    }

    // Match playing state
    const currentYtState = playerRef.current.getPlayerState();
    if (currentYtState !== window.YT?.PlayerState?.PLAYING) {
      ignoreStateChangesUntilRef.current = Date.now() + 1000;
      playerRef.current.playVideo();
    }
  };

  // Reconcile whenever syncState updates from server
  useEffect(() => {
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
        // ONLY perform drift correction if server is in playing state AND not in programmatic debounce
        if (
          currentSync &&
          currentSync.playState === 'playing' &&
          Date.now() > ignoreStateChangesUntilRef.current
        ) {
          const elapsed = Math.max(0, (Date.now() - currentSync.updatedAt) / 1000);
          const expected = currentSync.currentTime + elapsed;
          if (Math.abs(time - expected) > 2.5) {
            ignoreStateChangesUntilRef.current = Date.now() + 1000;
            playerRef.current.seekTo(expected, true);
          }
        }
      } catch {}
    }, 500);

    return () => clearInterval(timer);
  }, [playerReady, onCurrentTimeChange]);

  return (
    <div className="video-wrapper" ref={containerRef}>
      <div className="video-iframe" />
    </div>
  );
};
