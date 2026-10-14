import React, { useEffect, useState, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  ChevronDown,
  ChevronUp,
  Volume2,
  Users,
  Radio,
  Wifi,
} from 'lucide-react';
import { webrtcCallManager, CallParticipantState } from '../services/webrtcCallManager.js';
import { emitStartTabStream, emitStopTabStream } from '../services/socket.js';
import { socket } from '../services/socket.js';

interface CallOverlayProps {
  currentUserId: string;
  currentUsername: string;
  currentUserAvatarId?: string;
  userRole?: string;
  onNotify?: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  currentUserId,
  currentUsername,
  currentUserAvatarId,
  userRole,
  onNotify,
}) => {
  const [inCall, setInCall] = useState(false);
  const [participants, setParticipants] = useState<CallParticipantState[]>([]);
  const [callCount, setCallCount] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [topologyMode, setTopologyMode] = useState<'idle' | 'p2p' | 'sfu'>('idle');
  const [networkQuality, setNetworkQuality] = useState<{ state: 'good' | 'unstable' | 'poor'; rtt: number; packetLoss: number }>({
    state: 'good',
    rtt: 0,
    packetLoss: 0,
  });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    webrtcCallManager.setLocalUser(currentUserId, currentUsername, currentUserAvatarId);

    const unsubPeers = webrtcCallManager.subscribePeers((peers) => {
      setParticipants(peers);
      setInCall(webrtcCallManager.isCallActive());
      const state = webrtcCallManager.getLocalMediaState();
      setIsMuted(state.isMuted);
      setIsCameraOff(state.isCameraOff);
      setIsScreenSharing(state.isScreenSharing);
    });

    const unsubCount = webrtcCallManager.subscribeCallCount((count) => {
      setCallCount(count);
    });

    const unsubForceMute = webrtcCallManager.subscribeForceMuted((mutedBy) => {
      onNotify?.(`You were muted by ${mutedBy} 🔇`, 'info');
      setIsMuted(true);
    });

    // Listen to tab stream lifecycle
    const onStreamStarted = (data: { streamerSocketId?: string; streamerName?: string }) => {
      if (data.streamerSocketId === socket?.id) {
        setIsScreenSharing(true);
      }
    };
    const onStreamStopped = () => {
      setIsScreenSharing(false);
    };

    socket?.on('room:tab_stream_started', onStreamStarted);
    socket?.on('room:tab_stream_stopped', onStreamStopped);

    const unsubTopo = webrtcCallManager.subscribeTopology((m) => setTopologyMode(m));
    const unsubNet = webrtcCallManager.subscribeNetworkQuality((q) => setNetworkQuality(q));

    return () => {
      unsubTopo();
      unsubNet();
      unsubPeers();
      unsubCount();
      unsubForceMute();
      socket?.off('room:tab_stream_started', onStreamStarted);
      socket?.off('room:tab_stream_stopped', onStreamStopped);
    };
  }, [currentUserId, currentUsername, currentUserAvatarId, onNotify]);

  const handleJoinCall = async (withVideo = false) => {
    setJoining(true);
    const res = await webrtcCallManager.joinCall({ audio: true, video: withVideo });
    setJoining(false);
    if (res.success) {
      setInCall(true);
      if (onNotify) {
        onNotify(withVideo ? 'Connected to Voice & Video chat! 🎙️📹' : 'Connected to Voice chat! 🎙️', 'success');
      }
    } else if (onNotify) {
      if (res.error === 'SECURE_CONTEXT_REQUIRED') {
        onNotify('Microphone/Camera requires HTTPS or localhost! If accessing via local IP, open chrome://flags/#unsafely-treat-insecure-origin-as-secure to allow.', 'error');
      } else if (res.error === 'PERMISSION_DENIED') {
        onNotify('Microphone/Camera permission blocked. Click the lock/camera icon in your URL address bar to allow.', 'error');
      } else {
        onNotify(res.error || 'Could not access microphone/camera. Please grant browser permissions.', 'error');
      }
    }
  };

  const handleLeaveCall = () => {
    webrtcCallManager.leaveCall();
    setInCall(false);
    if (onNotify) onNotify('Left voice/video call', 'info');
  };

  const handleToggleMute = () => {
    const muted = webrtcCallManager.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleCamera = async () => {
    const off = await webrtcCallManager.toggleCamera();
    setIsCameraOff(off);
  };

  // Screen share triggers main theater stage stream
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      emitStopTabStream();
      webrtcCallManager.stopScreenShare();
      setIsScreenSharing(false);
      onNotify?.('Stopped screen sharing.', 'info');
    } else {
      const title = `${currentUsername}'s Screen`;
      emitStartTabStream(title, (res) => {
        if (!res?.success) {
          onNotify?.(res?.error || 'Could not start screen share. Another participant may already be sharing.', 'error');
        } else {
          // Trigger local capture
          window.postMessage({ type: 'SYNCTUBE_START_TAB_SHARE', tabTitle: title }, '*');
          setIsScreenSharing(true);
          onNotify?.('Sharing your screen on the main stage!', 'success');
        }
      });
    }
  };

  // If user is not in call, show clean launcher on the left
  if (!inCall) {
    return (
      <div
        className="call-launcher-pill"
        style={{
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          background: 'rgba(15, 23, 42, 0.88)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          borderRadius: '9999px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
          animation: 'fadeScaleIn 0.3s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: callCount > 0 ? '#10b981' : '#64748b',
              boxShadow: callCount > 0 ? '0 0 10px #10b981' : 'none',
              animation: callCount > 0 ? 'pulseGlow 2s infinite' : 'none',
            }}
          />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
            {callCount > 0 ? `Voice & Video (${callCount})` : 'Voice Chat'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => handleJoinCall(false)}
          disabled={joining}
          className="btn btn-sm"
          style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '9999px',
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            cursor: 'pointer',
          }}
        >
          <Mic size={13} /> {joining ? 'Joining...' : 'Join Call'}
        </button>

        <button
          type="button"
          onClick={() => handleJoinCall(true)}
          disabled={joining}
          title="Join with Camera"
          className="btn btn-sm"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#cbd5e1',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '9999px',
            padding: '5px 8px',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
          }}
        >
          <Video size={13} />
        </button>
      </div>
    );
  }

  // When IN CALL: Floating dock placed on LEFT SIDE on desktop view
  return (
    <div className={`call-floating-dock ${isMinimized ? 'minimized' : ''}`}>
      {/* 1. Grid of Participant Video/Voice Tiles */}
      {!isMinimized && (
        <div className="call-video-grid-container">
          {participants.map((p) => (
            <ParticipantTile
              key={p.socketId}
              participant={p}
              isHostOrMod={userRole === 'HOST' || userRole === 'MODERATOR'}
              onMuteParticipant={(sId, uId, name) => {
                webrtcCallManager.hostMuteUser(sId, uId);
                onNotify?.(`Muted ${name} 🔇`, 'info');
              }}
            />
          ))}
        </div>
      )}

      {/* 2. Floating Action Controls Bar (left side on desktop) */}
      <div className="call-control-bar">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginRight: '6px',
            paddingRight: '10px',
            borderRight: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <Radio size={14} color="#10b981" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
            {participants.length} in call
          </span>
          {topologyMode !== 'idle' && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 800,
                padding: '1px 5px',
                borderRadius: '4px',
                background: topologyMode === 'p2p' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(168, 85, 247, 0.25)',
                color: topologyMode === 'p2p' ? '#60a5fa' : '#c084fc',
                border: topologyMode === 'p2p' ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(168, 85, 247, 0.5)',
                textTransform: 'uppercase',
              }}
              title={topologyMode === 'p2p' ? 'Direct 1-to-1 WebRTC P2P' : 'Mediasoup SFU Media Router'}
            >
              {topologyMode}
            </span>
          )}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '9px',
              padding: '1px 5px',
              borderRadius: '4px',
              background: networkQuality.state === 'good' ? 'rgba(16, 185, 129, 0.15)' : networkQuality.state === 'unstable' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: networkQuality.state === 'good' ? '#34d399' : networkQuality.state === 'unstable' ? '#fde047' : '#f87171',
              border: '1px solid currentColor',
            }}
            title={`Network: ${networkQuality.state.toUpperCase()} | RTT: ${networkQuality.rtt}ms | Loss: ${networkQuality.packetLoss}%`}
          >
            <Wifi size={10} />
            <span>{networkQuality.rtt > 0 ? `${networkQuality.rtt}ms` : 'OK'}</span>
          </span>
        </div>

        {/* Mic Toggle */}
        <button
          type="button"
          onClick={handleToggleMute}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          className={`call-control-btn ${isMuted ? 'muted-red' : 'inactive'}`}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        {/* Camera Toggle */}
        <button
          type="button"
          onClick={handleToggleCamera}
          title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
          className={`call-control-btn ${isCameraOff ? 'inactive' : 'active-green'}`}
        >
          {isCameraOff ? <VideoOff size={16} /> : <Video size={16} />}
        </button>

        {/* Screen Share Toggle */}
        <button
          type="button"
          onClick={handleToggleScreenShare}
          title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen on Main Stage'}
          className={`call-control-btn ${isScreenSharing ? 'active-purple' : 'inactive'}`}
        >
          <Monitor size={16} />
        </button>

        {/* Minimize / Expand Button */}
        <button
          type="button"
          onClick={() => setIsMinimized(!isMinimized)}
          title={isMinimized ? 'Expand Call Tiles' : 'Minimize Call Tiles'}
          className="call-control-btn inactive"
        >
          {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Leave Call */}
        <button
          type="button"
          onClick={handleLeaveCall}
          title="Leave Call"
          className="call-control-btn leave"
        >
          <PhoneOff size={16} />
        </button>
      </div>
    </div>
  );
};

const ParticipantTile: React.FC<{
  participant: CallParticipantState;
  isHostOrMod: boolean;
  onMuteParticipant: (socketId: string, userId: string, name: string) => void;
}> = ({ participant, isHostOrMod, onMuteParticipant }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
      videoRef.current.play().catch(() => {});
    }
  }, [participant.stream, participant.isCameraOff]);

  const hasVideo = Boolean(
    participant.stream &&
    participant.stream.getVideoTracks().length > 0 &&
    !participant.isCameraOff
  );

  return (
    <div
      style={{
        position: 'relative',
        width: '120px',
        height: '90px',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#0f172a',
        border: participant.isSpeaking ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: participant.isSpeaking ? '0 0 12px rgba(16, 185, 129, 0.45)' : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={Boolean(participant.isLocal)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: hasVideo ? 'block' : 'none',
          transform: participant.isLocal && !participant.isScreenSharing ? 'scaleX(-1)' : 'none',
        }}
      />

      {!hasVideo && (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '14px',
              color: '#f8fafc',
            }}
          >
            {participant.username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {isHostOrMod && !participant.isLocal && !participant.isMuted && (
        <button
          type="button"
          onClick={() => onMuteParticipant(participant.socketId, participant.userId, participant.username)}
          title={`Mute ${participant.username}`}
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: 'rgba(239, 68, 68, 0.85)',
            border: 'none',
            borderRadius: '4px',
            padding: '2px 4px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '9px',
          }}
        >
          <MicOff size={10} />
        </button>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: '2px',
          left: '4px',
          right: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '10px',
          fontWeight: 600,
          color: '#f8fafc',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>
          {participant.username}
        </span>
        {participant.isMuted ? <MicOff size={11} color="#ef4444" /> : <Mic size={11} color="#10b981" />}
      </div>
    </div>
  );
};
