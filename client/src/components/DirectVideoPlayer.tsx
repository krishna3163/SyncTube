import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Role, SyncStatePayload } from '../types.js';
import type { YouTubePlayerHandle } from './YouTubePlayer.js';

interface DirectVideoPlayerProps {
  mediaUrl: string;
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

export const DirectVideoPlayer = forwardRef<YouTubePlayerHandle, DirectVideoPlayerProps>(({
  mediaUrl,
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSeekingLocallyRef = useRef(false);
  const isSyncingFromRemoteRef = useRef(false);

  // Sync playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Sync mute state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Handle remote syncState changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !syncState) return;

    isSyncingFromRemoteRef.current = true;

    // Check drift
    const timeDiff = Math.abs(video.currentTime - syncState.currentTime);
    if (timeDiff > 0.8) {
      video.currentTime = syncState.currentTime;
    }

    if (syncState.playState === 'playing' && video.paused) {
      video.play().catch(() => {});
    } else if (syncState.playState === 'paused' && !video.paused) {
      video.pause();
    }

    setTimeout(() => {
      isSyncingFromRemoteRef.current = false;
    }, 200);
  }, [syncState]);

  // Time update listener
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      onCurrentTimeChange(video.currentTime, video.duration || 0);
    };

    const handleEnded = () => {
      if (onVideoEnded) onVideoEnded();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onCurrentTimeChange, onVideoEnded]);

  const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

  const handlePlayEvent = () => {
    if (isSyncingFromRemoteRef.current) return;
    if (canControl && videoRef.current) {
      onLocalPlay(videoRef.current.currentTime);
    }
  };

  const handlePauseEvent = () => {
    if (isSyncingFromRemoteRef.current) return;
    if (canControl && videoRef.current) {
      onLocalPause(videoRef.current.currentTime);
    }
  };

  const handleSeekedEvent = () => {
    if (isSyncingFromRemoteRef.current) return;
    if (canControl && videoRef.current) {
      onLocalSeek(videoRef.current.currentTime);
    }
  };

  useImperativeHandle(ref, () => ({
    resync: () => {
      if (videoRef.current && syncState) {
        videoRef.current.currentTime = syncState.currentTime;
        if (syncState.playState === 'playing') {
          videoRef.current.play().catch(() => {});
        } else {
          videoRef.current.pause();
        }
      }
    },
    isMuted: () => Boolean(videoRef.current?.muted),
    setQuality: () => {},
    getCurrentQuality: () => 'Original',
    toggleCaptions: () => false,
    isCaptionsOn: () => false,
    setPlaybackRate: (rate: number) => {
      if (videoRef.current) videoRef.current.playbackRate = rate;
    },
    getPlaybackRate: () => videoRef.current?.playbackRate || 1,
    seekTo: (time: number) => {
      if (videoRef.current) {
        isSeekingLocallyRef.current = true;
        videoRef.current.currentTime = time;
      }
    },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
  }));

  return (
    <div className="video-wrapper direct-video-wrapper">
      <video
        ref={videoRef}
        src={mediaUrl}
        className="direct-html5-video"
        playsInline
        crossOrigin="anonymous"
        onPlay={handlePlayEvent}
        onPause={handlePauseEvent}
        onSeeked={handleSeekedEvent}
      />
      {/* If viewer, prevent direct click pause/play, overlay shield */}
      {!canControl && (
        <div
          className="viewer-video-shield"
          style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'default' }}
          title="Playback is controlled by the Host"
        />
      )}
    </div>
  );
});
