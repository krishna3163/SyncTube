import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Maximize,
  Minimize,
  Clipboard,
  Printer,
  Download,
  Monitor,
  Sliders,
  Share2,
  LogOut,
  Trash2,
  ArrowLeft,
  RefreshCw,
  Check,
  Copy,
  ExternalLink,
  Shield,
  Activity,
  Sparkles,
  FileText,
  Smartphone,
  Laptop,
  Layers,
  Video,
  CheckCircle2,
  AlertCircle,
  Tv,
  Radio,
} from 'lucide-react';
import type { Socket } from 'socket.io-client';
import {
  SessionInfo,
  DownloadedFileInfo,
  printBrowserPdf,
  getBrowserDownloads,
  getDownloadFileUrl,
} from '../services/tempBrowserApi.js';

interface BrowserControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionInfo;
  token: string;
  socket: Socket | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onLeaveSession: () => void;
  onLogOut: () => void;
  onDeleteSession: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type TabType = 'media' | 'clipboard' | 'displays' | 'share' | 'advanced';

const RESOLUTION_PRESETS = [
  { label: '1280 × 800 (16:10 Standard)', width: 1280, height: 800 },
  { label: '1920 × 1080 (1080p Full HD)', width: 1920, height: 1080 },
  { label: '1440 × 900 (Widescreen HD)', width: 1440, height: 900 },
  { label: '1366 × 768 (Laptop Standard)', width: 1366, height: 768 },
];

const USER_AGENT_PRESETS = [
  {
    name: 'Chrome Desktop (Linux Default)',
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SyncTube/2.0',
    icon: Laptop,
  },
  {
    name: 'Chrome Windows 11',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    icon: Laptop,
  },
  {
    name: 'Safari macOS (Sonoma)',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    icon: Laptop,
  },
  {
    name: 'iPhone Safari (Mobile iOS 17)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    icon: Smartphone,
  },
  {
    name: 'Firefox Desktop',
    ua: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    icon: Laptop,
  },
];

export function BrowserControlPanel({
  isOpen,
  onClose,
  session,
  token,
  socket,
  isFullscreen,
  onToggleFullscreen,
  onLeaveSession,
  onLogOut,
  onDeleteSession,
  onNotify,
}: BrowserControlPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('media');

  // Media states
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(100);
  const [micEnabled, setMicEnabled] = useState(false);
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [webcamResolution, setWebcamResolution] = useState('720p');
  const [webcamFps, setWebcamFps] = useState('30');
  const [webcamFilter, setWebcamFilter] = useState<'normal' | 'blur' | 'shield'>('normal');
  const [webcamMirrored, setWebcamMirrored] = useState(true);

  // Video preview ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Clipboard states
  const [scratchpadText, setScratchpadText] = useState('');
  const [autoClipboardSync, setAutoClipboardSync] = useState(true);
  const [isCopyingRemote, setIsCopyingRemote] = useState(false);
  const [isSendingToRemote, setIsSendingToRemote] = useState(false);

  // Printer & Downloads states
  const [isPrintingPdf, setIsPrintingPdf] = useState(false);
  const [downloadsList, setDownloadsList] = useState<DownloadedFileInfo[]>([]);
  const [isLoadingDownloads, setIsLoadingDownloads] = useState(false);

  // Displays states
  const [selectedWidth, setSelectedWidth] = useState(session.viewport.width || 1280);
  const [selectedHeight, setSelectedHeight] = useState(session.viewport.height || 800);
  const [secondaryDisplayEnabled, setSecondaryDisplayEnabled] = useState(false);
  const [displayLayout, setDisplayLayout] = useState<'side' | 'stacked'>('side');

  // Streaming Quality states
  const [qualityPreset, setQualityPreset] = useState<'high' | 'balanced' | 'saver'>('balanced');
  const [jpegQuality, setJpegQuality] = useState(70);
  const [targetFps, setTargetFps] = useState(30);

  // Sharing states
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharePermission, setSharePermission] = useState<'interactive' | 'viewonly'>('interactive');
  const [castRoomId, setCastRoomId] = useState('');
  const [isCastingToRoom, setIsCastingToRoom] = useState(false);
  const [activeCastRoom, setActiveCastRoom] = useState<string | null>(null);

  const handleCastToRoom = () => {
    const target = castRoomId.trim().toUpperCase();
    if (!target) {
      onNotify('Please enter a valid SyncTube Room ID to cast.', 'error');
      return;
    }
    if (socket) {
      socket.emit(
        'browser:cast_to_room',
        {
          sessionId: session.id,
          sessionToken: token,
          roomId: target,
          guestControl: sharePermission === 'interactive',
        },
        (res: any) => {
          if (res?.success) {
            setIsCastingToRoom(true);
            setActiveCastRoom(target);
            onNotify(`Streaming live into Room ${target}! All your friends can now watch together. 🍿`, 'success');
          } else {
            onNotify(res?.error || 'Failed to cast browser to room.', 'error');
          }
        }
      );
    }
  };

  const handleStopRoomCast = () => {
    if (socket && activeCastRoom) {
      socket.emit(
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

  // Advanced states
  const [rttPing, setRttPing] = useState<number | null>(null);
  const [selectedUserAgent, setSelectedUserAgent] = useState(session.userAgent || USER_AGENT_PRESETS[0].ua);

  // RTT Ping interval
  useEffect(() => {
    if (!isOpen || !socket) return;
    const sendPing = () => {
      const start = Date.now();
      socket.emit('browser:ping', { timestamp: start }, () => {
        setRttPing(Date.now() - start);
      });
    };
    sendPing();
    const interval = setInterval(sendPing, 4000);
    return () => clearInterval(interval);
  }, [isOpen, socket]);

  // Load downloads on open or tab switch
  useEffect(() => {
    if (isOpen && activeTab === 'clipboard') {
      loadDownloads();
    }
  }, [isOpen, activeTab]);

  // Listen for socket download events
  useEffect(() => {
    if (!socket) return;
    const handleDownloadAdded = (file: DownloadedFileInfo) => {
      setDownloadsList((prev) => [file, ...prev]);
      onNotify(`File downloaded in session: ${file.name}`, 'info');
    };
    socket.on('browser:download_added', handleDownloadAdded);
    return () => {
      socket.off('browser:download_added', handleDownloadAdded);
    };
  }, [socket, onNotify]);

  // Webcam stream management
  useEffect(() => {
    if (webcamEnabled && isOpen) {
      navigator.mediaDevices
        ?.getUserMedia({
          video: {
            width: webcamResolution === '1080p' ? 1920 : webcamResolution === '720p' ? 1280 : 640,
            frameRate: parseInt(webcamFps, 10),
          },
          audio: false,
        })
        .then((stream) => {
          mediaStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.warn('Webcam access not allowed or unavailable:', err);
          onNotify('Webcam access was not granted by browser.', 'error');
          setWebcamEnabled(false);
        });
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [webcamEnabled, webcamResolution, webcamFps, isOpen]);

  const loadDownloads = async () => {
    setIsLoadingDownloads(true);
    try {
      const files = await getBrowserDownloads(session.id, token);
      setDownloadsList(files);
    } catch {
      // ignore
    } finally {
      setIsLoadingDownloads(false);
    }
  };

  // Sync media toggles to backend
  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    if (socket) {
      socket.emit('browser:set_media', {
        sessionId: session.id,
        sessionToken: token,
        sound: enabled,
      });
    }
  };

  const handleToggleMic = (enabled: boolean) => {
    setMicEnabled(enabled);
    if (socket) {
      socket.emit('browser:set_media', {
        sessionId: session.id,
        sessionToken: token,
        mic: enabled,
      });
    }
  };

  const handleToggleWebcam = (enabled: boolean) => {
    setWebcamEnabled(enabled);
    if (socket) {
      socket.emit('browser:set_media', {
        sessionId: session.id,
        sessionToken: token,
        webcam: enabled,
      });
    }
  };

  // Streaming quality change
  const handleQualityPreset = (preset: 'high' | 'balanced' | 'saver') => {
    setQualityPreset(preset);
    let q = 70;
    let fps = 30;
    if (preset === 'high') {
      q = 85;
      fps = 60;
    } else if (preset === 'saver') {
      q = 45;
      fps = 15;
    }
    setJpegQuality(q);
    setTargetFps(fps);
    if (socket) {
      socket.emit('browser:set_quality', {
        sessionId: session.id,
        sessionToken: token,
        quality: q,
        fps,
      });
    }
    onNotify(`Streaming set to ${preset.toUpperCase()} (${q}% JPEG @ ${fps} FPS)`, 'info');
  };

  const handleManualQuality = (q: number, fps: number) => {
    setJpegQuality(q);
    setTargetFps(fps);
    if (socket) {
      socket.emit('browser:set_quality', {
        sessionId: session.id,
        sessionToken: token,
        quality: q,
        fps,
      });
    }
  };

  // Displays resolution change
  const handleApplyResolution = (w: number, h: number) => {
    setSelectedWidth(w);
    setSelectedHeight(h);
    if (socket) {
      socket.emit('browser:resize', {
        sessionId: session.id,
        sessionToken: token,
        width: w,
        height: h,
      });
    }
    onNotify(`Display resized to ${w} × ${h}`, 'success');
  };

  // Clipboard operations
  const handleSendClipboard = async () => {
    setIsSendingToRemote(true);
    let textToSend = scratchpadText;
    if (!textToSend && navigator.clipboard) {
      try {
        textToSend = await navigator.clipboard.readText();
      } catch {
        // fallback
      }
    }
    if (!textToSend) {
      setIsSendingToRemote(false);
      onNotify('No text found in clipboard or scratchpad.', 'error');
      return;
    }

    if (socket) {
      socket.emit(
        'browser:clipboard_send',
        { sessionId: session.id, sessionToken: token, text: textToSend },
        (res: any) => {
          setIsSendingToRemote(false);
          if (res?.success) {
            onNotify('Clipboard transferred to remote session 📋', 'success');
          } else {
            onNotify('Failed to sync clipboard.', 'error');
          }
        }
      );
    } else {
      setIsSendingToRemote(false);
    }
  };

  const handleReadRemoteClipboard = () => {
    setIsCopyingRemote(true);
    if (socket) {
      socket.emit(
        'browser:clipboard_read',
        { sessionId: session.id, sessionToken: token },
        async (res: any) => {
          setIsCopyingRemote(false);
          const txt = res?.text;
          if (txt) {
            setScratchpadText(txt);
            if (navigator.clipboard) {
              await navigator.clipboard.writeText(txt).catch(() => {});
            }
            onNotify('Copied text from remote browser to host clipboard!', 'success');
          } else {
            onNotify('No text was selected or available in remote session.', 'info');
          }
        }
      );
    } else {
      setIsCopyingRemote(false);
    }
  };

  // Print to PDF
  const handlePrintToPdf = async () => {
    setIsPrintingPdf(true);
    try {
      const result = await printBrowserPdf(session.id, token);
      // Create local downloadable link
      const blob = new Blob([Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0))], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      loadDownloads();
      onNotify(`Printer redirection: ${result.filename} downloaded! 🖨️`, 'success');
    } catch (err: any) {
      onNotify(err?.message || 'Print to PDF failed', 'error');
    } finally {
      setIsPrintingPdf(false);
    }
  };

  // Share link copy
  const shareUrl = `${window.location.origin}/?session=${session.id}&token=${token}&mode=${sharePermission}`;
  const handleCopyShare = async () => {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
    setCopiedLink(true);
    onNotify('Session link copied to clipboard! Share it with friends.', 'success');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // User-Agent change
  const handleSelectUa = (ua: string) => {
    setSelectedUserAgent(ua);
    if (socket) {
      socket.emit('browser:set_user_agent', {
        sessionId: session.id,
        sessionToken: token,
        userAgent: ua,
      });
    }
    onNotify('User-Agent updated. Reload page to see changes.', 'info');
  };

  if (!isOpen) return null;

  return (
    <div className="control-panel-drawer-backdrop" onClick={onClose}>
      <div
        className="control-panel-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Workspaces Control Panel"
      >
        {/* Drawer Header */}
        <div className="control-panel-header">
          <div className="control-panel-title-area">
            <div className="control-panel-icon-badge">
              <Sliders size={20} color="#fff" />
            </div>
            <div>
              <h2 className="control-panel-title">Workspaces Control Panel</h2>
              <div className="control-panel-subtitle">
                <span>Session ID: {session.id.slice(0, 8)}...</span>
                <span className="control-panel-dot">•</span>
                <span style={{ color: '#34d399' }}>Live Compositor</span>
                {rttPing !== null && (
                  <>
                    <span className="control-panel-dot">•</span>
                    <span style={{ color: rttPing < 80 ? '#34d399' : '#facc15' }}>
                      {rttPing}ms RTT
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close Control Panel">
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="control-panel-tabs">
          <button
            type="button"
            className={`control-tab-btn ${activeTab === 'media' ? 'active' : ''}`}
            onClick={() => setActiveTab('media')}
          >
            <Video size={16} />
            <span>Media & Audio</span>
          </button>
          <button
            type="button"
            className={`control-tab-btn ${activeTab === 'clipboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('clipboard')}
          >
            <Clipboard size={16} />
            <span>Clipboard & Files</span>
            {downloadsList.length > 0 && (
              <span className="tab-badge">{downloadsList.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`control-tab-btn ${activeTab === 'displays' ? 'active' : ''}`}
            onClick={() => setActiveTab('displays')}
          >
            <Monitor size={16} />
            <span>Displays & Quality</span>
          </button>
          <button
            type="button"
            className={`control-tab-btn ${activeTab === 'share' ? 'active' : ''}`}
            onClick={() => setActiveTab('share')}
          >
            <Share2 size={16} />
            <span>Share Session</span>
          </button>
          <button
            type="button"
            className={`control-tab-btn ${activeTab === 'advanced' ? 'active' : ''}`}
            onClick={() => setActiveTab('advanced')}
          >
            <Layers size={16} />
            <span>Workspaces</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="control-panel-body">
          {/* TAB 1: MEDIA & DEVICES */}
          {activeTab === 'media' && (
            <div className="control-section-stack">
              {/* Sound Section */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    {soundEnabled ? (
                      <Volume2 size={18} color="#38bdf8" />
                    ) : (
                      <VolumeX size={18} color="#94a3b8" />
                    )}
                    <div>
                      <h3 className="control-card-title">Sound</h3>
                      <p className="control-card-desc">Audio redirection from remote browser to host</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${soundEnabled ? 'checked' : ''}`}
                    onClick={() => handleToggleSound(!soundEnabled)}
                    aria-label="Toggle sound"
                  >
                    <span className="toggle-switch-slider" />
                  </button>
                </div>

                {soundEnabled && (
                  <div className="control-card-body">
                    <div className="control-row">
                      <span className="control-label">Volume: {soundVolume}%</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={soundVolume}
                        onChange={(e) => setSoundVolume(parseInt(e.target.value, 10))}
                        className="control-slider"
                      />
                    </div>
                    <div className="control-meta-pill">
                      <CheckCircle2 size={13} color="#34d399" />
                      <span>Audio Redirection: Host Default Audio Sink Active</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Microphone Section */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    {micEnabled ? <Mic size={18} color="#10b981" /> : <MicOff size={18} color="#94a3b8" />}
                    <div>
                      <h3 className="control-card-title">Microphone</h3>
                      <p className="control-card-desc">Redirect host microphone input into remote session</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${micEnabled ? 'checked' : ''}`}
                    onClick={() => handleToggleMic(!micEnabled)}
                    aria-label="Toggle microphone"
                  >
                    <span className="toggle-switch-slider" />
                  </button>
                </div>

                {micEnabled && (
                  <div className="control-card-body">
                    <div className="mic-meter-container">
                      <span className="control-label">Live Input Level</span>
                      <div className="mic-meter-bar">
                        <div className="mic-meter-fill animate-meter" />
                      </div>
                    </div>
                    <div className="control-meta-pill">
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Microphone Redirection Active</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Webcam & Webcam Settings Section */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Camera size={18} color={webcamEnabled ? '#8b5cf6' : '#94a3b8'} />
                    <div>
                      <h3 className="control-card-title">Webcam</h3>
                      <p className="control-card-desc">Virtual webcam pass-through and live preview</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch ${webcamEnabled ? 'checked' : ''}`}
                    onClick={() => handleToggleWebcam(!webcamEnabled)}
                    aria-label="Toggle webcam"
                  >
                    <span className="toggle-switch-slider" />
                  </button>
                </div>

                {webcamEnabled && (
                  <div className="control-card-body">
                    {/* Live Preview Box */}
                    <div className="webcam-preview-box">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`webcam-preview-video ${
                          webcamMirrored ? 'webcam-mirrored' : ''
                        } ${webcamFilter === 'blur' ? 'filter-blur' : ''} ${
                          webcamFilter === 'shield' ? 'filter-shield' : ''
                        }`}
                      />
                      {webcamFilter === 'shield' && (
                        <div className="webcam-shield-overlay">
                          <Shield size={32} color="#a855f7" />
                          <span>Privacy Shield Active</span>
                        </div>
                      )}
                      <div className="webcam-live-indicator">
                        <span className="live-dot" /> LIVE PREVIEW
                      </div>
                    </div>

                    {/* Webcam Settings */}
                    <div className="webcam-settings-grid">
                      <div className="setting-control-group">
                        <label className="setting-label">Webcam Settings - Resolution</label>
                        <select
                          value={webcamResolution}
                          onChange={(e) => setWebcamResolution(e.target.value)}
                          className="control-select"
                        >
                          <option value="1080p">1080p Full HD</option>
                          <option value="720p">720p HD</option>
                          <option value="480p">480p SD</option>
                          <option value="360p">360p Low Bandwidth</option>
                        </select>
                      </div>

                      <div className="setting-control-group">
                        <label className="setting-label">Framerate</label>
                        <select
                          value={webcamFps}
                          onChange={(e) => setWebcamFps(e.target.value)}
                          className="control-select"
                        >
                          <option value="60">60 FPS</option>
                          <option value="30">30 FPS (Standard)</option>
                          <option value="15">15 FPS (Data Saver)</option>
                        </select>
                      </div>

                      <div className="setting-control-group">
                        <label className="setting-label">Privacy / Filter</label>
                        <select
                          value={webcamFilter}
                          onChange={(e) => setWebcamFilter(e.target.value as any)}
                          className="control-select"
                        >
                          <option value="normal">Normal (Pass-through)</option>
                          <option value="blur">Virtual Blur</option>
                          <option value="shield">Privacy Shield</option>
                        </select>
                      </div>

                      <div className="setting-control-group" style={{ display: 'flex', alignItems: 'center', marginTop: 22 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={webcamMirrored}
                            onChange={(e) => setWebcamMirrored(e.target.checked)}
                          />
                          Mirror Preview
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CLIPBOARD, PRINTER & DOWNLOADS */}
          {activeTab === 'clipboard' && (
            <div className="control-section-stack">
              {/* Clipboard Section */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Clipboard size={18} color="#38bdf8" />
                    <div>
                      <h3 className="control-card-title">Clipboard</h3>
                      <p className="control-card-desc">Sharing between host and session</p>
                    </div>
                  </div>
                  <div className="clipboard-sync-toggle">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={autoClipboardSync}
                        onChange={(e) => setAutoClipboardSync(e.target.checked)}
                      />
                      Auto-sync
                    </label>
                  </div>
                </div>

                <div className="control-card-body">
                  <p style={{ fontSize: 12, color: 'var(--text-secondary, #cbd5e1)', margin: '0 0 10px' }}>
                    Send text directly to remote browser active element, or retrieve selected text back to host:
                  </p>

                  <textarea
                    className="control-textarea"
                    placeholder="Host clipboard scratchpad... Type or paste text here to stage before sending"
                    rows={3}
                    value={scratchpadText}
                    onChange={(e) => setScratchpadText(e.target.value)}
                  />

                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleSendClipboard}
                      disabled={isSendingToRemote}
                      style={{ flex: 1 }}
                    >
                      {isSendingToRemote ? (
                        <>
                          <RefreshCw size={14} className="spin" /> Sending...
                        </>
                      ) : (
                        <>
                          <ArrowLeft size={14} style={{ transform: 'rotate(90deg)' }} /> Send to Session
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleReadRemoteClipboard}
                      disabled={isCopyingRemote}
                      style={{ flex: 1 }}
                    >
                      {isCopyingRemote ? (
                        <>
                          <RefreshCw size={14} className="spin" /> Reading...
                        </>
                      ) : (
                        <>
                          <Copy size={14} /> Fetch from Session
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Printer Redirection Section */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Printer size={18} color="#a78bfa" />
                    <div>
                      <h3 className="control-card-title">Printer Redirection</h3>
                      <p className="control-card-desc">Printer redirection is enabled</p>
                    </div>
                  </div>
                  <span className="badge badge-purple" style={{ fontSize: 11 }}>
                    Virtual PDF
                  </span>
                </div>

                <div className="control-card-body">
                  <p style={{ fontSize: 12, color: 'var(--text-secondary, #cbd5e1)', margin: '0 0 12px' }}>
                    Captures full high-resolution PDF printout of the remote browser page and transfers the file directly to your local computer.
                  </p>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handlePrintToPdf}
                    disabled={isPrintingPdf}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      justifyContent: 'center',
                    }}
                  >
                    {isPrintingPdf ? (
                      <>
                        <RefreshCw size={14} className="spin" /> Generating Virtual PDF...
                      </>
                    ) : (
                      <>
                        <Printer size={14} /> Download / Print Page to PDF
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Download Files Section */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Download size={18} color="#34d399" />
                    <div>
                      <h3 className="control-card-title">Download Files</h3>
                      <p className="control-card-desc">Download files captured during this session</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={loadDownloads}
                    title="Refresh Downloads"
                    disabled={isLoadingDownloads}
                  >
                    <RefreshCw size={14} className={isLoadingDownloads ? 'spin' : ''} />
                  </button>
                </div>

                <div className="control-card-body">
                  {downloadsList.length === 0 ? (
                    <div className="empty-downloads-placeholder">
                      <FileText size={24} color="#64748b" />
                      <p>No downloads recorded yet in this session.</p>
                      <span>Files downloaded inside the remote browser will appear here automatically.</span>
                    </div>
                  ) : (
                    <div className="downloads-list">
                      {downloadsList.map((file) => (
                        <div key={file.id} className="download-item">
                          <div className="download-item-info">
                            <FileText size={16} color="#38bdf8" />
                            <div>
                              <div className="download-filename">{file.name}</div>
                              <div className="download-filesize">
                                {(file.size / 1024).toFixed(1)} KB • {new Date(file.date).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                          <a
                            href={getDownloadFileUrl(session.id, token, file.name)}
                            download={file.name}
                            className="btn btn-sm btn-primary download-action-btn"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Download size={13} /> Download
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DISPLAYS & QUALITY & FULLSCREEN */}
          {activeTab === 'displays' && (
            <div className="control-section-stack">
              {/* Fullscreen Toggle Card */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    {isFullscreen ? <Minimize size={18} color="#38bdf8" /> : <Maximize size={18} color="#38bdf8" />}
                    <div>
                      <h3 className="control-card-title">Fullscreen</h3>
                      <p className="control-card-desc">Toggle immersive full-window display mode</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={onToggleFullscreen}
                  >
                    {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  </button>
                </div>
              </div>

              {/* Displays Section */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Monitor size={18} color="#a855f7" />
                    <div>
                      <h3 className="control-card-title">Displays</h3>
                      <p className="control-card-desc">Add and arrange multiple displays</p>
                    </div>
                  </div>
                </div>

                <div className="control-card-body">
                  <label className="setting-label">Display Resolution Preset</label>
                  <div className="resolution-preset-list">
                    {RESOLUTION_PRESETS.map((res) => {
                      const isCur =
                        selectedWidth === res.width && selectedHeight === res.height;
                      return (
                        <button
                          key={res.label}
                          type="button"
                          className={`res-preset-btn ${isCur ? 'active' : ''}`}
                          onClick={() => handleApplyResolution(res.width, res.height)}
                        >
                          <span>{res.label}</span>
                          {isCur && <Check size={14} color="#34d399" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Multi-display Canvas Widget */}
                  <div className="display-arrangement-box">
                    <div className="arrangement-header">
                      <span>Multi-Display Arrangement</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={secondaryDisplayEnabled}
                          onChange={(e) => setSecondaryDisplayEnabled(e.target.checked)}
                        />
                        Enable Virtual Extended Display
                      </label>
                    </div>

                    <div className="display-canvas-preview">
                      <div className="display-monitor-tile primary-display">
                        <Monitor size={16} />
                        <span>Display 1 (Primary)</span>
                        <small>{selectedWidth} × {selectedHeight}</small>
                      </div>

                      {secondaryDisplayEnabled && (
                        <div className="display-monitor-tile secondary-display">
                          <Monitor size={16} />
                          <span>Display 2 (Extended)</span>
                          <small>1920 × 1080</small>
                        </div>
                      )}
                    </div>

                    {secondaryDisplayEnabled && (
                      <div className="layout-picker-row">
                        <span style={{ fontSize: 12 }}>Arrangement:</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className={`layout-btn ${displayLayout === 'side' ? 'active' : ''}`}
                            onClick={() => setDisplayLayout('side')}
                          >
                            Side-by-side
                          </button>
                          <button
                            type="button"
                            className={`layout-btn ${displayLayout === 'stacked' ? 'active' : ''}`}
                            onClick={() => setDisplayLayout('stacked')}
                          >
                            Stacked
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Streaming Quality Section */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Activity size={18} color="#38bdf8" />
                    <div>
                      <h3 className="control-card-title">Streaming Quality</h3>
                      <p className="control-card-desc">Adjust CDP screencast encoding and framerate</p>
                    </div>
                  </div>
                </div>

                <div className="control-card-body">
                  <div className="quality-presets-group">
                    <button
                      type="button"
                      className={`quality-preset-btn ${qualityPreset === 'high' ? 'active' : ''}`}
                      onClick={() => handleQualityPreset('high')}
                    >
                      <Sparkles size={14} color="#38bdf8" />
                      <div>
                        <strong>High Quality</strong>
                        <small>85% JPEG • 60 FPS</small>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`quality-preset-btn ${qualityPreset === 'balanced' ? 'active' : ''}`}
                      onClick={() => handleQualityPreset('balanced')}
                    >
                      <Activity size={14} color="#10b981" />
                      <div>
                        <strong>Balanced</strong>
                        <small>70% JPEG • 30 FPS</small>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`quality-preset-btn ${qualityPreset === 'saver' ? 'active' : ''}`}
                      onClick={() => handleQualityPreset('saver')}
                    >
                      <Shield size={14} color="#f59e0b" />
                      <div>
                        <strong>Data Saver</strong>
                        <small>45% JPEG • 15 FPS</small>
                      </div>
                    </button>
                  </div>

                  <div className="custom-sliders-box">
                    <div className="control-row">
                      <span className="control-label">JPEG Compression: {jpegQuality}%</span>
                      <input
                        type="range"
                        min="25"
                        max="95"
                        value={jpegQuality}
                        onChange={(e) => handleManualQuality(parseInt(e.target.value, 10), targetFps)}
                        className="control-slider"
                      />
                    </div>

                    <div className="control-row">
                      <span className="control-label">Max Target Framerate: {targetFps} FPS</span>
                      <input
                        type="range"
                        min="10"
                        max="60"
                        step="5"
                        value={targetFps}
                        onChange={(e) => handleManualQuality(jpegQuality, parseInt(e.target.value, 10))}
                        className="control-slider"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SHARE INSTANCE / SHARE SESSION */}
          {activeTab === 'share' && (
            <div className="control-section-stack">
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Share2 size={18} color="#38bdf8" />
                    <div>
                      <h3 className="control-card-title">Share Instance / Share Session</h3>
                      <p className="control-card-desc">Invite colleagues or friends to join this browser</p>
                    </div>
                  </div>
                </div>

                <div className="control-card-body">
                  <div className="setting-control-group" style={{ marginBottom: 14 }}>
                    <label className="setting-label">Sharing Permissions</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        type="button"
                        className={`permission-btn ${sharePermission === 'interactive' ? 'active' : ''}`}
                        onClick={() => setSharePermission('interactive')}
                      >
                        <strong>Co-Browsing (Interactive)</strong>
                        <small>Guest can type and click</small>
                      </button>
                      <button
                        type="button"
                        className={`permission-btn ${sharePermission === 'viewonly' ? 'active' : ''}`}
                        onClick={() => setSharePermission('viewonly')}
                      >
                        <strong>View Only (Spectator)</strong>
                        <small>Guest can only view stream</small>
                      </button>
                    </div>
                  </div>

                  <div className="share-link-input-wrapper">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="share-link-input"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleCopyShare}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {copiedLink ? (
                        <>
                          <Check size={14} /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={14} /> Copy Link
                        </>
                      )}
                    </button>
                  </div>

                  <div className="share-security-notice">
                    <Shield size={14} color="#38bdf8" />
                    <span>The link provides direct access to this active ephemeral session until closed.</span>
                  </div>
                </div>
              </div>

              {/* Stream Directly into SyncTube Room */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Tv size={18} color="#a855f7" />
                    <div>
                      <h3 className="control-card-title">Stream into SyncTube Watch Party Room</h3>
                      <p className="control-card-desc">Cast this temporary browser screen directly to your friends</p>
                    </div>
                  </div>
                  {isCastingToRoom && (
                    <div className="live-cast-badge" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '4px 8px', borderRadius: 12, fontSize: 11, color: '#f87171', fontWeight: 600 }}>
                      <span className="live-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                      <span>CASTING: {activeCastRoom}</span>
                    </div>
                  )}
                </div>

                <div className="control-card-body">
                  <p style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginBottom: 12, lineHeight: 1.5 }}>
                    Enter your SyncTube Room ID to broadcast this entire temporary browser screen (including series/movie logins) in real-time so all room members can watch with live chat and synchronized reactions!
                  </p>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. ALPHA, MOVIE-NIGHT..."
                      value={castRoomId}
                      onChange={(e) => setCastRoomId(e.target.value.toUpperCase())}
                      disabled={isCastingToRoom}
                      style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
                    />
                    {isCastingToRoom ? (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={handleStopRoomCast}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        Stop Cast
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleCastToRoom}
                        style={{ whiteSpace: 'nowrap', background: 'linear-gradient(135deg, #a855f7, #6366f1)' }}
                      >
                        <Radio size={14} /> Cast to Room
                      </button>
                    )}
                  </div>

                  <div className="share-security-notice" style={{ background: 'rgba(168, 85, 247, 0.1)', borderColor: 'rgba(168, 85, 247, 0.2)' }}>
                    <Shield size={14} color="#c084fc" />
                    <span>Protected with SSRF subresource firewall. All credentials purged upon session termination.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ADVANCED SETTINGS & WORKSPACES */}
          {activeTab === 'advanced' && (
            <div className="control-section-stack">
              {/* Advanced Settings */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Sliders size={18} color="#38bdf8" />
                    <div>
                      <h3 className="control-card-title">Advanced Settings</h3>
                      <p className="control-card-desc">Network diagnostics, User-Agent, and sandbox policy</p>
                    </div>
                  </div>
                </div>

                <div className="control-card-body">
                  <div className="setting-control-group" style={{ marginBottom: 16 }}>
                    <label className="setting-label">Browser User-Agent Switcher</label>
                    <div className="ua-presets-list">
                      {USER_AGENT_PRESETS.map((uaItem) => {
                        const Icon = uaItem.icon;
                        const isSelected = selectedUserAgent === uaItem.ua;
                        return (
                          <button
                            key={uaItem.name}
                            type="button"
                            className={`ua-item-btn ${isSelected ? 'active' : ''}`}
                            onClick={() => handleSelectUa(uaItem.ua)}
                          >
                            <Icon size={15} color={isSelected ? '#38bdf8' : '#94a3b8'} />
                            <span>{uaItem.name}</span>
                            {isSelected && <Check size={13} color="#38bdf8" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Network Diagnostics */}
                  <div className="diagnostics-summary-grid">
                    <div className="diag-item">
                      <span className="diag-label">Round-Trip Latency (RTT)</span>
                      <span className="diag-val" style={{ color: '#34d399' }}>
                        {rttPing !== null ? `${rttPing} ms` : 'Measuring...'}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Network Protocol</span>
                      <span className="diag-val">WebSocket + Binary JPEG</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">SSRF Protection Engine</span>
                      <span className="diag-val" style={{ color: '#34d399' }}>Strict LAN/Loopback Block</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Sandbox Storage Mode</span>
                      <span className="diag-val" style={{ color: '#a78bfa' }}>Isolated Ephemeral Tempdir</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Workspaces Section */}
              <div className="control-card">
                <div className="control-card-header">
                  <div className="control-card-title-group">
                    <Layers size={18} color="#8b5cf6" />
                    <div>
                      <h3 className="control-card-title">Workspaces</h3>
                      <p className="control-card-desc">Session lifecycle and detachment options</p>
                    </div>
                  </div>
                </div>

                <div className="control-card-body">
                  <div className="workspaces-actions-list">
                    {/* Action 1: Leave this session */}
                    <div className="workspace-action-item">
                      <div className="action-text">
                        <strong>Leave this session</strong>
                        <p>Return to SyncTube homepage while keeping this remote session running in background. You can resume anytime before it expires.</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onLeaveSession}
                      >
                        <ArrowLeft size={14} /> Leave Session
                      </button>
                    </div>

                    {/* Action 2: Log Out of Workspaces */}
                    <div className="workspace-action-item">
                      <div className="action-text">
                        <strong>Log Out</strong>
                        <p>Disconnect from this Workspaces session client and clear cached token credentials.</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={onLogOut}
                      >
                        <LogOut size={14} /> Log Out
                      </button>
                    </div>

                    {/* Action 3: Delete Session completely */}
                    <div className="workspace-action-item danger-item">
                      <div className="action-text">
                        <strong style={{ color: '#fca5a5' }}>Delete Session</strong>
                        <p>Terminate the remote Chromium instance immediately and wipe all temporary profiles, cookies, cache, and downloads completely.</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={onDeleteSession}
                        style={{
                          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                          color: '#fff',
                          border: 'none',
                        }}
                      >
                        <Trash2 size={14} /> Delete completely
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
