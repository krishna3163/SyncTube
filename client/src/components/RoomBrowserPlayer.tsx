import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Search,
  Users,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Square,
  Sparkles,
  ExternalLink,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { socket, emitBrowserInput, emitStopBrowserStream, emitBrowserSetGuestControl } from '../services/socket.js';
import type { Role } from '../types.js';

interface RoomBrowserPlayerProps {
  roomId: string;
  sessionId: string;
  userRole: Role;
  guestControl: boolean;
  currentUrl?: string;
  currentTitle?: string;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
  onOpenBrowserHub?: () => void;
}

export const RoomBrowserPlayer: React.FC<RoomBrowserPlayerProps> = ({
  roomId,
  sessionId,
  userRole,
  guestControl,
  currentUrl: initialUrl,
  currentTitle: initialTitle,
  onNotify,
  onOpenBrowserHub,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [currentUrl, setCurrentUrl] = useState<string>(initialUrl || 'https://duckduckgo.com');
  const [urlInput, setUrlInput] = useState<string>(initialUrl || '');
  const [currentTitle, setCurrentTitle] = useState<string>(initialTitle || 'Temporary Browser Stream');
  const [fps, setFps] = useState<number>(30);
  const [lastFrameTime, setLastFrameTime] = useState<number>(Date.now());
  const [hasReceivedFrame, setHasReceivedFrame] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);

  const isHostOrMod = userRole === 'HOST' || userRole === 'MODERATOR';
  const canInteract = isHostOrMod || guestControl;

  // Listen to live screencast frames from room socket
  useEffect(() => {
    let frameCount = 0;
    let fpsTimer = setInterval(() => {
      setFps(frameCount);
      frameCount = 0;
    }, 1000);

    const onFrame = (frameData: { data: string; timestamp?: number; width?: number; height?: number }) => {
      if (!frameData?.data) return;
      frameCount++;
      setLastFrameTime(Date.now());
      setHasReceivedFrame(true);

      const canvas = canvasRef.current;
      if (!canvas) return;

      const img = new Image();
      img.onload = () => {
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }
      };
      img.src = `data:image/jpeg;base64,${frameData.data}`;
    };

    const onNavigated = (navData: { url: string; title: string }) => {
      if (navData.url) {
        setCurrentUrl(navData.url);
        setUrlInput(navData.url);
      }
      if (navData.title) {
        setCurrentTitle(navData.title);
      }
    };

    socket.on('room:browser_frame', onFrame);
    socket.on('room:browser_navigated', onNavigated);

    return () => {
      socket.off('room:browser_frame', onFrame);
      socket.off('room:browser_navigated', onNavigated);
      clearInterval(fpsTimer);
    };
  }, []);

  // Coordinate translation for canvas interaction
  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canInteract) {
      onNotify('Only the Host can control the temporary browser (or ask host to enable Co-Browse).', 'info');
      return;
    }
    const coords = getCanvasCoords(e);
    if (!coords) return;
    emitBrowserInput({ action: 'click', x: coords.x, y: coords.y, button: 'left', clickCount: 1 });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canInteract) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const btn = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    emitBrowserInput({ action: 'mouse_down', x: coords.x, y: coords.y, button: btn });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canInteract) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const btn = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    emitBrowserInput({ action: 'mouse_up', x: coords.x, y: coords.y, button: btn });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!canInteract) return;
    emitBrowserInput({ action: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canInteract) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    emitBrowserInput({ action: 'key_down', key: e.key });
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canInteract) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    emitBrowserInput({ action: 'key_up', key: e.key });
  };

  const handleNavigateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInteract) return;
    const target = urlInput.trim();
    if (!target) return;
    emitBrowserInput({ action: 'navigate', url: target });
    onNotify(`Navigating to ${target}...`, 'info');
  };

  const handleToggleGuestControl = () => {
    if (!isHostOrMod) return;
    const next = !guestControl;
    emitBrowserSetGuestControl(next);
    onNotify(next ? 'Co-Browse Enabled: Friends can now click and type!' : 'Co-Browse Disabled: Only Host can control.', 'info');
  };

  const handleStopStream = () => {
    if (!isHostOrMod) return;
    emitStopBrowserStream();
    onNotify('Temporary Browser stream stopped.', 'info');
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      className={`room-browser-stage-container ${isFullscreen ? 'is-fullscreen' : ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {/* Top Remote Control & Address Bar */}
      <div className="room-browser-nav-bar">
        <div className="room-browser-nav-left">
          <div className="room-browser-live-badge">
            <span className="live-pulse-dot" />
            <span>LIVE BROWSER</span>
          </div>

          {canInteract && (
            <div className="room-browser-nav-buttons">
              <button
                type="button"
                className="btn-icon-subtle"
                title="Back"
                onClick={() => emitBrowserInput({ action: 'back' })}
              >
                <ArrowLeft size={15} />
              </button>
              <button
                type="button"
                className="btn-icon-subtle"
                title="Forward"
                onClick={() => emitBrowserInput({ action: 'forward' })}
              >
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                className="btn-icon-subtle"
                title="Reload"
                onClick={() => emitBrowserInput({ action: 'reload' })}
              >
                <RotateCw size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Address bar */}
        <form className="room-browser-url-form" onSubmit={handleNavigateSubmit}>
          <div className="room-browser-url-input-wrap">
            <Globe size={14} className="url-globe-icon" />
            <input
              type="text"
              className="room-browser-url-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter streaming movie URL (Netflix, Crunchyroll, etc.)..."
              disabled={!canInteract}
            />
            {canInteract && (
              <button type="submit" className="room-browser-url-go-btn" title="Navigate">
                <Search size={13} />
                <span>Go</span>
              </button>
            )}
          </div>
        </form>

        {/* Controls & Actions */}
        <div className="room-browser-nav-right">
          {isHostOrMod && (
            <button
              type="button"
              className={`btn-sm-badge ${guestControl ? 'badge-cobrowse-active' : 'badge-cobrowse-idle'}`}
              onClick={handleToggleGuestControl}
              title={guestControl ? 'Click to revoke friend control' : 'Click to allow friends to interact'}
            >
              <Users size={13} />
              <span>{guestControl ? 'Co-Browse: ON' : 'Co-Browse: OFF'}</span>
            </button>
          )}

          <a
            href={`/browser?sessionId=${sessionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-icon-subtle"
            title="Open Workspaces Control Panel in new tab"
          >
            <ExternalLink size={15} />
          </a>

          <button
            type="button"
            className="btn-icon-subtle"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Stage'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>

          {isHostOrMod && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              onClick={handleStopStream}
              title="Stop streaming browser to room"
            >
              <Square size={13} />
              <span>Stop Stream</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Stream Canvas Stage */}
      <div className="room-browser-canvas-wrapper">
        <canvas
          ref={canvasRef}
          className="room-browser-canvas"
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Initial Loading Overlay */}
        {!hasReceivedFrame && (
          <div className="room-browser-loading-overlay">
            <div className="room-browser-loading-spinner" />
            <h3>Connecting to Temporary Browser Stream...</h3>
            <p>Initializing secure Chromium viewport with zero-latency screen piping.</p>
          </div>
        )}

        {/* Co-browse banner overlay */}
        <div className="room-browser-status-overlay">
          <div className="room-browser-status-pill">
            <span className="live-dot" />
            <span className="status-text">
              {canInteract ? 'Interactive Control Active' : 'View Only (Host Controlled)'}
            </span>
            <span className="status-divider">•</span>
            <span className="status-fps">{fps} FPS</span>
          </div>
        </div>
      </div>

      {/* Bottom Security / Guidance Banner */}
      <div className="room-browser-footer-banner">
        <div className="footer-security-left">
          <ShieldCheck size={14} className="text-cyan" />
          <span>
            <strong>Isolated Cloud Sandbox:</strong> Protected by in-flight SSRF firewall. Credentials, cookies, and local data are 100% ephemeral and automatically purged.
          </span>
        </div>
        <div className="footer-security-right">
          <Sparkles size={13} className="text-yellow" />
          <span>Shared Cinema Watch Party</span>
        </div>
      </div>
    </div>
  );
};
