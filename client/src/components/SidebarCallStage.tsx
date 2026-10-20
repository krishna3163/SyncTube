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
  Pin,
  Wifi,
  Activity,
  MonitorOff,
  Monitor,
} from 'lucide-react';
import { webrtcCallManager, CallParticipantState } from '../services/webrtcCallManager.js';
import { socket, emitStartTabStream, emitStopTabStream } from '../services/socket.js';

interface SidebarCallStageProps {
  currentUserId: string;
  currentUsername: string;
  currentUserAvatarId?: string;
  userRole?: string;
  isBlockedFromCall?: boolean;
  onRequestAction?: (type: 'join_call' | 'share_screen') => void;
  onNotify?: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const SidebarCallStage: React.FC<SidebarCallStageProps> = ({
  currentUserId,
  currentUsername,
  currentUserAvatarId,
  userRole,
  isBlockedFromCall = false,
  onRequestAction,
  onNotify,
}) => {
  const [inCall, setInCall] = useState(false);
  const [participants, setParticipants] = useState<CallParticipantState[]>([]);
  const [callCount, setCallCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [joining, setJoining] = useState(false);
  const [topologyMode, setTopologyMode] = useState<'idle' | 'p2p' | 'sfu'>('idle');
  const [networkQuality, setNetworkQuality] = useState<{ state: 'good' | 'unstable' | 'poor'; rtt: number; packetLoss: number }>({
    state: 'good',
    rtt: 0,
    packetLoss: 0,
  });

  // Always keep collapsed if and only if nobody is joined in the call
  useEffect(() => {
    if (callCount === 0 && !inCall && participants.length === 0) {
      setIsCollapsed(true);
    } else if (callCount > 0 || inCall) {
      setIsCollapsed(false);
    }
  }, [callCount, inCall, participants.length]);

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

    const unsubTopology = webrtcCallManager.subscribeTopology((mode) => setTopologyMode(mode));
    const unsubNet = webrtcCallManager.subscribeNetworkQuality((q) => setNetworkQuality(q));

    const handleStopShare = () => setIsScreenSharing(false);
    const handleWindowMsg = (e: MessageEvent) => {
      if (e.data?.type === 'SYNCTUBE_START_TAB_SHARE') {
        setIsScreenSharing(true);
      }
    };

    window.addEventListener('message', handleWindowMsg);
    socket.on('room:tab_stream_stopped', handleStopShare);
    socket.on('call:force_stop_screenshare', handleStopShare);

    return () => {
      unsubPeers();
      unsubCount();
      unsubForceMute();
      unsubTopology();
      unsubNet();
      window.removeEventListener('message', handleWindowMsg);
      socket.off('room:tab_stream_stopped', handleStopShare);
      socket.off('call:force_stop_screenshare', handleStopShare);
    };
  }, [currentUserId, currentUsername, currentUserAvatarId, onNotify]);

  const handleJoinCall = async (withVideo = false) => {
    if (isBlockedFromCall) {
      onNotify?.('You have been restricted from joining voice & video calls by the room host.', 'error');
      return;
    }
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
    if (isScreenSharing) {
      emitStopTabStream();
      webrtcCallManager.stopScreenShare();
      setIsScreenSharing(false);
    }
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

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      webrtcCallManager.stopScreenShare();
      emitStopTabStream();
      setIsScreenSharing(false);
      onNotify?.('Stopped screen sharing.', 'info');
    } else {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        onNotify?.('Screen sharing is not supported on this browser or mobile device.', 'error');
        return;
      }
      const title = `${currentUsername}'s Screen`;
      // First register with server so others know a share is starting
      emitStartTabStream(title, async (res) => {
        if (!res?.success) {
          onNotify?.(res?.error || 'Could not start screen share. Another participant may already be sharing.', 'error');
        } else {
          // Now capture the screen and stream via WebRTC call and notify main stage
          window.postMessage({ type: 'SYNCTUBE_START_TAB_SHARE', tabTitle: title }, '*');
          const shareRes = await webrtcCallManager.startScreenShare();
          if (!shareRes.success) {
            // Abort server-side share if local capture failed
            emitStopTabStream();
            onNotify?.(shareRes.error || 'Could not capture screen.', 'error');
          } else {
            setIsScreenSharing(true);
            onNotify?.('Sharing your screen on the main stage!', 'success');
          }
        }
      });
    }
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
            {inCall && topologyMode !== 'idle' && (
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
                  marginLeft: '4px',
                }}
                title={topologyMode === 'p2p' ? 'Direct 1-to-1 WebRTC P2P' : 'Mediasoup SFU Media Router'}
              >
                {topologyMode}
              </span>
            )}
            {inCall && (
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
                  marginLeft: '4px',
                }}
                title={`Network: ${networkQuality.state.toUpperCase()} | RTT: ${networkQuality.rtt}ms | Loss: ${networkQuality.packetLoss}%`}
              >
                <Wifi size={10} />
                <span>{networkQuality.rtt > 0 ? `${networkQuality.rtt}ms` : 'OK'}</span>
              </span>
            )}
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
                onClick={handleToggleScreenShare}
                className={`sidebar-call-ctrl-btn ${isScreenSharing ? 'screen-on' : 'screen-off'}`}
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen on Main Stage'}
              >
                <Monitor size={13} />
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
          ) : isBlockedFromCall ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                disabled
                className="sidebar-call-join-btn"
                style={{ opacity: 0.7, cursor: 'not-allowed', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
                title="Host has restricted your call access in this room"
              >
                <PhoneOff size={12} />
                <span>Call Blocked</span>
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
              {userRole === 'PARTICIPANT' && onRequestAction && (
                <button
                  type="button"
                  onClick={() => {
                    onRequestAction('join_call');
                    onNotify?.('Request to join call sent to Host for approval! 🎟️', 'info');
                  }}
                  className="sidebar-call-join-btn"
                  style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.35)', color: '#a5b4fc' }}
                  title="Ask Host for permission to join call"
                >
                  Request Call
                </button>
              )}
            </div>
          )}

          {(participants.length > 0 || inCall) && (
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="sidebar-call-toggle-collapse"
              title={isCollapsed ? 'Expand video tiles' : 'Collapse video tiles'}
            >
              {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Video & Voice Tiles Gallery - Only shown when someone is active in the call */}
      {!isCollapsed && (participants.length > 0 || inCall) && (
        <div className="sidebar-call-tiles-gallery">
          {participants.length > 0 ? (
            participants.map((p) => (
              <SidebarParticipantTile
                key={p.socketId}
                participant={p}
                isHostOrMod={Boolean(isHostOrMod)}
                onPin={(targetSocketId) => webrtcCallManager.pinParticipant(targetSocketId)}
                onMuteParticipant={(targetSocketId, targetUserId, targetName) => {
                  webrtcCallManager.hostMuteUser(targetSocketId, targetUserId);
                  onNotify?.(`Muted @${targetName} 🔇`, 'info');
                }}
                onStopScreenShare={(targetSocketId, targetUserId, targetName) => {
                  webrtcCallManager.hostStopScreenShare(targetSocketId, targetUserId);
                  onNotify?.(`Stopped screen share for @${targetName} 🛑`, 'info');
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
  onPin: (socketId: string | null) => void;
  onMuteParticipant: (socketId: string, userId: string, name: string) => void;
  onStopScreenShare?: (socketId: string, userId: string, name: string) => void;
}> = ({
  participant,
  isHostOrMod,
  onPin,
  onMuteParticipant,
  onStopScreenShare,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !participant.stream) return;

    if (videoEl.srcObject !== (participant.stream || null)) {
      videoEl.srcObject = participant.stream || null;
    }
    videoEl.play().catch(() => {});

    const vTracks = participant.stream.getVideoTracks();
    const handleTrackState = () => {
      if (videoEl.srcObject !== (participant.stream || null)) {
        videoEl.srcObject = participant.stream || null;
      }
      videoEl.play().catch(() => {});
    };

    vTracks.forEach((t) => {
      t.addEventListener('unmute', handleTrackState);
      t.addEventListener('ended', handleTrackState);
    });

    return () => {
      vTracks.forEach((t) => {
        t.removeEventListener('unmute', handleTrackState);
        t.removeEventListener('ended', handleTrackState);
      });
    };
  }, [participant.stream, participant.isCameraOff]);

  const hasVideoTrack =
    Boolean(participant.stream) &&
    participant.stream!.getVideoTracks().length > 0 &&
    participant.stream!.getVideoTracks().some((t) => t.enabled && t.readyState === 'live') &&
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
        muted={true}
        className="sidebar-meet-video"
        style={{
          display: hasVideoTrack ? 'block' : 'none',
          transform: participant.isLocal && !participant.isScreenSharing ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* Clean single-source remote audio playback without dual-element comb filtering */}
      {!participant.isLocal && participant.stream && (
        <audio
          ref={(el) => {
            if (el && participant.stream) {
              if (el.srcObject !== participant.stream) {
                el.srcObject = participant.stream;
                el.play().catch(() => {});
              }
            }
          }}
          autoPlay
          playsInline
        />
      )}

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

      {isHostOrMod && !participant.isLocal && participant.isScreenSharing && onStopScreenShare && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStopScreenShare(participant.socketId, participant.userId, participant.username);
          }}
          title={`Host: Stop ${participant.username}'s Screen Share`}
          className="host-remote-stop-share-badge"
          style={{
            position: 'absolute',
            bottom: '26px',
            right: '6px',
            zIndex: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            padding: '2px 6px',
            borderRadius: '9999px',
            background: 'rgba(239, 68, 68, 0.9)',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          }}
        >
          <MonitorOff size={10} />
          <span>Stop Share</span>
        </button>
      )}

      {!participant.isLocal && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPin(participant.isPinned ? null : participant.socketId);
          }}
          title={participant.isPinned ? 'Unpin Spotlight' : 'Pin Spotlight Feed (High Resolution)'}
          style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            zIndex: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: participant.isPinned ? '#a855f7' : 'rgba(15, 23, 42, 0.75)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            cursor: 'pointer',
          }}
        >
          <Pin size={10} />
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
