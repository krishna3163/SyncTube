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
} from 'lucide-react';
import { webrtcCallManager, CallParticipantState } from '../services/webrtcCallManager.js';

interface CallOverlayProps {
  currentUserId: string;
  currentUsername: string;
  currentUserAvatarId?: string;
  onNotify?: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  currentUserId,
  currentUsername,
  currentUserAvatarId,
  onNotify,
}) => {
  const [inCall, setInCall] = useState(false);
  const [participants, setParticipants] = useState<CallParticipantState[]>([]);
  const [callCount, setCallCount] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
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

    return () => {
      unsubPeers();
      unsubCount();
    };
  }, [currentUserId, currentUsername, currentUserAvatarId]);

  const handleJoinCall = async (withVideo = false) => {
    setJoining(true);
    const success = await webrtcCallManager.joinCall({ audio: true, video: withVideo });
    setJoining(false);
    if (success) {
      setInCall(true);
      if (onNotify) {
        onNotify(withVideo ? 'Connected to Voice & Video chat! 🎙️📹' : 'Connected to Voice chat! 🎙️', 'success');
      }
    } else if (onNotify) {
      onNotify('Could not access microphone/camera. Please grant browser permissions.', 'error');
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

  const handleToggleScreenShare = async () => {
    const sharing = await webrtcCallManager.toggleScreenShare();
    setIsScreenSharing(sharing);
  };

  // If user is not in call, show a sleek floating call banner or button
  if (!inCall) {
    return (
      <div
        className="call-launcher-pill"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
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

  return (
    <div
      className={`call-floating-dock ${isMinimized ? 'minimized' : ''}`}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 90,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '10px',
        pointerEvents: 'none',
      }}
    >
      {/* 1. Grid of Participant Video/Voice Tiles */}
      {!isMinimized && (
        <div
          className="call-video-grid-container"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: '10px',
            maxWidth: '650px',
            maxHeight: '380px',
            overflowY: 'auto',
            padding: '4px',
          }}
        >
          {participants.map((p) => (
            <ParticipantTile key={p.socketId} participant={p} />
          ))}
        </div>
      )}

      {/* 2. Floating Action Controls Bar */}
      <div
        className="call-control-bar"
        style={{
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '9999px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55)',
        }}
      >
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
        </div>

        {/* Mic Toggle */}
        <button
          type="button"
          onClick={handleToggleMute}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: isMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.12)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        {/* Camera Toggle */}
        <button
          type="button"
          onClick={handleToggleCamera}
          title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: isCameraOff ? 'rgba(255, 255, 255, 0.12)' : '#10b981',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isCameraOff ? <VideoOff size={16} /> : <Video size={16} />}
        </button>

        {/* Screen Share Toggle */}
        <button
          type="button"
          onClick={handleToggleScreenShare}
          title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: isScreenSharing ? '#8b5cf6' : 'rgba(255, 255, 255, 0.12)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <Monitor size={16} />
        </button>

        {/* Minimize / Expand Button */}
        <button
          type="button"
          onClick={() => setIsMinimized(!isMinimized)}
          title={isMinimized ? 'Expand Video Tiles' : 'Minimize Video Tiles'}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Leave Call Button */}
        <button
          type="button"
          onClick={handleLeaveCall}
          title="Disconnect from Call"
          style={{
            height: '34px',
            borderRadius: '9999px',
            border: 'none',
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <PhoneOff size={15} /> Leave
        </button>
      </div>
    </div>
  );
};

// ── Participant Video / Voice Tile ─────────────────────────────
const ParticipantTile: React.FC<{ participant: CallParticipantState }> = ({ participant }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const hasVideoTrack =
    participant.stream &&
    participant.stream.getVideoTracks().length > 0 &&
    !participant.isCameraOff;

  return (
    <div
      className={`call-participant-tile ${participant.isSpeaking ? 'speaking' : ''}`}
      style={{
        position: 'relative',
        width: '180px',
        height: '115px',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#090d16',
        border: participant.isSpeaking
          ? '2px solid #10b981'
          : '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: participant.isSpeaking
          ? '0 0 16px rgba(16, 185, 129, 0.45)'
          : '0 8px 24px rgba(0, 0, 0, 0.5)',
        transition: 'all 0.25s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Video stream element (audio autoPlays for remote participants) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={Boolean(participant.isLocal)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: hasVideoTrack ? 'block' : 'none',
          transform: participant.isLocal && !participant.isScreenSharing ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* Avatar Display when camera is OFF */}
      {!hasVideoTrack && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 700,
              color: '#fff',
              boxShadow: participant.isSpeaking ? '0 0 14px rgba(16, 185, 129, 0.6)' : 'none',
            }}
          >
            {participant.avatarId ? (
              <img
                src={`/avatars/${participant.avatarId}.png`}
                alt=""
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              participant.username.charAt(0).toUpperCase()
            )}
          </div>
        </div>
      )}

      {/* Name and State Tag */}
      <div
        style={{
          position: 'absolute',
          bottom: '6px',
          left: '8px',
          right: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(6px)',
          padding: '2px 8px',
          borderRadius: '9999px',
          fontSize: '11px',
          color: '#f8fafc',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            maxWidth: '110px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {participant.username} {participant.isLocal ? '(You)' : ''}
        </span>

        {participant.isMuted && <MicOff size={11} color="#f87171" />}
      </div>

      {/* Speaking Glow Tag */}
      {participant.isSpeaking && (
        <div
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px #10b981',
          }}
        />
      )}
    </div>
  );
};
