import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw, ExternalLink, Globe, Copy, Check, Play } from 'lucide-react';
import * as dashjs from 'dashjs';
import { attachHevcSupport } from '@hevcjs/dashjs-plugin';
import { Role, SyncStatePayload } from '../types.js';
import { checkBrowserHevcSupport } from '../utils/codec.js';
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
  const hevcCleanupRef = useRef<(() => void) | null>(null);
  const isHevcAttachedRef = useRef(false);
  const isSeekingLocallyRef = useRef(false);
  const isSyncingFromRemoteRef = useRef(false);
  const lastHardSeekTimeRef = useRef<number>(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [hevcNotice, setHevcNotice] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [isHevcBlackScreen, setIsHevcBlackScreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  const [retryCount, setRetryCount] = useState(0);
  const MAX_CONTROLLED_RETRIES = 2;
  // Locked pixel height (null = Auto/ABR). Re-applied when the stream (re)initializes.
  const preferredHeightRef = useRef<number | null>(null);

  // Synchronously compute DASH format so <video> never receives raw XML as native src
  const isDashStream = Boolean(mediaUrl && (mediaUrl.includes('.mpd') || mediaUrl.includes('/dash/')));

  const handleControlledRetry = useCallback(() => {
    if (retryCount >= MAX_CONTROLLED_RETRIES) return;
    setRetryCount((prev) => prev + 1);
    setVideoError(null);
    setIsHevcBlackScreen(false);

    const video = videoRef.current;
    if (!video) return;

    console.info(`[SyncTube Player] Controlled retry ${retryCount + 1}/${MAX_CONTROLLED_RETRIES} for stream`);

    if (isDashStream && dashPlayerRef.current) {
      dashPlayerRef.current.reset();
      dashPlayerRef.current.initialize(video, mediaUrl, false);
    } else {
      video.load();
      video.play().catch(() => {});
    }
  }, [retryCount, isDashStream, mediaUrl]);

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
    setIsAutoplayBlocked(false);
    setIsHevcBlackScreen(false);
    setRetryCount(0);

    // A quality lock passed by the stream URL (?quality=720) wins for this stream
    preferredHeightRef.current = parseQualityHint(mediaUrl);
    setCurrentQuality(heightToLabel(preferredHeightRef.current));

    // Clean up previous dash player and hevc intercept
    if (hevcCleanupRef.current) {
      try {
        hevcCleanupRef.current();
      } catch {}
      hevcCleanupRef.current = null;
    }
    isHevcAttachedRef.current = false;
    if (dashPlayerRef.current) {
      dashPlayerRef.current.destroy();
      dashPlayerRef.current = null;
    }

    const video = videoRef.current;
    if (isDashStream && video) {
      let isCancelled = false;

      const initDash = async () => {
        try {
          const player = dashjs.MediaPlayer().create();
          dashPlayerRef.current = player;

          const isMobileDevice =
            typeof navigator !== 'undefined' &&
            /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

          player.updateSettings({
            streaming: {
              abr: {
                autoSwitchBitrate: { video: true, audio: true },
              },
              buffer: {
                fastSwitchEnabled: true,
                bufferTimeAtTopQuality: isMobileDevice ? 8 : 16,
              },
            },
          });

          // Attach lid-labs/hevc.js WASM transcoder middleware (HEVC -> H.264 client-side).
          // On Chromium & Firefox on Windows/Linux, MediaSource accepts hev1 without throwing,
          // but lacks actual software/hardware decode capability (yielding audio-only black screen).
          // We must set forceTranscode: true for non-Safari browsers to force the WASM transcoder pipeline!
          const isSafari =
            typeof navigator !== 'undefined' &&
            /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
          const hasNativeHevc = checkBrowserHevcSupport(false);
          // Never force WASM software transcoding on mobile (causes CPU choke and stutter)
          // or if the browser natively supports hardware HEVC decode (Edge, Safari)
          const shouldForceTranscode = !isSafari && !hasNativeHevc && !isMobileDevice;

          try {
            console.log(`[SyncTube] Initializing attachHevcSupport (forceTranscode=${shouldForceTranscode})...`);
            const cleanup = await attachHevcSupport(player, {
              workerUrl: '/transcode-worker.js',
              wasmUrl: '/hevc-decode.js',
              wasmBinaryUrl: '/hevc-decode.wasm',
              forceTranscode: shouldForceTranscode,
            });
            if (isCancelled) {
              cleanup?.();
              return;
            }
            hevcCleanupRef.current = cleanup;
            isHevcAttachedRef.current = true;
            console.log('[SyncTube] @hevcjs/dashjs-plugin WASM pipeline successfully installed!');
          } catch (hevcErr) {
            console.warn('[SyncTube] attachHevcSupport setup warning:', hevcErr);
          }

          if (isCancelled) return;

          player.initialize(video, mediaUrl, false);

          player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
            console.warn('[SyncTube Dash Error]', e);
            if (e?.error === 'capability' || e?.event === 'capability' || e?.error === 'mediasource') {
              setHevcNotice(true);
              setIsHevcBlackScreen(true);
            }
          });

          player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
            // Re-apply the chosen quality (or URL hint) once representations exist
            applyDashQuality(preferredHeightRef.current);

            setTimeout(() => {
              const hasHevcSupport = checkBrowserHevcSupport(true);
              if (!hasHevcSupport && !isHevcAttachedRef.current && video && video.readyState >= 2 && video.videoWidth === 0) {
                setHevcNotice(true);
                setIsHevcBlackScreen(true);
              }
            }, 3000);
          });
        } catch (err: any) {
          if (!isCancelled) {
            setVideoError(`DASH player failed to initialize: ${err?.message || 'Unsupported stream'}`);
          }
        }
      };

      initDash();

      return () => {
        isCancelled = true;
        if (hevcCleanupRef.current) {
          try {
            hevcCleanupRef.current();
          } catch {}
          hevcCleanupRef.current = null;
        }
        isHevcAttachedRef.current = false;
        if (dashPlayerRef.current) {
          dashPlayerRef.current.destroy();
          dashPlayerRef.current = null;
        }
      };
    }

    return () => {
      if (hevcCleanupRef.current) {
        try {
          hevcCleanupRef.current();
        } catch {}
        hevcCleanupRef.current = null;
      }
      isHevcAttachedRef.current = false;
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

  // Handle remote syncState changes with smooth drift reconciliation
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !syncState) return;

    // 1. Paused state reconciliation
    if (syncState.playState === 'paused') {
      if (!video.paused) {
        isSyncingFromRemoteRef.current = true;
        video.pause();
        setTimeout(() => {
          isSyncingFromRemoteRef.current = false;
        }, 300);
      }
      const timeDiff = Math.abs(video.currentTime - syncState.currentTime);
      if (timeDiff > 1.2) {
        isSyncingFromRemoteRef.current = true;
        video.currentTime = syncState.currentTime;
        setTimeout(() => {
          isSyncingFromRemoteRef.current = false;
        }, 500);
      }
      video.playbackRate = playbackSpeed;
      return;
    }

    // 2. Playing state reconciliation
    // Calculate effective target time factoring transit delay
    const now = Date.now();
    const transit = syncState.updatedAt ? Math.max(0, (now - syncState.updatedAt) / 1000) : 0;
    const targetTime = syncState.currentTime + transit;
    const drift = video.currentTime - targetTime; // positive = local ahead, negative = local behind
    const absDrift = Math.abs(drift);

    // If video is paused while remote is playing, resume playback
    if (video.paused) {
      isSyncingFromRemoteRef.current = true;
      video.play().catch(() => {
        setIsAutoplayBlocked(true);
      });
      setTimeout(() => {
        isSyncingFromRemoteRef.current = false;
      }, 500);
    }

    // 3-tiered Drift Reconciliation:
    // Tier 1: Large drift (>= 3.2s) - throttled hard seek (at most once every 3.5s)
    if (absDrift >= 3.2 && (now - lastHardSeekTimeRef.current > 3500)) {
      lastHardSeekTimeRef.current = now;
      isSyncingFromRemoteRef.current = true;
      video.currentTime = targetTime;
      video.playbackRate = playbackSpeed;
      setTimeout(() => {
        isSyncingFromRemoteRef.current = false;
      }, 1000);
    } else if (absDrift >= 1.0 && absDrift < 3.2) {
      // Tier 2: Medium drift (1.0s to 3.2s) - gentle rate catch-up.
      // NEVER hard-seek here! Hard-seeking on mobile flushes hardware decoder buffers and stutters.
      // If local is behind, slightly increase speed (1.07x). If ahead, slightly decrease speed (0.93x).
      const rateMultiplier = drift < 0 ? 1.07 : 0.93;
      video.playbackRate = playbackSpeed * rateMultiplier;
    } else {
      // Tier 3: In sync (< 1.0s) - smoothly maintain normal user playbackSpeed
      video.playbackRate = playbackSpeed;
    }
  }, [syncState, playbackSpeed]);

  // Time update listener
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : (dashPlayerRef.current?.duration() || 0);
      onCurrentTimeChange(video.currentTime, dur);

      // Robust black-screen detection:
      // Only verify when video is actively playing (not paused, not seeking),
      // has reached readyState >= 2 (HAVE_CURRENT_DATA), and audio/timeline has progressed > 3.0s.
      // This strictly prevents false positives during normal buffering/loading.
      if (
        !video.paused &&
        !video.seeking &&
        video.readyState >= 2 &&
        video.currentTime > (isHevcAttachedRef.current ? 6.0 : 3.0) &&
        video.videoWidth === 0 &&
        !isHevcBlackScreen
      ) {
        const hasHevcSupport = checkBrowserHevcSupport(isDashStream);
        console.warn(`[SyncTube Player] Black screen detected (videoWidth=0, hasHevc=${hasHevcSupport}, hevcAttached=${isHevcAttachedRef.current})`);
        setIsHevcBlackScreen(true);
        setHevcNotice(true);
        if (retryCount < MAX_CONTROLLED_RETRIES) {
          handleControlledRetry();
        }
      }
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
  }, [onCurrentTimeChange, onVideoEnded, isHevcBlackScreen, isDashStream, retryCount, handleControlledRetry]);

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
    const err = videoRef.current?.error;
    if (err?.code === 1) return; // user aborted

    console.warn(`[SyncTube Player Error] MediaError code=${err?.code}, message=${err?.message}`);

    if (err?.code === 3 || err?.code === 4) {
      const hasHevc = checkBrowserHevcSupport(isDashStream);
      if (!hasHevc) {
        setIsHevcBlackScreen(true);
        setHevcNotice(true);
      }
    }

    // Controlled automatic retry on temporary glitch before showing permanent error
    if (retryCount < MAX_CONTROLLED_RETRIES && (!isHevcBlackScreen || checkBrowserHevcSupport(isDashStream))) {
      setTimeout(handleControlledRetry, 1000);
      return;
    }

    if (isDashStream) {
      if (err?.code === 3 || err?.code === 4 || hevcNotice) {
        setVideoError(
          'This movie uses an HEVC stream that this browser cannot decode. Select an H.264 stream or open in Microsoft Edge/Safari.'
        );
      } else {
        setVideoError('The movie stream could not be loaded. It may have expired or be unavailable.');
      }
      return;
    }

    let msg = 'The video stream could not be loaded.';
    if (err?.code === 2) {
      msg = 'Network error while fetching the stream.';
    } else if (err?.code === 3) {
      msg = 'Video decoding failed or codec unsupported (H.264 fallback needed).';
    } else if (err?.code === 4) {
      msg = 'Stream rejected access (Access Denied / 403 Forbidden or expired URL).';
    }
    setVideoError(msg);
  };

  const handleRetry = () => {
    setVideoError(null);
    setHevcNotice(false);
    setIsHevcBlackScreen(false);
    setRetryCount(0);
    if (isDashStream && dashPlayerRef.current) {
      dashPlayerRef.current.attachSource(mediaUrl);
    } else if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  };

  const handleCopyLink = () => {
    if (!mediaUrl) return;
    const fullUrl = mediaUrl.startsWith('http') ? mediaUrl : `${window.location.origin}${mediaUrl}`;
    navigator.clipboard?.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="video-wrapper direct-video-wrapper">
      {isHevcBlackScreen && !videoError && (
        <div
          className="direct-video-warning-banner"
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            right: '12px',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '10px 16px',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            backdropFilter: 'blur(12px)',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#f8fafc',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#f87171" />
            <div>
              <strong>Black Screen:</strong> Your browser cannot decode this video's HEVC track.
              <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Fix: Open in Microsoft Edge (built-in HEVC hardware support) or click 'Copy for VLC'.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCopyLink}
              style={{ padding: '5px 12px', fontSize: '12px' }}
              title="Copy stream link to open in VLC, PotPlayer, or IINA"
            >
              {copied ? <Check size={13} color="#4ade80" /> : <Copy size={13} />} {copied ? 'Copied' : 'Open in VLC'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRetry}
              style={{ padding: '5px 12px', fontSize: '12px' }}
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        </div>
      )}

      {hevcNotice && !isHevcBlackScreen && !videoError && (
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
            background: 'rgba(15, 23, 42, 0.90)',
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
              <strong>HEVC Stream:</strong> If playback is black, open in Microsoft Edge or enable Hardware Acceleration at <code>chrome://settings/system</code>.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCopyLink}
              style={{ padding: '3px 10px', fontSize: '11px', flexShrink: 0 }}
              title="Copy stream link for VLC or external media player"
            >
              {copied ? <Check size={12} color="#4ade80" /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy for VLC'}
            </button>
          </div>
        </div>
      )}

      {isAutoplayBlocked && !videoError && (
        <div
          className="direct-video-autoplay-overlay"
          onClick={() => {
            const v = videoRef.current;
            if (v) {
              v.play()
                .then(() => setIsAutoplayBlocked(false))
                .catch(() => {});
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 25,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            style={{
              padding: '14px 28px',
              borderRadius: '9999px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 30px rgba(99, 102, 241, 0.5)',
            }}
          >
            <Play size={20} fill="#ffffff" /> Click to Start Video
          </div>
          <p style={{ marginTop: '12px', fontSize: '13px', color: '#cbd5e1' }}>
            Browser paused playback until user interaction
          </p>
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
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCopyLink}
              title="Copy stream link to open in VLC, PotPlayer, or MPV"
            >
              {copied ? <Check size={13} color="#4ade80" /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy for VLC'}
            </button>
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
