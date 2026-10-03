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

  // Flags to prevent echo loops
  const isRemoteSyncRef = useRef<boolean>(false);
  const lastKnownVideoIdRef = useRef<string>(videoId);
  const syncStateRef = useRef<SyncStatePayload | null>(syncState);
  syncStateRef.current = syncState;

  // Initialize YouTube IFrame API script
  useEffect(() => {
    let isMounted = true;

    const initPlayer = () => {
      if (!isMounted || !window.YT || !window.YT.Player) return;

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      playerRef.current = new window.YT.Player('youtube-player-slot', {
        height: '100%',
        width: '100%',
        videoId: videoId,
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

            // If state change was triggered by our remote sync, don't emit back
            if (isRemoteSyncRef.current) {
              isRemoteSyncRef.current = false;
              return;
            }

            // Only HOST or MODERATOR actions should emit to server
            const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

            // YT.PlayerState.PLAYING = 1, PAUSED = 2
            if (event.data === window.YT.PlayerState.PLAYING) {
              if (canControl) {
                const currentTime = playerRef.current?.getCurrentTime() || 0;
                onLocalPlay(currentTime);
              } else {
                // Participant tried to play, reconcile with server state
                reconcileWithServer();
              }
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              if (canControl) {
                const currentTime = playerRef.current?.getCurrentTime() || 0;
                onLocalPause(currentTime);
              } else {
                // Participant tried to pause, reconcile with server state
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
      isRemoteSyncRef.current = true;
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
      isRemoteSyncRef.current = true;
      playerRef.current.loadVideoById(targetVideoId);
    }

    // Calculate effective target time factoring elapsed time if playing
    let targetTime = currentTime;
    if (playState === 'playing') {
      const elapsed = Math.max(0, (Date.now() - updatedAt) / 1000);
      targetTime = currentTime + elapsed;
    }

    const localTime = playerRef.current.getCurrentTime() || 0;
    const drift = Math.abs(localTime - targetTime);

    // If drift is significant (> 1.5 seconds), seek
    if (drift > 1.5) {
      isRemoteSyncRef.current = true;
      playerRef.current.seekTo(targetTime, true);
    }

    // Match play/pause state
    const currentYtState = playerRef.current.getPlayerState();
    if (playState === 'playing' && currentYtState !== window.YT?.PlayerState?.PLAYING) {
      isRemoteSyncRef.current = true;
      playerRef.current.playVideo();
    } else if (playState === 'paused' && currentYtState !== window.YT?.PlayerState?.PAUSED) {
      isRemoteSyncRef.current = true;
      playerRef.current.pauseVideo();
    }
  };

  // Reconcile whenever syncState updates from server
  useEffect(() => {
    reconcileWithServer();
  }, [syncState, playerReady]);

  // Periodic progress tracker and drift guard
  useEffect(() => {
    const timer = setInterval(() => {
      if (!playerReady || !playerRef.current) return;

      try {
        const time = playerRef.current.getCurrentTime() || 0;
        const dur = playerRef.current.getDuration() || 0;
        onCurrentTimeChange(time, dur);

        // Drift check if playing
        if (syncStateRef.current && syncStateRef.current.playState === 'playing') {
          const elapsed = Math.max(0, (Date.now() - syncStateRef.current.updatedAt) / 1000);
          const expected = syncStateRef.current.currentTime + elapsed;
          if (Math.abs(time - expected) > 2.5) {
            isRemoteSyncRef.current = true;
            playerRef.current.seekTo(expected, true);
          }
        }
      } catch {}
    }, 500);

    return () => clearInterval(timer);
  }, [playerReady, onCurrentTimeChange]);

  return (
    <div className="video-wrapper" ref={containerRef}>
      <div id="youtube-player-slot" className="video-iframe" />
    </div>
  );
};
