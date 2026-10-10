import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * VideoAmbientBackdrop
 * Premium, YouTube-inspired real-time video ambient mode.
 *
 * Core Architecture:
 *  - Samples live video frames from the active foreground HTML5 <video> or <canvas> element.
 *  - Draws into a low-resolution offscreen canvas (64x36) with zero impact on playback performance.
 *  - Performs temporal alpha blending onto a 128x72 display canvas to eliminate flickering and scene-cut flashes.
 *  - Analyzes scene luminance to intelligently adapt ambient glow opacity and brightness in real time.
 *  - Pauses sampling when video is paused or when browser tab is hidden (saving CPU/GPU).
 *  - Immediately refreshes upon seeking (no lag or ghosting).
 *  - Respects CORS and cross-origin security: gracefully handles unsupported third-party iframes without console errors or crashes.
 */

interface VideoAmbientBackdropProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isEnabled: boolean;
  playState?: 'playing' | 'paused' | 'buffering';
  blur?: number; // 0 to 100, default ~35-50
  spread?: number; // 50 to 150, default 100
  videoId?: string;
}

export const VideoAmbientBackdrop: React.FC<VideoAmbientBackdropProps> = ({
  containerRef,
  isEnabled,
  playState = 'paused',
  blur = 40,
  spread = 100,
  videoId,
}) => {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Status state
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [hasValidFrame, setHasValidFrame] = useState<boolean>(false);
  const [unsupportedNotice, setUnsupportedNotice] = useState<string | null>(null);

  // Internal sampling references
  const samplingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeMediaRef = useRef<HTMLVideoElement | HTMLCanvasElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const rvfcIdRef = useRef<number | null>(null);
  const lastSampleTimeRef = useRef<number>(0);
  const currentOpacityRef = useRef<number>(0.55);
  const isEnabledRef = useRef<boolean>(isEnabled);
  isEnabledRef.current = isEnabled;
  const playStateRef = useRef<string>(playState);
  playStateRef.current = playState;

  // Initialize offscreen sampling canvas (64x36 16:9 ratio)
  useEffect(() => {
    if (!samplingCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      samplingCanvasRef.current = c;
    }
  }, []);

  // Update CSS custom properties for blur and spread
  useEffect(() => {
    if (!backdropRef.current) return;
    const blurPx = Math.max(20, Math.min(100, blur * 1.3));
    const spreadScale = Math.max(1.02, Math.min(1.4, (spread / 100) * 1.12));
    backdropRef.current.style.setProperty('--ambient-blur', `${blurPx}px`);
    backdropRef.current.style.setProperty('--ambient-spread', `${spreadScale}`);
  }, [blur, spread]);

  // Sample a single frame from the active media element
  const sampleFrame = useCallback((forceInstant: boolean = false) => {
    const media = activeMediaRef.current;
    const displayCanvas = displayCanvasRef.current;
    const samplingCanvas = samplingCanvasRef.current;
    if (!media || !displayCanvas || !samplingCanvas) return false;

    // Verify media is ready
    if (media instanceof HTMLVideoElement) {
      if (media.readyState < 2 || media.videoWidth === 0 || media.videoHeight === 0) {
        return false;
      }
    } else if (media instanceof HTMLCanvasElement) {
      if (media.width === 0 || media.height === 0) {
        return false;
      }
    }

    const samplingCtx = samplingCanvas.getContext('2d', { willReadFrequently: true });
    const displayCtx = displayCanvas.getContext('2d');
    if (!samplingCtx || !displayCtx) return false;

    try {
      // 1. Draw into low-resolution offscreen canvas
      samplingCtx.drawImage(media, 0, 0, 64, 36);

      // 2. Measure scene luminance to adapt ambient intensity
      const imgData = samplingCtx.getImageData(0, 0, 64, 36);
      let totalLuma = 0;
      const step = 16; // Sample every 4th pixel for speed (144 samples)
      let sampleCount = 0;
      for (let i = 0; i < imgData.data.length; i += step) {
        const r = imgData.data[i];
        const g = imgData.data[i + 1];
        const b = imgData.data[i + 2];
        totalLuma += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        sampleCount++;
      }
      const avgLuma = sampleCount > 0 ? totalLuma / sampleCount : 0.5;

      // Adapt target opacity smoothly (dark scenes gentle, bright scenes restrained)
      const targetOpacity = Math.max(0.32, Math.min(0.72, 0.36 + avgLuma * 0.34));
      currentOpacityRef.current += (targetOpacity - currentOpacityRef.current) * (forceInstant ? 1.0 : 0.18);

      if (backdropRef.current) {
        backdropRef.current.style.setProperty('--ambient-opacity', currentOpacityRef.current.toFixed(3));
      }

      // 3. Double-buffered / temporal alpha blending onto display canvas
      // This prevents any visible flicker or flashing black during scene changes
      displayCtx.globalCompositeOperation = 'source-over';
      displayCtx.globalAlpha = forceInstant ? 1.0 : 0.35;
      displayCtx.drawImage(samplingCanvas, 0, 0, displayCanvas.width, displayCanvas.height);
      displayCtx.globalAlpha = 1.0;

      setHasValidFrame(true);
      return true;
    } catch (err: any) {
      if (err.name === 'SecurityError' || err.code === 18) {
        // Cross-origin restriction on frame extraction
        setIsSupported(false);
        setUnsupportedNotice('Video source restrictions prevent direct frame extraction.');
      }
      return false;
    }
  }, []);

  // Main sampling loop (targeted at ~10-12 fps for optimal performance)
  const scheduleNextFrame = useCallback(() => {
    if (!isEnabledRef.current || playStateRef.current !== 'playing' || document.hidden) {
      return;
    }

    const media = activeMediaRef.current;
    if (media instanceof HTMLVideoElement && 'requestVideoFrameCallback' in media) {
      rvfcIdRef.current = (media as any).requestVideoFrameCallback(() => {
        const now = performance.now();
        if (now - lastSampleTimeRef.current >= 85) {
          sampleFrame(false);
          lastSampleTimeRef.current = now;
        }
        scheduleNextFrame();
      });
    } else {
      rafIdRef.current = requestAnimationFrame((timestamp) => {
        if (timestamp - lastSampleTimeRef.current >= 85) {
          sampleFrame(false);
          lastSampleTimeRef.current = timestamp;
        }
        scheduleNextFrame();
      });
    }
  }, [sampleFrame]);

  const stopSampling = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const media = activeMediaRef.current;
    if (media instanceof HTMLVideoElement && rvfcIdRef.current !== null && 'cancelVideoFrameCallback' in media) {
      (media as any).cancelVideoFrameCallback(rvfcIdRef.current);
      rvfcIdRef.current = null;
    }
  }, []);

  // Detect and bind active media element from container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cleanupListeners = () => {};

    const findAndBindMedia = () => {
      // Look for direct HTML5 video or screencast canvas (excluding ambient canvas)
      const media = container.querySelector<HTMLVideoElement | HTMLCanvasElement>(
        'video, canvas:not(.ambient-canvas)'
      );

      // Check if container only houses an iframe (e.g. YouTube embed)
      const iframe = container.querySelector('iframe');

      if (media) {
        activeMediaRef.current = media;
        setIsSupported(true);
        setUnsupportedNotice(null);

        // Instant sample when seeking or metadata loads
        const handleSeeked = () => sampleFrame(true);
        const handleLoaded = () => sampleFrame(true);

        if (media instanceof HTMLVideoElement) {
          media.addEventListener('seeked', handleSeeked);
          media.addEventListener('loadeddata', handleLoaded);
          media.addEventListener('playing', () => {
            if (isEnabledRef.current) scheduleNextFrame();
          });
          media.addEventListener('pause', () => stopSampling());
          media.addEventListener('ended', () => stopSampling());

          cleanupListeners = () => {
            media.removeEventListener('seeked', handleSeeked);
            media.removeEventListener('loadeddata', handleLoaded);
          };
        }

        // Perform initial frame sample
        sampleFrame(true);

        if (isEnabledRef.current && playStateRef.current === 'playing') {
          scheduleNextFrame();
        }
      } else if (iframe) {
        // Cross-origin iframe does not allow direct parent frame extraction
        activeMediaRef.current = null;
        setIsSupported(false);
        setUnsupportedNotice('Ambient Mode is available for direct video, browser streams, and tab share.');
        stopSampling();
      } else {
        activeMediaRef.current = null;
      }
    };

    findAndBindMedia();

    // Observe DOM changes inside player container to re-bind when switching media categories
    const observer = new MutationObserver(() => {
      findAndBindMedia();
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanupListeners();
      stopSampling();
    };
  }, [containerRef, videoId, sampleFrame, scheduleNextFrame, stopSampling]);

  // Synchronize playback state changes
  useEffect(() => {
    if (!isEnabled || !isSupported) {
      stopSampling();
      return;
    }

    if (playState === 'playing') {
      scheduleNextFrame();
    } else {
      stopSampling();
      // On pause/buffer, retain latest frame
      sampleFrame(false);
    }

    return () => stopSampling();
  }, [isEnabled, isSupported, playState, scheduleNextFrame, stopSampling, sampleFrame]);

  // Tab visibility management: pause processing when tab is in background
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopSampling();
      } else if (isEnabledRef.current && playStateRef.current === 'playing' && isSupported) {
        sampleFrame(true);
        scheduleNextFrame();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isSupported, sampleFrame, scheduleNextFrame, stopSampling]);

  // If disabled, render nothing
  if (!isEnabled) {
    return null;
  }

  return (
    <div
      ref={backdropRef}
      className={`ambient-backdrop ${hasValidFrame && isSupported ? 'is-active' : 'is-idle'}`}
      aria-hidden="true"
    >
      {/* 128x72 display canvas scaled up with CSS blur */}
      <canvas
        ref={displayCanvasRef}
        width={128}
        height={72}
        className="ambient-canvas"
      />

      {/* Center darkening overlay to maintain contrast */}
      <div className="ambient-backdrop-overlay" />

      {/* Unobtrusive explanation when viewing cross-origin iframe without frame access */}
      {!isSupported && unsupportedNotice && (
        <div className="ambient-unsupported-tag" title={unsupportedNotice}>
          <span>Ambient frame capture active for Direct Video &amp; Streams</span>
        </div>
      )}
    </div>
  );
};
