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
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

// Enhances WebRTC SDP with Opus high-bitrate stereo parameters for movies and music
const enhanceAudioSdp = (sdp: string): string => {
  if (!sdp) return sdp;
  let lines = sdp.split('\r\n');
  let opusPt: string | null = null;
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPt = match[1];
      break;
    }
  }
  if (!opusPt) return sdp;

  let fmtpFound = false;
  lines = lines.map((line) => {
    if (line.startsWith(`a=fmtp:${opusPt} `)) {
      fmtpFound = true;
      let params = line.substring(`a=fmtp:${opusPt} `.length);
      if (!params.includes('stereo=1')) params += ';stereo=1;sprop-stereo=1';
      if (!params.includes('maxaveragebitrate=')) params += ';maxaveragebitrate=510000';
      if (!params.includes('cbr=1')) params += ';cbr=1';
      if (!params.includes('useinbandfec=1')) params += ';useinbandfec=1';
      return `a=fmtp:${opusPt} ${params}`;
    }
    return line;
  });

  if (!fmtpFound) {
    const idx = lines.findIndex((l) => l.startsWith(`a=rtpmap:${opusPt} `));
    if (idx !== -1) {
      lines.splice(idx + 1, 0, `a=fmtp:${opusPt} minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=510000;cbr=1`);
    }
  }
  return lines.join('\r\n');
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

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [, setStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [hasAudioTrack, setHasAudioTrack] = useState<boolean>(false);
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

  // Sync remoteStream with videoRef whenever it updates
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      if (videoRef.current.srcObject !== remoteStream) {
        videoRef.current.srcObject = remoteStream;
      }
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[WebRTC ScreenShare] Autoplay restricted on mobile:', err);
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
  }, [remoteStream]);

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
      if (offer.sdp) {
        offer.sdp = enhanceAudioSdp(offer.sdp);
      }
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
        onNotify('Screen sharing is not supported in this browser or mobile device.', 'error');
        return;
      }

      let mediaStream: MediaStream;
      try {
        // High-fidelity tab/media audio constraints:
        // Echo cancellation and noise suppression MUST be disabled for crisp movie & music audio!
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
            frameRate: { ideal: 30, max: 60 },
          } as any,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
            sampleRate: 48000,
          } as any,
        });
      } catch {
        // Fallback if browser requires boolean audio constraint
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
            frameRate: { ideal: 30, max: 60 },
          } as any,
          audio: true,
        });
      }

      const hasAudio = mediaStream.getAudioTracks().length > 0;
      setHasAudioTrack(hasAudio);
      if (!hasAudio) {
        onNotify('⚠️ No tab audio detected! When sharing a tab, check "Also share tab audio" in the popup.', 'info');
      } else {
        onNotify('🔊 High-Fidelity HD Stereo Audio active for stream!', 'success');
      }

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
    setRemoteStream(null);
    remoteStreamRef.current = null;
    setIsSharing(false);
    setHasAudioTrack(false);

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
            console.log('[WebRTC ScreenShare] Received remote track:', event.track.kind);
            let stream = event.streams && event.streams[0];
            if (!stream) {
              if (!remoteStreamRef.current) {
                remoteStreamRef.current = new MediaStream();
              }
              remoteStreamRef.current.addTrack(event.track);
              stream = remoteStreamRef.current;
            } else {
              remoteStreamRef.current = stream;
            }

            setRemoteStream(stream);
            setIsSharing(true);
            if (stream) {
              setHasAudioTrack(stream.getAudioTracks().length > 0);
            }

            if (videoRef.current) {
              if (videoRef.current.srcObject !== stream) {
                videoRef.current.srcObject = stream;
              }
              const playPromise = videoRef.current.play();
              if (playPromise !== undefined) {
                playPromise.catch((err) => {
                  console.warn('[WebRTC ScreenShare] Autoplay restricted on mobile:', err);
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

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
              console.warn('[WebRTC ScreenShare] Viewer connection dropped, re-requesting stream');
              socket.emit('webrtc:request_stream', { streamerSocketId: data.fromSocketId });
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const queued = pendingViewerCandidates.current;
          for (const cand of queued) {
            try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
          }
          pendingViewerCandidates.current = [];

          const answer = await pc.createAnswer();
          if (answer.sdp) {
            answer.sdp = enhanceAudioSdp(answer.sdp);
          }
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
        } else {
          // Viewer receiving candidate from streamer (queue even if viewerPcRef is not ready yet)
          if (viewerPcRef.current && viewerPcRef.current.remoteDescription && viewerPcRef.current.remoteDescription.type) {
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

      if (data.streamerSocketId && data.streamerSocketId !== socket.id) {
        onNotify(`${data.streamerName || 'A friend'} is sharing their screen!`, 'info');
        socket.emit('webrtc:request_stream', { streamerSocketId: data.streamerSocketId });
      }
    };

    const onStreamStopped = () => {
      setIsSharing(false);
      setHasAudioTrack(false);
      setRemoteStream(null);
      remoteStreamRef.current = null;
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
      socket.emit('webrtc:request_stream', { streamerSocketId });
    }

    // Auto-retry stream request after 2.5s if stream tracks haven't arrived yet
    const autoRetryTimer = setTimeout(() => {
      if (!localStreamRef.current && !remoteStreamRef.current && socket) {
        socket.emit('webrtc:request_stream', { streamerSocketId });
      }
    }, 2500);

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNCTUBE_START_TAB_SHARE') {
        startScreenShare(event.data.tabTitle);
      }
    };
    window.addEventListener('message', handleWindowMessage);

    // Check if screen share was requested right before mounting
    const pendingShare = sessionStorage.getItem('synctube_pending_screen_share');
    if (pendingShare === 'true') {
      sessionStorage.removeItem('synctube_pending_screen_share');
      startScreenShare();
    }

    return () => {
      clearTimeout(autoRetryTimer);
      socket.off('webrtc:viewer_joined', onViewerJoined);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:ice_candidate', onIceCandidate);
      socket.off('room:tab_stream_started', onStreamStarted);
      socket.off('room:tab_stream_stopped', onStreamStopped);
      socket.off('call:force_stop_screenshare', onForceStop);
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [socket, connectViewer, onNotify, streamerSocketId]);

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
      videoRef.current.play().then(() => {
        setAutoplayBlocked(false);
      }).catch((err) => {
        console.warn('Playback error on user interact:', err);
      });
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
          {isSharing && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 7px',
                borderRadius: '9999px',
                background: hasAudioTrack ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                border: `1px solid ${hasAudioTrack ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
                color: hasAudioTrack ? '#86efac' : '#fde047',
                fontSize: '10px',
                fontWeight: 600,
                flexShrink: 0,
              }}
              title={hasAudioTrack ? 'Stereo HD sound active' : 'No tab audio shared. Re-share and check "Also share tab audio".'}
            >
              {hasAudioTrack ? <Volume2 size={11} /> : <VolumeX size={11} />}
              {hasAudioTrack ? 'HD Stereo' : 'No Audio'}
            </span>
          )}
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
      {(!localStreamRef.current && !remoteStream) && (
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
          {(isStreamer || !streamerSocketId || userRole === 'HOST' || userRole === 'MODERATOR') ? (
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
