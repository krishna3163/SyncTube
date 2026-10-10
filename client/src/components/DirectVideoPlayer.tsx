import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { AlertTriangle, RefreshCw, ExternalLink, Globe } from 'lucide-react';
import * as dashjs from 'dashjs';
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
  const dashPlayerRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const isSeekingLocallyRef = useRef(false);
  const isSyncingFromRemoteRef = useRef(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [hevcNotice, setHevcNotice] = useState(false);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  // Locked pixel height (null = Auto/ABR). Re-applied when the stream (re)initializes.
  const preferredHeightRef = useRef<number | null>(null);

  // Synchronously compute DASH format so <video> never receives raw XML as native src
  const isDashStream = Boolean(mediaUrl && (mediaUrl.includes('.mpd') || mediaUrl.includes('/dash/')));

  // YouTube-style quality label → pixel height (hd1080 → 1080, large → 480, ...)
  const QUALITY_LABEL_HEIGHTS: Record<string, number> = {
    hd2160: 2160,
    hd1080: 1080,
    hd720: 720,
    large: 480,
    medium: 360,
    small: 240,
    tiny: 144,
  };

  const heightToLabel = (height: number | null): string => {
    if (height == null) return 'auto';
    const known = Object.entries(QUALITY_LABEL_HEIGHTS).find(([, h]) => h === height);
    return known ? known[0] : `${height}p`;
  };

  const parseQualityHint = (url: string): number | null => {
    try {
      const parsed = new URL(url, window.location.origin);
      const raw = parsed.searchParams.get('quality');
      const height = raw ? parseInt(raw, 10) : NaN;
      return Number.isFinite(height) && height > 0 ? height : null;
    } catch {
      return null;
    }
  };

  const parseTargetHeight = (quality: string): number | null => {
    if (!quality || quality === 'auto') return null;
    if (QUALITY_LABEL_HEIGHTS[quality]) return QUALITY_LABEL_HEIGHTS[quality];
    const numeric = parseInt(String(quality).replace(/p$/i, ''), 10);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  };

  /**
   * Apply a quality to the adaptive (DASH) ladder:
   *  - null  → Auto (ABR adapts to bandwidth, like YouTube "Auto")
   *  - value → lock the video representation closest to (but not above) that height
   */
  const applyDashQuality = (height: number | null) => {
    const player = dashPlayerRef.current;
    if (!player || !isDashStream) return;
    try {
      if (height == null) {
        player.updateSettings({
          streaming: { abr: { autoSwitchBitrate: { video: true, audio: true } } },
        });
        return;
      }

      const reps = player.getRepresentationsByType('video') || [];
      if (reps.length === 0) return;

      const withHeight = reps.filter((r) => Number(r.height) > 0);
      let chosenIdx = 0;
      if (withHeight.length > 0) {
        const atOrBelow = withHeight.filter((r) => Number(r.height) <= height);
        const pick =
          atOrBelow.length > 0
            ? atOrBelow.reduce((a, b) => (Number(a.height) >= Number(b.height) ? a : b))
            : withHeight.reduce((a, b) => (Number(a.height) <= Number(b.height) ? a : b));
        chosenIdx = reps.indexOf(pick);
      }

      player.updateSettings({
        streaming: { abr: { autoSwitchBitrate: { video: false, audio: true } } },
      });
      player.setRepresentationForTypeByIndex('video', Math.max(0, chosenIdx));
    } catch {
      // Stream not ready yet — STREAM_INITIALIZED will re-apply the preference
    }
  };

  // Initialize stream (DASH via Dash.js or native HTML5 for MP4/HLS)
  useEffect(() => {
    setVideoError(null);
    setHevcNotice(false);

    // A quality lock passed by the stream URL (?quality=720) wins for this stream
    preferredHeightRef.current = parseQualityHint(mediaUrl);
    setCurrentQuality(heightToLabel(preferredHeightRef.current));

    // Clean up previous dash player
    if (dashPlayerRef.current) {
      dashPlayerRef.current.destroy();
      dashPlayerRef.current = null;
    }

    const video = videoRef.current;
    if (isDashStream && video) {
      try {
        const player = dashjs.MediaPlayer().create();
        dashPlayerRef.current = player;

        player.updateSettings({
          streaming: {
            abr: {
              autoSwitchBitrate: { video: true, audio: true },
            },
            buffer: {
              fastSwitchEnabled: true,
              bufferTimeAtTopQuality: 25,
            },
          },
        });

        player.initialize(video, mediaUrl, false);

        player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
          if (e?.error === 'capability' || e?.event === 'capability') {
            setHevcNotice(true);
          }
        });

        player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          // Re-apply the chosen quality (or URL hint) once representations exist
          applyDashQuality(preferredHeightRef.current);

          setTimeout(() => {
            const hasHevcSupport =
              typeof MediaSource !== 'undefined' &&
              (MediaSource.isTypeSupported('video/mp4; codecs="hev1"') ||
                MediaSource.isTypeSupported('video/mp4; codecs="hvc1"'));

            if (!hasHevcSupport && video && video.videoWidth === 0) {
              setHevcNotice(true);
            }
          }, 1500);
        });
      } catch (err: any) {
        setVideoError(`DASH player failed to initialize: ${err?.message || 'Unsupported stream'}`);
      }
    }

    return () => {
      if (dashPlayerRef.current) {
        dashPlayerRef.current.destroy();
        dashPlayerRef.current = null;
      }
    };
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
    setQuality: (quality: string) => {
      const targetHeight = parseTargetHeight(quality);
      preferredHeightRef.current = targetHeight;
      setCurrentQuality(quality || 'auto');
      if (isDashStream) {
        applyDashQuality(targetHeight);
        return;
      }
      // For direct MP4 fixture streams — switch src locally while preserving timeline (like YouTube quality)
      const video = videoRef.current;
      if (video && mediaUrl.includes('/fixture-media/sample_')) {
        const height = targetHeight || 720;
        // Map to closest available fixture height (480/720/1080)
        const available = [480, 720, 1080];
        const closest = available.reduce((a, b) => Math.abs(b - height) < Math.abs(a - height) ? b : a);
        const currentTime = video.currentTime;
        const wasPaused = video.paused;
        const newUrl = mediaUrl.replace(/sample_\d+\.mp4/, `sample_${closest}.mp4`);
        if (newUrl !== mediaUrl) {
          // Update src and restore time after metadata loads
          video.src = newUrl;
          video.load();
          const onLoaded = () => {
            video.currentTime = currentTime;
            if (!wasPaused) video.play().catch(() => {});
            video.removeEventListener('loadedmetadata', onLoaded);
          };
          video.addEventListener('loadedmetadata', onLoaded);
        }
      }
    },
    getCurrentQuality: () => currentQuality,
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
    setVolume: (vol: number) => {
      if (videoRef.current) {
        videoRef.current.volume = Math.max(0, Math.min(1, vol / 100));
      }
    },
    getVolume: () => {
      return videoRef.current ? Math.round(videoRef.current.volume * 100) : 100;
    },
  }));

  const handleVideoError = () => {
    // If Dash.js is managing the stream via MediaSource, ignore native element file format errors
    if (isDashStream) {
      return;
    }
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
    setHevcNotice(false);
    if (isDashStream && dashPlayerRef.current) {
      dashPlayerRef.current.attachSource(mediaUrl);
    } else if (videoRef.current) {
      videoRef.current.load();
    }
  };

  return (
    <div className="video-wrapper direct-video-wrapper">
      {hevcNotice && !videoError && (
        <div
          className="direct-video-warning-banner"
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            right: '12px',
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '8px 14px',
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            backdropFilter: 'blur(12px)',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} color="#38bdf8" />
            <span>
              <strong>HD Audio Live:</strong> If video is blank on Linux/browser without HEVC, launch in Cloud Cinema:
            </span>
          </div>
          {onOpenBrowserHub && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onOpenBrowserHub}
              style={{ padding: '3px 10px', fontSize: '11px', flexShrink: 0 }}
            >
              Stream in Cloud Browser 🌐
            </button>
          )}
        </div>
      )}

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
        src={isDashStream ? undefined : mediaUrl}
        className={`direct-html5-video ${videoError ? 'video-hidden' : ''}`}
        playsInline
        crossOrigin="anonymous"
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
