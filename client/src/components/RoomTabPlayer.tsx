import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Share2,
  StopCircle,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Sparkles,
  Tv,
  Radio,
  Users,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { emitStopTabStream, emitStartTabStream, emitAdminForceStopScreenShare } from '../services/socket.js';
import type { Role } from '../types.js';

interface RoomTabPlayerProps {
  userRole: Role;
  userId?: string;
  roomId?: string;
  socket?: any;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
  onOpenBrowserHub?: () => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

export const RoomTabPlayer: React.FC<RoomTabPlayerProps> = ({
  userRole,
  userId,
  roomId,
  socket,
  onNotify,
  onOpenBrowserHub,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [, setStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [streamTitle, setStreamTitle] = useState<string>('Shared Screen');
  const [streamerName, setStreamerName] = useState<string>('User');
  const [streamerSocketId, setStreamerSocketId] = useState<string>('');
  const [viewerCount, setViewerCount] = useState<number>(0);

  // Host/Streamer WebRTC peer connections map: targetSocketId -> RTCPeerConnection
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingStreamerCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Viewer WebRTC peer connection
  const viewerPcRef = useRef<RTCPeerConnection | null>(null);
  const pendingViewerCandidates = useRef<RTCIceCandidateInit[]>([]);

  // Anyone who holds localStreamRef is the streamer; otherwise they are a viewer!
  const isStreamer = Boolean(localStreamRef.current) || (Boolean(streamerSocketId) && streamerSocketId === socket?.id);

  // Helper to create and negotiate WebRTC peer connection with a viewer
  const connectViewer = useCallback(async (viewerSocketId: string) => {
    if (!socket || !localStreamRef.current) return;

    try {
      const existing = peerConnectionsRef.current.get(viewerSocketId);
      if (existing) {
        existing.close();
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionsRef.current.set(viewerSocketId, pc);

      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('webrtc:ice_candidate', {
            targetSocketId: viewerSocketId,
            candidate: event.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peerConnectionsRef.current.delete(viewerSocketId);
          setViewerCount(peerConnectionsRef.current.size);
        } else if (pc.connectionState === 'connected') {
          setViewerCount(peerConnectionsRef.current.size);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('webrtc:offer', {
        targetSocketId: viewerSocketId,
        offer,
      });
    } catch (err) {
      console.error('[WebRTC ScreenShare] Failed to connect viewer:', err);
    }
  }, [socket]);

  const startScreenShare = async (customTitle?: string) => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        onNotify('Screen sharing is not supported in this browser.', 'error');
        return;
      }

      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          frameRate: { ideal: 30, max: 60 },
        } as any,
        audio: true,
      });

      setStream(mediaStream);
      localStreamRef.current = mediaStream;
      setIsSharing(true);
      setStreamerSocketId(socket?.id || '');
      const title = customTitle || 'Live Shared Screen';
      setStreamTitle(title);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }

      emitStartTabStream(title, (res) => {
        if (!res?.success && res?.error) {
          onNotify(res.error, 'error');
          stopScreenShare();
        }
      });

      mediaStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      onNotify('Your screen is now streaming live on the main stage!', 'success');
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        onNotify(`Failed to share screen: ${err.message || 'Permission denied'}`, 'error');
      }
    }
  };

  const stopScreenShare = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setStream(null);
    setIsSharing(false);

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingStreamerCandidates.current.clear();
    setViewerCount(0);

    emitStopTabStream();
    onNotify('Screen share stopped.', 'info');
  };

  // Socket Signaling Listeners
  useEffect(() => {
    if (!socket) return;

    // 1. Streamer received viewer request
    const onViewerJoined = (data: { viewerSocketId: string; viewerName?: string }) => {
      if (localStreamRef.current && data.viewerSocketId) {
        connectViewer(data.viewerSocketId);
        onNotify(`${data.viewerName || 'A friend'} is watching your screen`, 'info');
      }
    };

    // 2. Streamer received answer from viewer
    const onAnswer = async (data: { fromSocketId: string; answer: any }) => {
      if (localStreamRef.current && data.fromSocketId && data.answer) {
        const pc = peerConnectionsRef.current.get(data.fromSocketId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            const queued = pendingStreamerCandidates.current.get(data.fromSocketId) || [];
            for (const cand of queued) {
              try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
            }
            pendingStreamerCandidates.current.delete(data.fromSocketId);
          } catch (e) {
            console.error('[WebRTC ScreenShare] Error setting answer:', e);
          }
        }
      }
    };

    // 3. Viewer received offer from streamer
    const onOffer = async (data: { fromSocketId: string; offer: any }) => {
      if (!localStreamRef.current && data.offer && data.fromSocketId) {
        try {
          if (viewerPcRef.current) {
            viewerPcRef.current.close();
          }

          const pc = new RTCPeerConnection(RTC_CONFIG);
          viewerPcRef.current = pc;

          pc.ontrack = (event) => {
            if (videoRef.current && event.streams[0]) {
              videoRef.current.srcObject = event.streams[0];
              setIsSharing(true);
              const playPromise = videoRef.current.play();
              if (playPromise !== undefined) {
                playPromise.catch((err) => {
                  console.warn('[WebRTC ScreenShare] Unmuted autoplay restricted on mobile:', err);
                  if (videoRef.current) {
                    videoRef.current.muted = true;
                    setIsMuted(true);
                    videoRef.current.play()
                      .then(() => setAutoplayBlocked(true))
                      .catch(() => setAutoplayBlocked(true));
                  }
                });
              }
            }
          };

          pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
              socket.emit('webrtc:ice_candidate', {
                targetSocketId: data.fromSocketId,
                candidate: event.candidate,
              });
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const queued = pendingViewerCandidates.current;
          for (const cand of queued) {
            try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
          }
          pendingViewerCandidates.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('webrtc:answer', {
            targetSocketId: data.fromSocketId,
            answer,
          });
        } catch (e) {
          console.error('[WebRTC ScreenShare] Error processing offer:', e);
        }
      }
    };

    // 4. ICE candidate received
    const onIceCandidate = async (data: { fromSocketId: string; candidate: any }) => {
      try {
        if (!data.candidate) return;
        if (localStreamRef.current) {
          const pc = peerConnectionsRef.current.get(data.fromSocketId);
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            if (!pendingStreamerCandidates.current.has(data.fromSocketId)) {
              pendingStreamerCandidates.current.set(data.fromSocketId, []);
            }
            pendingStreamerCandidates.current.get(data.fromSocketId)!.push(data.candidate);
          }
        } else if (viewerPcRef.current) {
          if (viewerPcRef.current.remoteDescription && viewerPcRef.current.remoteDescription.type) {
            await viewerPcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            pendingViewerCandidates.current.push(data.candidate);
          }
        }
      } catch (e) {
        console.error('[WebRTC ScreenShare] Error adding ICE candidate:', e);
      }
    };

    const onStreamStarted = (data: { streamerSocketId?: string; streamerName?: string; title?: string }) => {
      if (data.title) setStreamTitle(data.title);
      if (data.streamerName) setStreamerName(data.streamerName);
      if (data.streamerSocketId) setStreamerSocketId(data.streamerSocketId);

      if (data.streamerSocketId !== socket.id) {
        onNotify(`${data.streamerName || 'A friend'} is sharing their screen!`, 'info');
        socket.emit('webrtc:request_stream', { streamerSocketId: data.streamerSocketId });
      }
    };

    const onStreamStopped = () => {
      setIsSharing(false);
      if (viewerPcRef.current) {
        viewerPcRef.current.close();
        viewerPcRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      onNotify('Screen share ended.', 'info');
    };

    const onForceStop = () => {
      if (localStreamRef.current) {
        stopScreenShare();
        onNotify('Your screen share was stopped by the room host.', 'info');
      }
    };

    socket.on('webrtc:viewer_joined', onViewerJoined);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:ice_candidate', onIceCandidate);
    socket.on('room:tab_stream_started', onStreamStarted);
    socket.on('room:tab_stream_stopped', onStreamStopped);
    socket.on('call:force_stop_screenshare', onForceStop);

    // Initial stream request for viewer upon mount
    if (!localStreamRef.current) {
      socket.emit('webrtc:request_stream', {});
    }

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNCTUBE_START_TAB_SHARE') {
        startScreenShare(event.data.tabTitle);
      }
    };
    window.addEventListener('message', handleWindowMessage);

    return () => {
      socket.off('webrtc:viewer_joined', onViewerJoined);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:ice_candidate', onIceCandidate);
      socket.off('room:tab_stream_started', onStreamStarted);
      socket.off('room:tab_stream_stopped', onStreamStopped);
      socket.off('call:force_stop_screenshare', onForceStop);
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [socket, connectViewer, onNotify]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
      if (!videoRef.current.muted) {
        setAutoplayBlocked(false);
      }
    }
  };

  const handleUserInteractPlay = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
      videoRef.current.play().catch(() => {});
      setAutoplayBlocked(false);
    }
  };

  const toggleFullscreen = () => {
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
      className={`room-tab-player-container ${isFullscreen ? 'is-fullscreen' : ''}`}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        minHeight: 0,
        background: '#090d16',
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '9999px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>
            <Radio size={11} color="#ef4444" /> LIVE
          </span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {streamTitle}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {isStreamer ? (
            <button
              type="button"
              onClick={stopScreenShare}
              className="btn btn-sm"
              style={{
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <StopCircle size={13} /> Stop Sharing
            </button>
          ) : (
            <>
              {(userRole === 'HOST' || userRole === 'MODERATOR') && isSharing && (
                <button
                  type="button"
                  onClick={() => {
                    emitAdminForceStopScreenShare();
                    onNotify('Host requested screen share to stop.', 'info');
                  }}
                  className="btn btn-sm"
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                  }}
                  title="Host: Force stop active screen share"
                >
                  <StopCircle size={13} /> Stop Share
                </button>
              )}
              <button
                type="button"
                onClick={toggleMute}
                className="btn-icon"
                style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title={isMuted ? 'Unmute Stream' : 'Mute Stream'}
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="btn-icon"
            style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Main Video Stage */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isStreamer || isMuted}
        style={{
          width: '100%',
          height: '100%',
          flex: 1,
          minHeight: 0,
          objectFit: 'contain',
          background: '#000',
        }}
        onClick={autoplayBlocked ? handleUserInteractPlay : undefined}
      />

      {/* Floating Tap to Unmute Overlay for Mobile Autoplay Restrictions */}
      {autoplayBlocked && (
        <button
          type="button"
          onClick={handleUserInteractPlay}
          className="room-tab-unmute-overlay-btn"
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 15px',
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(139, 92, 246, 0.6)',
            borderRadius: '9999px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Volume2 size={15} color="var(--accent)" />
          <span>Tap to unmute screen audio 🔊</span>
        </button>
      )}

      {/* Empty / Connecting / Share Prompt Overlay */}
      {!isSharing && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            background: 'radial-gradient(circle, #0f172a 0%, #020617 100%)',
            color: '#94a3b8',
            padding: '16px',
            textAlign: 'center',
            zIndex: 5,
          }}
        >
          {isStreamer ? (
            <>
              <Tv size={36} color="var(--accent)" />
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>
                Share Your Screen
              </h3>
              <p style={{ margin: 0, fontSize: '12px', maxWidth: '360px', lineHeight: 1.4 }}>
                Stream your device screen, browser tab, or window directly to everyone in this room.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => startScreenShare(streamTitle)}
                style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '7px 16px' }}
              >
                <Share2 size={15} />
                <span>Start Screen Share</span>
              </button>
            </>
          ) : (
            <>
              <Loader2 size={30} className="spin-icon" color="var(--accent)" />
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '15px' }}>
                Connecting to Live Screen Share…
              </h3>
              <p style={{ margin: 0, fontSize: '12px', maxWidth: '320px', lineHeight: 1.4 }}>
                {streamerName ? `${streamerName} is sharing their screen.` : 'Waiting for host stream connection…'}
              </p>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  socket?.emit('webrtc:request_stream', { streamerSocketId });
                  onNotify('Re-requesting live screen stream…', 'info');
                }}
                style={{ marginTop: '4px', fontSize: '12px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <RefreshCw size={12} />
                <span>Retry Stream</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RoomTabPlayer;
