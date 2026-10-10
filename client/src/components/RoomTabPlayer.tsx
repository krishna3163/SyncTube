import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Share2,
  StopCircle,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Chrome,
  ShieldCheck,
  Sparkles,
  Tv,
  Radio,
  Users,
} from 'lucide-react';
import { emitStopTabStream, emitStartTabStream } from '../services/socket.js';
import type { Role } from '../types.js';

interface RoomTabPlayerProps {
  userRole: Role;
  userId?: string;
  roomId?: string;
  socket?: any;
  onNotify: (msg: string, type: 'info' | 'success' | 'error') => void;
  onOpenBrowserHub?: () => void;
  extensionInstalled: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const RoomTabPlayer: React.FC<RoomTabPlayerProps> = ({
  userRole,
  userId,
  roomId,
  socket,
  onNotify,
  onOpenBrowserHub,
  extensionInstalled,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [streamTitle, setStreamTitle] = useState<string>('Host Shared Tab');
  const [viewerCount, setViewerCount] = useState<number>(0);

  // Host WebRTC peer connections map: targetSocketId -> RTCPeerConnection
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Viewer WebRTC peer connection
  const viewerPcRef = useRef<RTCPeerConnection | null>(null);

  const isHost = userRole === 'HOST' || userRole === 'MODERATOR';

  // Helper to create and negotiate WebRTC peer connection with a viewer
  const connectViewer = useCallback(async (viewerSocketId: string) => {
    if (!socket || !localStreamRef.current) return;

    try {
      // Close any existing connection to this viewer
      const existing = peerConnectionsRef.current.get(viewerSocketId);
      if (existing) {
        existing.close();
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionsRef.current.set(viewerSocketId, pc);

      // Add all tracks from the shared tab stream
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
      console.error('[WebRTC] Failed to connect viewer:', err);
    }
  }, [socket]);

  const startScreenShare = async (customTitle?: string) => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        onNotify('Screen/Tab sharing is not supported in this browser.', 'error');
        return;
      }

      // Request browser tab with audio
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
      const title = customTitle || 'Host Shared Browser Tab (Netflix / Movies)';
      setStreamTitle(title);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }

      // Tell room server tab stream started
      emitStartTabStream(title, (res) => {
        if (!res?.success && res?.error) {
          onNotify(`Stream notice: ${res.error}`, 'info');
        }
      });

      // Handle user stopping share from browser floating banner
      mediaStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      onNotify('Browser Tab stream started with audio! WebRTC broadcasting to your watch party.', 'success');
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        onNotify(`Failed to share tab: ${err.message || 'Permission denied'}`, 'error');
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

    // Close all viewer peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setViewerCount(0);

    emitStopTabStream();
    onNotify('Tab stream stopped.', 'info');
  };

  // Socket WebRTC Signaling Listeners
  useEffect(() => {
    if (!socket) return;

    // 1. Host received request from a viewer wanting to watch the stream
    const onViewerJoined = (data: { viewerSocketId: string; viewerName?: string }) => {
      if (isHost && localStreamRef.current && data.viewerSocketId) {
        connectViewer(data.viewerSocketId);
        onNotify(`${data.viewerName || 'A friend'} joined the tab stream`, 'info');
      }
    };

    // 2. Host received answer from viewer
    const onAnswer = async (data: { fromSocketId: string; answer: any }) => {
      if (isHost && data.fromSocketId && data.answer) {
        const pc = peerConnectionsRef.current.get(data.fromSocketId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          } catch (e) {
            console.error('[WebRTC] Error setting remote description (answer):', e);
          }
        }
      }
    };

    // 3. Viewer received offer from host
    const onOffer = async (data: { fromSocketId: string; offer: any }) => {
      if (!isHost && data.offer && data.fromSocketId) {
        try {
          if (viewerPcRef.current) {
            viewerPcRef.current.close();
          }

          const pc = new RTCPeerConnection(RTC_CONFIG);
          viewerPcRef.current = pc;

          pc.ontrack = (event) => {
            if (videoRef.current && event.streams[0]) {
              videoRef.current.srcObject = event.streams[0];
              videoRef.current.play().catch(() => {});
              setIsSharing(true);
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
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('webrtc:answer', {
            targetSocketId: data.fromSocketId,
            answer,
          });
        } catch (e) {
          console.error('[WebRTC] Error processing offer:', e);
        }
      }
    };

    // 4. ICE candidate received
    const onIceCandidate = async (data: { fromSocketId: string; candidate: any }) => {
      try {
        if (data.candidate) {
          if (isHost) {
            const pc = peerConnectionsRef.current.get(data.fromSocketId);
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
          } else if (viewerPcRef.current && viewerPcRef.current.remoteDescription) {
            await viewerPcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        }
      } catch (e) {
        console.error('[WebRTC] Error adding ICE candidate:', e);
      }
    };

    // 5. Tab stream lifecycle broadcast events
    const onStreamStarted = (data: { streamerSocketId?: string; streamerName?: string; title?: string }) => {
      if (data.title) setStreamTitle(data.title);
      if (!isHost) {
        onNotify(`${data.streamerName || 'Host'} started streaming tab! Connecting...`, 'info');
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
      onNotify('Host has stopped the tab stream.', 'info');
    };

    socket.on('webrtc:viewer_joined', onViewerJoined);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:ice_candidate', onIceCandidate);
    socket.on('room:tab_stream_started', onStreamStarted);
    socket.on('room:tab_stream_stopped', onStreamStopped);

    // If viewer just mounted while room is in tab stream, request stream
    if (!isHost) {
      socket.emit('webrtc:request_stream', {});
    }

    return () => {
      socket.off('webrtc:viewer_joined', onViewerJoined);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:ice_candidate', onIceCandidate);
      socket.off('room:tab_stream_started', onStreamStarted);
      socket.off('room:tab_stream_stopped', onStreamStopped);
    };
  }, [socket, isHost, connectViewer, onNotify]);

  // Extension communication bridge
  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SYNCTUBE_START_TAB_SHARE' && isHost) {
        startScreenShare(event.data.tabTitle);
      }
    };
    window.addEventListener('message', handleExtensionMessage);
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, [isHost]);

  // Clean up tracks when unmounting
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
      if (viewerPcRef.current) {
        viewerPcRef.current.close();
      }
    };
  }, []);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
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
    <div ref={containerRef} className="room-tab-player-container">
      {/* Top Banner */}
      <div className="room-tab-player-nav">
        <div className="tab-player-left">
          <div className="tab-player-live-badge">
            <span className="live-pulse-dot" />
            <span>LIVE TAB STREAM</span>
          </div>
          <span className="tab-player-title">
            {isSharing ? streamTitle : 'Netflix & Cinema Tab Watch Party'}
          </span>
          {isHost && isSharing && (
            <span className="tab-viewer-badge" title="Active viewers on WebRTC stream">
              <Users size={12} />
              <span>{viewerCount} peers</span>
            </span>
          )}
        </div>

        <div className="tab-player-actions">
          {isSharing ? (
            <>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={toggleMute}
                title={isMuted ? 'Unmute Tab Audio' : 'Mute Tab Audio'}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={toggleFullscreen}
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              {isHost && (
                <button type="button" className="btn btn-danger btn-xs" onClick={stopScreenShare}>
                  <StopCircle size={14} />
                  <span>Stop Stream</span>
                </button>
              )}
            </>
          ) : (
            isHost && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => startScreenShare()}
              >
                <Share2 size={14} />
                <span>Share Movie Tab with Audio</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Main Video Presentation Stage */}
      <div className="room-tab-video-stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`room-tab-video-element ${isSharing ? 'active' : 'hidden'}`}
        />

        {!isSharing && (
          <div className="room-tab-idle-card">
            <div className="idle-card-icon">
              <Tv size={36} />
            </div>
            <h3>Share Any Tab With Your Watch Party</h3>
            <p>
              Have 1 Netflix, Prime Video, Disney+, Crunchyroll, or Anime account between friends?
              The host can share any browser tab directly with crystal-clear video and synchronized audio.
            </p>

            <div className="tab-sharing-options">
              {isHost ? (
                <button
                  type="button"
                  className="btn btn-primary btn-lg tab-start-btn"
                  onClick={() => startScreenShare()}
                >
                  <Share2 size={18} />
                  <span>Click to Select & Share Netflix / Movie Tab (With Audio)</span>
                </button>
              ) : (
                <div className="tab-waiting-notice">
                  <Radio size={20} className="pulse-icon" />
                  <span>Waiting for the Host to start streaming their tab... (Will automatically appear here with sound!)</span>
                </div>
              )}
            </div>

            <div className="tab-extension-callout">
              <Chrome size={18} className="text-purple" />
              <div className="callout-text">
                <strong>SyncTube Chrome Extension:</strong> You can open Netflix in any tab, click the SyncTube extension icon, and click <em>Share This Tab to Watch Party</em> to broadcast instantly to room #{roomId || ''}!
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Footer Info */}
      <div className="room-tab-footer">
        <div className="footer-left">
          <ShieldCheck size={14} className="text-cyan" />
          <span>WebRTC P2P Tab Stream: Zero server latency with real-time stereo audio synchronization.</span>
        </div>
        <div className="footer-right">
          <Sparkles size={13} className="text-yellow" />
          <span>SyncTube Universal Watch Party</span>
        </div>
      </div>
    </div>
  );
};
