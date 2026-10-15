import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Home,
  Shield,
  Trash2,
  Lock,
  ExternalLink,
  AlertTriangle,
  Clock,
  Sparkles,
  Zap,
  CheckCircle,
  X,
  Maximize2,
  Minimize2,
  Sliders,
  Share2,
  Tv,
  Radio,
} from 'lucide-react';
import {
  createBrowserSession,
  deleteBrowserSession,
  connectBrowserSocket,
  SessionInfo,
} from '../services/tempBrowserApi.js';
import { BrowserControlPanel } from '../components/BrowserControlPanel.js';
import type { Socket } from 'socket.io-client';

interface TemporaryBrowserPageProps {
  onBackToHome: () => void;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const PRESET_DESTINATIONS = [
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', icon: '🦆', desc: 'Private web search' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org', icon: '📚', desc: 'Free encyclopedia' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com', icon: '📰', desc: 'Tech & developer news' },
  { name: 'Archive.org', url: 'https://archive.org', icon: '🏛️', desc: 'Digital library & media' },
  { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org', icon: '🗺️', desc: 'Open collaborative maps' },
];

export function TemporaryBrowserPage({ onBackToHome, onNotify }: TemporaryBrowserPageProps) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [inputUrl, setInputUrl] = useState('https://duckduckgo.com');
  const [addressBarValue, setAddressBarValue] = useState('');
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [pageTitle, setPageTitle] = useState('Temporary Browser');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(900); // 15 mins default
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(false);
  const [castRoomId, setCastRoomId] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get('roomId') || '';
  });
  const [isCastModalOpen, setIsCastModalOpen] = useState(false);
  const [isCastingToRoom, setIsCastingToRoom] = useState(false);
  const [activeCastRoom, setActiveCastRoom] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMoveSentRef = useRef<number>(0);

  const handleStartCast = () => {
    const target = castRoomId.trim().toUpperCase();
    if (!target) {
      onNotify('Please enter a valid SyncTube Room ID to cast.', 'error');
      return;
    }
    if (socketRef.current && session && token) {
      socketRef.current.emit(
        'browser:cast_to_room',
        {
          sessionId: session.id,
          sessionToken: token,
          roomId: target,
          guestControl: true,
        },
        (res: any) => {
          if (res?.success) {
            setIsCastingToRoom(true);
            setActiveCastRoom(target);
            setIsCastModalOpen(false);
            onNotify(`Screen is now streaming into Room ${target}! Friends can watch with you. 🍿`, 'success');
          } else {
            onNotify(res?.error || 'Failed to cast to room.', 'error');
          }
        }
      );
    }
  };

  const handleStopCast = () => {
    if (socketRef.current && session && token && activeCastRoom) {
      socketRef.current.emit(
        'browser:stop_cast',
        {
          sessionId: session.id,
          sessionToken: token,
          roomId: activeCastRoom,
        },
        () => {
          setIsCastingToRoom(false);
          setActiveCastRoom(null);
          onNotify('Stream stopped for the room.', 'info');
        }
      );
    }
  };

  const attachSocketConnection = (sessionId: string, sessionToken: string) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    const socket = connectBrowserSocket(sessionId, sessionToken, {
      onConnect: () => {
        setIsConnected(true);
      },
      onDisconnect: () => {
        setIsConnected(false);
      },
      onFrame: ({ data }) => {
        setFrameSrc(`data:image/jpeg;base64,${data}`);
      },
      onNavigated: (nav) => {
        setAddressBarValue(nav.url);
        setPageTitle(nav.title || nav.url);
        setIsLoadingPage(nav.isLoading);
        setCanGoBack(nav.canGoBack);
        setCanGoForward(nav.canGoForward);
      },
      onClosed: () => {
        sessionStorage.removeItem('synctube_active_tb_session');
        onNotify('Temporary browser session closed and memory wiped.', 'info');
        cleanupClientState();
      },
    });
    socketRef.current = socket;
    return socket;
  };

  // Check for existing active session on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const querySessionId = urlParams.get('session');
    const queryToken = urlParams.get('token');

    let activeData: { session: SessionInfo; token: string } | null = null;
    if (querySessionId && queryToken) {
      activeData = {
        session: {
          id: querySessionId,
          createdAt: Date.now(),
          expiresAt: Date.now() + 15 * 60 * 1000,
          currentUrl: 'https://duckduckgo.com',
          currentTitle: 'Shared Session',
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          viewport: { width: 1280, height: 800 },
        },
        token: queryToken,
      };
    } else {
      const stored = sessionStorage.getItem('synctube_active_tb_session');
      if (stored) {
        try {
          activeData = JSON.parse(stored);
        } catch {
          // ignore
        }
      }
    }

    if (activeData?.session?.id && activeData.token) {
      setSession(activeData.session);
      setToken(activeData.token);
      setAddressBarValue(activeData.session.currentUrl || 'https://duckduckgo.com');
      setPageTitle(activeData.session.currentTitle || 'Temporary Browser');
      attachSocketConnection(activeData.session.id, activeData.token);
      onNotify('Resumed active Workspaces session ⚡', 'info');
    }
  }, []);

  // Countdown timer for active session
  useEffect(() => {
    if (session) {
      const calcRemaining = () => {
        const diff = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
        setRemainingSeconds(diff);
        if (diff <= 0) {
          handleCloseSession(true);
        }
      };
      calcRemaining();
      timerRef.current = setInterval(calcRemaining, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleStartSession = async (startUrl = inputUrl) => {
    setIsStarting(true);
    try {
      const { session: newSession, token: newToken } = await createBrowserSession(startUrl, {
        width: 1280,
        height: 800,
      });

      setSession(newSession);
      setToken(newToken);
      setAddressBarValue(newSession.currentUrl);
      setPageTitle(newSession.currentTitle);
      setIsLoadingPage(true);
      sessionStorage.setItem('synctube_active_tb_session', JSON.stringify({ session: newSession, token: newToken }));
      onNotify('Isolated temporary browser session ready 🛡️', 'success');

      attachSocketConnection(newSession.id, newToken);
    } catch (err: any) {
      onNotify(err.message || 'Failed to start browser session', 'error');
    } finally {
      setIsStarting(false);
    }
  };

  const cleanupClientState = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSession(null);
    setToken(null);
    setFrameSrc(null);
    setIsConnected(false);
    setIsLoadingPage(false);
    setIsConfirmCloseOpen(false);
    setIsControlPanelOpen(false);
  };

  const handleLeaveSession = () => {
    if (session && token) {
      sessionStorage.setItem('synctube_active_tb_session', JSON.stringify({ session, token }));
      onNotify('Session kept running in background. You can resume anytime from Home.', 'info');
    }
    setIsControlPanelOpen(false);
    onBackToHome();
  };

  const handleLogOut = () => {
    sessionStorage.removeItem('synctube_active_tb_session');
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    cleanupClientState();
    onNotify('Logged out of Workspaces session.', 'info');
    onBackToHome();
  };

  const handleCloseSession = async (isExpired = false) => {
    sessionStorage.removeItem('synctube_active_tb_session');
    if (session && token) {
      try {
        await deleteBrowserSession(session.id, token);
      } catch {
        // ignore errors during cleanup
      }
      cleanupClientState();
      onNotify(
        isExpired
          ? 'Temporary browser session expired and was securely deleted.'
          : 'Session securely closed. Remote container and profiles permanently wiped.',
        'success'
      );
    }
  };

  const handleNavigate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!socketRef.current || !session || !token) return;

    let target = addressBarValue.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) {
      target = 'https://' + target;
      setAddressBarValue(target);
    }

    setIsLoadingPage(true);
    socketRef.current.emit(
      'browser:navigate',
      { sessionId: session.id, sessionToken: token, url: target },
      (res: any) => {
        if (!res?.success) {
          setIsLoadingPage(false);
          onNotify(res?.error || 'Navigation blocked or failed.', 'error');
        }
      }
    );
  };

  const handleGoBack = () => {
    if (socketRef.current && session && token) {
      socketRef.current.emit('browser:back', { sessionId: session.id, sessionToken: token });
    }
  };

  const handleGoForward = () => {
    if (socketRef.current && session && token) {
      socketRef.current.emit('browser:forward', { sessionId: session.id, sessionToken: token });
    }
  };

  const handleReload = () => {
    if (socketRef.current && session && token) {
      setIsLoadingPage(true);
      socketRef.current.emit('browser:reload', { sessionId: session.id, sessionToken: token });
    }
  };

  const handleGoHome = () => {
    if (socketRef.current && session && token) {
      setAddressBarValue('https://duckduckgo.com');
      socketRef.current.emit(
        'browser:navigate',
        { sessionId: session.id, sessionToken: token, url: 'https://duckduckgo.com' },
        () => {}
      );
    }
  };

  // Convert client viewport coordinates to remote browser coordinates (1280x800)
  const getBrowserCoords = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return { x: 0, y: 0 };
    const rect = viewportRef.current.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = Math.max(0, Math.min(1280, (e.clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(800, (e.clientY - rect.top) * scaleY));
    return { x: Math.round(x), y: Math.round(y) };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    // Throttle mouse moves to ~30fps
    if (now - lastMoveSentRef.current < 33) return;
    lastMoveSentRef.current = now;

    if (socketRef.current && session && token) {
      const { x, y } = getBrowserCoords(e);
      socketRef.current.emit('browser:mouse_move', {
        sessionId: session.id,
        sessionToken: token,
        x,
        y,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (socketRef.current && session && token) {
      const { x, y } = getBrowserCoords(e);
      const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
      socketRef.current.emit('browser:mouse_down', {
        sessionId: session.id,
        sessionToken: token,
        x,
        y,
        button,
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (socketRef.current && session && token) {
      const { x, y } = getBrowserCoords(e);
      const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
      socketRef.current.emit('browser:mouse_up', {
        sessionId: session.id,
        sessionToken: token,
        x,
        y,
        button,
      });
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (socketRef.current && session && token) {
      const { x, y } = getBrowserCoords(e);
      const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
      socketRef.current.emit('browser:click', {
        sessionId: session.id,
        sessionToken: token,
        x,
        y,
        button,
        clickCount: 1,
      });
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (socketRef.current && session && token) {
      socketRef.current.emit('browser:wheel', {
        sessionId: session.id,
        sessionToken: token,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Avoid capturing shortcuts if user is typing in address bar
    if (document.activeElement?.tagName === 'INPUT') return;

    if (socketRef.current && session && token) {
      socketRef.current.emit('browser:key_down', {
        sessionId: session.id,
        sessionToken: token,
        key: e.key,
      });
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (document.activeElement?.tagName === 'INPUT') return;

    if (socketRef.current && session && token) {
      socketRef.current.emit('browser:key_up', {
        sessionId: session.id,
        sessionToken: token,
        key: e.key,
      });
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`temp-browser-layout ${isFullscreen ? 'temp-browser-fullscreen' : ''}`}>
      {/* Top Application Header */}
      <header className="temp-browser-app-header">
        <div className="temp-browser-header-left">
          <button
            type="button"
            className="btn-icon"
            onClick={onBackToHome}
            title="Return to SyncTube Home"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="temp-browser-brand">
            <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
              <Globe size={18} color="#fff" />
            </div>
            <span className="brand-title">Temporary Browser</span>
            <span className="badge badge-purple" style={{ fontSize: '10px', padding: '2px 8px' }}>
              Incognito Sandbox
            </span>
          </div>
        </div>

        <div className="temp-browser-header-right">
          {session ? (
            <>
              {/* Session timer */}
              <div
                className="session-timer-pill"
                title="Automatic security expiration countdown"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontVariantNumeric: 'tabular-nums',
                  color: remainingSeconds < 120 ? '#f87171' : 'var(--text-secondary, #cbd5e1)',
                }}
              >
                <Clock size={14} color={remainingSeconds < 120 ? '#f87171' : '#38bdf8'} />
                <span>Expires in {formatCountdown(remainingSeconds)}</span>
              </div>

              {/* Status Indicator */}
              <div
                className="status-pill"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                  border: isConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(234, 179, 8, 0.3)',
                  padding: '5px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: isConnected ? '#34d399' : '#facc15',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isConnected ? '#10b981' : '#eab308',
                    boxShadow: isConnected ? '0 0 8px #10b981' : 'none',
                  }}
                />
                <span>{isConnected ? 'Live Stream' : 'Connecting...'}</span>
              </div>

              {/* Cast to Watch Party Room Button */}
              {isCastingToRoom ? (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleStopCast}
                  title="Click to stop streaming into room"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(239, 68, 68, 0.25)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#fca5a5',
                    fontWeight: 600,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <Radio size={14} className="animate-pulse" />
                  <span>Streaming: {activeCastRoom}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsCastModalOpen(true)}
                  title="Stream this screen into a SyncTube room"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(168, 85, 247, 0.2)',
                    border: '1px solid rgba(168, 85, 247, 0.4)',
                    color: '#d8b4fe',
                    fontWeight: 600,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <Tv size={14} />
                  <span>Cast to Room</span>
                </button>
              )}

              {/* Control Panel Button */}
              <button
                type="button"
                className="btn btn-primary btn-sm control-panel-header-btn"
                onClick={() => setIsControlPanelOpen(true)}
                title="Open Workspaces Control Panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '12px',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
                  cursor: 'pointer',
                }}
              >
                <Sliders size={14} />
                <span>Control Panel</span>
              </button>

              {/* Fullscreen toggle */}
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              {/* Close & Delete Session Button */}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setIsConfirmCloseOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.3))',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={14} />
                <span>Close & Delete Session</span>
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)' }}>
                Zero-trace browsing session
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      {!session ? (
        /* Landing / Pre-session Launcher Screen */
        <main className="temp-browser-landing">
          <div className="temp-browser-hero">
            <div className="hero-badge-group">
              <div className="hero-pill">
                <Shield size={14} color="#38bdf8" />
                <span>Zero-Trace Remote Sandbox</span>
              </div>
              <div className="hero-pill hero-pill-latency">
                <Zap size={14} color="#8b5cf6" />
                <span>Remote Chromium Compositor</span>
              </div>
            </div>

            <h1 className="hero-title" style={{ fontSize: '2.5rem', marginBottom: '12px' }}>
              Browse Any Site with <span className="hero-highlight">Total Ephemeral Privacy</span>
            </h1>

            <p style={{ maxWidth: 640, margin: '0 auto 28px', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.6 }}>
              Spawns an isolated Chromium browser instance on our server, streams live interactive frames to your screen, and completely wipes cookies, cache, and history the second you close the session.
            </p>

            {/* Quick URL Start Form */}
            <div
              className="temp-browser-start-card"
              style={{
                maxWidth: 580,
                margin: '0 auto',
                background: 'rgba(23, 25, 38, 0.7)',
                backdropFilter: 'blur(16px)',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
              }}
            >
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', textAlign: 'left' }}>
                Enter Starting Website URL
              </label>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Lock size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-dim, #64748b)' }} />
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="e.g. duckduckgo.com or wikipedia.org"
                    className="input-field"
                    style={{
                      width: '100%',
                      paddingLeft: '36px',
                      background: 'rgba(0,0,0,0.3)',
                      borderColor: 'rgba(255,255,255,0.12)',
                      color: '#fff',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleStartSession();
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleStartSession()}
                  disabled={isStarting}
                  style={{ whiteSpace: 'nowrap', minWidth: 160 }}
                >
                  {isStarting ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RotateCw size={15} className="spin" /> Spawning...
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={15} /> Start Session
                    </span>
                  )}
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
                  Quick Launch Presets:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {PRESET_DESTINATIONS.map((dest) => (
                    <button
                      key={dest.name}
                      type="button"
                      onClick={() => {
                        setInputUrl(dest.url);
                        handleStartSession(dest.url);
                      }}
                      className="preset-chip"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'var(--text-primary, #f8fafc)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{dest.icon}</span>
                      <span>{dest.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Privacy Pillars Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                maxWidth: 860,
                margin: '40px auto 0',
                textAlign: 'left',
              }}
            >
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#38bdf8' }}>
                  <Shield size={16} />
                  <h4 style={{ margin: 0, fontSize: '14px' }}>100% Isolated Sandbox</h4>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.5 }}>
                  Every session launches a fresh Chromium profile with independent storage and clean cookies.
                </p>
              </div>

              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#a78bfa' }}>
                  <Trash2 size={16} />
                  <h4 style={{ margin: 0, fontSize: '14px' }}>Immediate Auto-Wipe</h4>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.5 }}>
                  Closing the session terminates the process and erases all temporary files and tokens from memory.
                </p>
              </div>

              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', color: '#34d399' }}>
                  <CheckCircle size={16} />
                  <h4 style={{ margin: 0, fontSize: '14px' }}>SSRF & LAN Protected</h4>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.5 }}>
                  Internal networks, localhost, private IPs, and cloud metadata endpoints are strictly blocked.
                </p>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* Active Browser Chrome & Remote Display */
        <main className="temp-browser-window">
          {/* Browser Navigation Toolbar */}
          <div className="browser-chrome-bar">
            {/* Back, Forward, Reload, Home Controls */}
            <div className="browser-nav-buttons">
              <button
                type="button"
                className="chrome-btn"
                onClick={handleGoBack}
                disabled={!canGoBack}
                title="Back"
              >
                <ArrowLeft size={16} />
              </button>

              <button
                type="button"
                className="chrome-btn"
                onClick={handleGoForward}
                disabled={!canGoForward}
                title="Forward"
              >
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                className="chrome-btn"
                onClick={handleReload}
                title="Reload page"
              >
                <RotateCw size={15} className={isLoadingPage ? 'spin' : ''} />
              </button>

              <button
                type="button"
                className="chrome-btn"
                onClick={handleGoHome}
                title="Home (DuckDuckGo)"
              >
                <Home size={15} />
              </button>
            </div>

            {/* Address Bar */}
            <form className="browser-address-bar-form" onSubmit={handleNavigate}>
              <div className="browser-address-bar-wrapper">
                <Lock size={13} color="#34d399" className="browser-lock-icon" />
                <input
                  type="text"
                  value={addressBarValue}
                  onChange={(e) => setAddressBarValue(e.target.value)}
                  className="browser-address-input"
                  placeholder="Search with DuckDuckGo or enter address..."
                  autoComplete="off"
                  spellCheck="false"
                />
                {isLoadingPage && <RotateCw size={14} className="spin browser-loading-spinner" />}
                <button type="submit" className="browser-go-btn" title="Navigate">
                  Go ➔
                </button>
              </div>
            </form>
          </div>

          {/* Browser Page Loading Progress Bar */}
          {isLoadingPage && <div className="browser-loading-bar" />}

          {/* Remote Interactive Browser Viewport */}
          <div
            className="browser-viewport-container"
            ref={viewportRef}
            tabIndex={0}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            {frameSrc ? (
              <img
                src={frameSrc}
                alt={pageTitle}
                className="browser-viewport-frame"
                draggable={false}
              />
            ) : (
              <div className="browser-viewport-placeholder">
                <RotateCw size={36} className="spin" color="#38bdf8" />
                <p>Connecting to remote Chromium compositor stream...</p>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Confirmation Modal Before Closing Session */}
      {isConfirmCloseOpen && (
        <div className="modal-backdrop" onClick={() => setIsConfirmCloseOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440, textAlign: 'center' }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <AlertTriangle size={26} />
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
              Close & Delete Browser Session?
            </h3>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #cbd5e1)', lineHeight: 1.5, marginBottom: '20px' }}>
              This will immediately terminate the remote Chromium instance. All browser profiles, active logins, cookies, temporary files, and browsing cache will be permanently wiped.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsConfirmCloseOpen(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleCloseSession(false)}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: '#fff',
                  border: 'none',
                }}
              >
                Confirm & Wipe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cast to Room Modal */}
      {isCastModalOpen && (
        <div className="modal-backdrop">
          <div
            className="modal-content"
            style={{
              maxWidth: '440px',
              padding: '28px',
              background: '#0f172a',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(168, 85, 247, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Tv size={22} color="#fff" />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                  Stream Screen to Room
                </h3>
                <p style={{ fontSize: '12px', margin: 0, color: '#94a3b8' }}>
                  Watch movies and series together with friends
                </p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '18px' }}>
              Enter your SyncTube Watch Party Room ID. This temporary browser viewport will stream directly to all members of that room in real-time!
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                SyncTube Room ID:
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. ALPHA, MOVIE-NIGHT..."
                value={castRoomId}
                onChange={(e) => setCastRoomId(e.target.value.toUpperCase())}
                autoFocus
                style={{
                  width: '100%',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  padding: '10px 14px',
                  fontSize: '15px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsCastModalOpen(false)}
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartCast}
                style={{
                  padding: '8px 20px',
                  background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600,
                }}
              >
                Start Cinema Stream
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspaces Control Panel Drawer */}
      {session && token && (
        <BrowserControlPanel
          isOpen={isControlPanelOpen}
          onClose={() => setIsControlPanelOpen(false)}
          session={session}
          token={token}
          socket={socketRef.current}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          onLeaveSession={handleLeaveSession}
          onLogOut={handleLogOut}
          onDeleteSession={() => setIsConfirmCloseOpen(true)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
