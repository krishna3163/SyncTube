import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
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
  onOpenBrowserHub?: () => void;
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
  onOpenBrowserHub,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSeekingLocallyRef = useRef(false);
  const isSyncingFromRemoteRef = useRef(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Clear error on new URL
  useEffect(() => {
    setVideoError(null);
  }, [mediaUrl]);

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

  const handleVideoError = () => {
    const err = videoRef.current?.error;
    let msg = 'The video stream could not be loaded.';
    if (err?.code === 1) {
      msg = 'Playback aborted by user or browser.';
    } else if (err?.code === 2) {
      msg = 'Network error while fetching the stream.';
    } else if (err?.code === 3) {
      msg = 'Video decoding failed or codec unsupported.';
    } else if (err?.code === 4) {
      msg = 'Stream rejected access (Access Denied / 403 Forbidden or expired URL).';
    }
    setVideoError(msg);
  };

  const handleRetry = () => {
    setVideoError(null);
    if (videoRef.current) {
      videoRef.current.load();
    }
  };

  return (
    <div className="video-wrapper direct-video-wrapper">
      {videoError && (
        <div className="direct-video-error-card">
          <div className="direct-video-error-icon">
            <AlertTriangle size={36} color="#f87171" />
          </div>
          <h3 className="direct-video-error-title">Stream Playback Failed</h3>
          <p className="direct-video-error-msg">{videoError}</p>
          <div className="direct-video-error-url" title={mediaUrl}>
            <code>{mediaUrl}</code>
          </div>
          <div className="direct-video-error-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRetry}
            >
              <RefreshCw size={13} /> Retry Stream
            </button>
            {onOpenBrowserHub && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onOpenBrowserHub}
              >
                Change Video in Hub
              </button>
            )}
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              title="Test URL in new browser tab"
            >
              <ExternalLink size={13} /> Open Link
            </a>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        src={mediaUrl}
        className={`direct-html5-video ${videoError ? 'video-hidden' : ''}`}
        playsInline
        onPlay={handlePlayEvent}
        onPause={handlePauseEvent}
        onSeeked={handleSeekedEvent}
        onError={handleVideoError}
      />
      {/* If viewer, prevent direct click pause/play, overlay shield */}
      {!canControl && !videoError && (
        <div
          className="viewer-video-shield"
          style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'default' }}
          title="Playback is controlled by the Host"
        />
      )}
    </div>
  );
});
