import React, { useEffect, useState, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Radio,
  ChevronDown,
  ChevronUp,
  Volume2,
  Users,
} from 'lucide-react';
import { webrtcCallManager, CallParticipantState } from '../services/webrtcCallManager.js';

interface SidebarCallStageProps {
  currentUserId: string;
  currentUsername: string;
  currentUserAvatarId?: string;
  userRole?: string;
  onNotify?: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const SidebarCallStage: React.FC<SidebarCallStageProps> = ({
  currentUserId,
  currentUsername,
  currentUserAvatarId,
  userRole,
  onNotify,
}) => {
  const [inCall, setInCall] = useState(false);
  const [participants, setParticipants] = useState<CallParticipantState[]>([]);
  const [callCount, setCallCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    webrtcCallManager.setLocalUser(currentUserId, currentUsername, currentUserAvatarId);

    const unsubPeers = webrtcCallManager.subscribePeers((peers) => {
      setParticipants(peers);
      setInCall(webrtcCallManager.isCallActive());
      const state = webrtcCallManager.getLocalMediaState();
      setIsMuted(state.isMuted);
      setIsCameraOff(state.isCameraOff);
    });

    const unsubCount = webrtcCallManager.subscribeCallCount((count) => {
      setCallCount(count);
    });

    const unsubForceMute = webrtcCallManager.subscribeForceMuted((mutedBy) => {
      onNotify?.(`You were muted by ${mutedBy} 🔇`, 'info');
      setIsMuted(true);
    });

    return () => {
      unsubPeers();
      unsubCount();
      unsubForceMute();
    };
  }, [currentUserId, currentUsername, currentUserAvatarId, onNotify]);

  const handleJoinCall = async (withVideo = false) => {
    setJoining(true);
    const res = await webrtcCallManager.joinCall({ audio: true, video: withVideo });
    setJoining(false);
    if (res.success) {
      setInCall(true);
      onNotify?.(withVideo ? 'Connected to Voice & Video chat! 🎙️📹' : 'Connected to Voice chat! 🎙️', 'success');
    } else {
      if (res.error === 'SECURE_CONTEXT_REQUIRED') {
        onNotify?.('Microphone requires HTTPS or localhost! On LAN IP (http://...), open chrome://flags/#unsafely-treat-insecure-origin-as-secure to allow.', 'error');
      } else if (res.error === 'PERMISSION_DENIED') {
        onNotify?.('Microphone access blocked. Click the camera/lock icon in your browser address bar to allow.', 'error');
      } else {
        onNotify?.(res.error || 'Could not access microphone/camera.', 'error');
      }
    }
  };

  const handleLeaveCall = () => {
    webrtcCallManager.leaveCall();
    setInCall(false);
    onNotify?.('Left voice & video call', 'info');
  };

  const handleToggleMute = () => {
    const muted = webrtcCallManager.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleCamera = async () => {
    const off = await webrtcCallManager.toggleCamera();
    setIsCameraOff(off);
  };

  const isHostOrMod = userRole === 'HOST' || userRole === 'MODERATOR';

  // ALWAYS render .sidebar-call-header so newly joined viewers see it immediately!
  return (
    <div className={`sidebar-call-stage-card ${inCall ? 'active-call' : 'spectating-call'}`}>
      {/* Header Bar - Always visible */}
      <div className="sidebar-call-header">
        <div className="sidebar-call-header-left">
          <span className={`call-live-indicator-dot ${callCount > 0 ? 'active' : 'idle'}`} />
          <span className="sidebar-call-header-title">
            Meet Call <span className="call-count-pill">{callCount}</span>
          </span>
          {participants.some((p) => p.isSpeaking) && (
            <span className="active-speaker-wave-badge">
              <Volume2 size={11} className="speaking-wave-icon" />
              <span>Speaking</span>
            </span>
          )}
        </div>

        <div className="sidebar-call-header-right">
          {inCall ? (
            <div className="sidebar-call-controls-mini">
              <button
                type="button"
                onClick={handleToggleMute}
                className={`sidebar-call-ctrl-btn ${isMuted ? 'muted' : 'unmuted'}`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
              </button>
              <button
                type="button"
                onClick={handleToggleCamera}
                className={`sidebar-call-ctrl-btn ${isCameraOff ? 'cam-off' : 'cam-on'}`}
                title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {isCameraOff ? <VideoOff size={13} /> : <Video size={13} />}
              </button>
              <button
                type="button"
                onClick={handleLeaveCall}
                className="sidebar-call-ctrl-btn leave"
                title="Leave call"
              >
                <PhoneOff size={13} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                onClick={() => handleJoinCall(false)}
                disabled={joining}
                className="sidebar-call-join-btn primary"
                title="Join Voice Chat"
              >
                <Mic size={12} />
                <span>{joining ? 'Connecting...' : 'Join Call'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleJoinCall(true)}
                disabled={joining}
                className="sidebar-call-join-video-btn"
                title="Join with Camera"
              >
                <Video size={12} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="sidebar-call-toggle-collapse"
            title={isCollapsed ? 'Expand video tiles' : 'Collapse video tiles'}
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Video & Voice Tiles Gallery */}
      {!isCollapsed && (
        <div className="sidebar-call-tiles-gallery">
          {participants.length > 0 ? (
            participants.map((p) => (
              <SidebarParticipantTile
                key={p.socketId}
                participant={p}
                isHostOrMod={Boolean(isHostOrMod)}
                onMuteParticipant={(targetSocketId, targetUserId, targetName) => {
                  webrtcCallManager.hostMuteUser(targetSocketId, targetUserId);
                  onNotify?.(`Muted @${targetName} 🔇`, 'info');
                }}
              />
            ))
          ) : (
            <div className="sidebar-call-empty-prompt">
              <Users size={16} color="var(--accent)" />
              <p>Voice & video call is open. Click Join to chat with everyone!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SidebarParticipantTile: React.FC<{
  participant: CallParticipantState;
  isHostOrMod: boolean;
  onMuteParticipant: (socketId: string, userId: string, name: string) => void;
}> = ({
  participant,
  isHostOrMod,
  onMuteParticipant,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
      videoRef.current.play().catch(() => {});
    }
  }, [participant.stream, participant.isCameraOff]);

  const hasVideoTrack =
    participant.stream &&
    participant.stream.getVideoTracks().length > 0 &&
    !participant.isCameraOff;

  return (
    <div
      className={`sidebar-meet-tile ${participant.isSpeaking ? 'is-speaking' : ''}`}
      title={`${participant.username} ${participant.isLocal ? '(You)' : ''}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={Boolean(participant.isLocal)}
        className="sidebar-meet-video"
        style={{
          display: hasVideoTrack ? 'block' : 'none',
          transform: participant.isLocal && !participant.isScreenSharing ? 'scaleX(-1)' : 'none',
        }}
      />

      {!hasVideoTrack && (
        <div className="sidebar-meet-avatar-wrap">
          <div className={`sidebar-meet-avatar-ring ${participant.isSpeaking ? 'pulse-speaking' : ''}`}>
            {participant.avatarId ? (
              <img
                src={`/avatars/${participant.avatarId}.png`}
                alt=""
                className="sidebar-meet-avatar-img"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="sidebar-meet-avatar-initial">
                {participant.username.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {participant.isSpeaking && (
            <div className="speaking-audio-bars">
              <span className="bar bar-1" />
              <span className="bar bar-2" />
              <span className="bar bar-3" />
            </div>
          )}
        </div>
      )}

      {isHostOrMod && !participant.isLocal && !participant.isMuted && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMuteParticipant(participant.socketId, participant.userId, participant.username);
          }}
          title={`Host: Mute ${participant.username}`}
          className="host-remote-mute-badge"
        >
          <MicOff size={10} />
          <span>Mute</span>
        </button>
      )}

      <div className="sidebar-meet-footer">
        <span className="sidebar-meet-name">
          {participant.username} {participant.isLocal ? '(You)' : ''}
        </span>
        <span className={`sidebar-meet-mic-pill ${participant.isMuted ? 'muted' : 'active'}`}>
          {participant.isMuted ? <MicOff size={10} /> : <Mic size={10} />}
        </span>
      </div>
    </div>
  );
};
