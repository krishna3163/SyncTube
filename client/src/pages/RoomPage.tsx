import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  socket,
  emitJoinRoom,
  emitLeaveRoom,
  emitPlay,
  emitPause,
  emitSeek,
  emitChangeVideo,
  emitAssignRole,
  emitRemoveParticipant,
} from '../services/socket.js';
import {
  Role,
  PlayState,
  ParticipantPublic,
  SyncStatePayload,
  UserJoinedPayload,
  UserLeftPayload,
  RoleAssignedPayload,
  ParticipantRemovedPayload,
  ErrorPayload,
  ActivityItem,
  ConnectionStatus,
} from '../types.js';
import { YouTubePlayer } from '../components/YouTubePlayer.js';
import { PlaybackControls } from '../components/PlaybackControls.js';
import { ParticipantList } from '../components/ParticipantList.js';
import { ActivityFeed } from '../components/ActivityFeed.js';
import { RoomHeader } from '../components/RoomHeader.js';
import { extractYouTubeId } from '../utils/youtube.js';
import { Film, Send } from 'lucide-react';

interface RoomPageProps {
  roomId: string;
  username: string;
  userId: string;
  onLeaveRoom: () => void;
  onNotify: (msg: string, type: 'success' | 'error') => void;
}

export const RoomPage: React.FC<RoomPageProps> = ({
  roomId,
  username,
  userId,
  onLeaveRoom,
  onNotify,
}) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [videoId, setVideoId] = useState<string>('dQw4w9WgXcQ');
  const [syncState, setSyncState] = useState<SyncStatePayload | null>(null);
  const [userRole, setUserRole] = useState<Role>('PARTICIPANT');
  const [participants, setParticipants] = useState<ParticipantPublic[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [newVideoUrl, setNewVideoUrl] = useState<string>('');
  const currentTimeRef = useRef<number>(0);

  const addActivity = useCallback((text: string, type: ActivityItem['type']) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setActivities((prev) => [
      { id: `${Date.now()}_${Math.random()}`, time, text, type },
      ...prev.slice(0, 49),
    ]);
  }, []);

  // Connect socket and register listeners
  useEffect(() => {
    socket.connect();

    const onConnect = () => {
      setConnectionStatus('connected');
      emitJoinRoom(roomId, username, userId);
      addActivity('Connected to room session.', 'joined');
    };

    const onDisconnect = () => {
      setConnectionStatus('disconnected');
      addActivity('Disconnected from server.', 'error');
    };

    const onConnectError = () => {
      setConnectionStatus('disconnected');
      onNotify('Failed to connect to real-time server.', 'error');
    };

    const onSyncState = (data: SyncStatePayload) => {
      setSyncState(data);
      setVideoId(data.videoId);
    };

    const onUserJoined = (data: UserJoinedPayload) => {
      setParticipants(data.participants);
      if (data.userId === userId) {
        setUserRole(data.role);
      }
      addActivity(`${data.username} joined as ${data.role.toLowerCase()}`, 'joined');
    };

    const onUserLeft = (data: UserLeftPayload) => {
      setParticipants(data.participants);
      addActivity(`${data.username} left the room.`, 'left');
    };

    const onRoleAssigned = (data: RoleAssignedPayload) => {
      setParticipants(data.participants);
      if (data.userId === userId) {
        setUserRole(data.role);
        onNotify(`Your role was updated to ${data.role}`, 'success');
      }
      addActivity(`${data.username} was assigned role ${data.role}`, 'role');
    };

    const onParticipantRemoved = (data: ParticipantRemovedPayload) => {
      setParticipants(data.participants);
      if (data.userId === userId) {
        onNotify('You were removed from this room by the host.', 'error');
        onLeaveRoom();
      } else {
        addActivity('A participant was removed by the host.', 'removed');
      }
    };

    const onError = (err: ErrorPayload) => {
      onNotify(`[${err.code}] ${err.message}`, 'error');
      if (err.code === 'FORBIDDEN' && err.message.toLowerCase().includes('removed')) {
        setTimeout(onLeaveRoom, 1500);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('sync_state', onSyncState);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('role_assigned', onRoleAssigned);
    socket.on('participant_removed', onParticipantRemoved);
    socket.on('error', onError);

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('sync_state', onSyncState);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('role_assigned', onRoleAssigned);
      socket.off('participant_removed', onParticipantRemoved);
      socket.off('error', onError);
      emitLeaveRoom(roomId);
    };
  }, [roomId, username, userId, onLeaveRoom, onNotify, addActivity]);

  // Actions
  const handlePlay = useCallback((time?: number) => {
    const target = typeof time === 'number' ? time : currentTimeRef.current;
    emitPlay(target);
    addActivity('You played the video.', 'playback');
  }, [addActivity]);

  const handlePause = useCallback((time?: number) => {
    const target = typeof time === 'number' ? time : currentTimeRef.current;
    emitPause(target);
    addActivity('You paused the video.', 'playback');
  }, [addActivity]);

  const handleSeek = useCallback((time: number) => {
    currentTimeRef.current = time;
    emitSeek(time);
    addActivity(`You seeked to ${Math.floor(time)}s.`, 'playback');
  }, [addActivity]);

  const handleChangeVideoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoUrl.trim()) return;

    const extracted = extractYouTubeId(newVideoUrl.trim());
    if (!extracted) {
      onNotify('Please enter a valid YouTube video URL or ID.', 'error');
      return;
    }

    emitChangeVideo(extracted);
    setNewVideoUrl('');
    addActivity(`Video change requested: ${extracted}`, 'playback');
  };

  const handleAssignRole = useCallback((targetUserId: string, newRole: Role) => {
    emitAssignRole(targetUserId, newRole);
  }, []);

  const handleRemoveParticipant = useCallback((targetUserId: string) => {
    emitRemoveParticipant(targetUserId);
  }, []);

  const handleTimeChange = useCallback((time: number, dur: number) => {
    currentTimeRef.current = time;
    setCurrentTime(time);
    setDuration(dur);
  }, []);

  const canControl = userRole === 'HOST' || userRole === 'MODERATOR';

  return (
    <div>
      <RoomHeader
        roomId={roomId}
        connectionStatus={connectionStatus}
        onLeaveRoom={onLeaveRoom}
        onNotify={onNotify}
      />

      <main className="room-container">
        {/* Main Stage: Player + Controls + Change Video */}
        <div className="stage-area">
          <div className="glass-panel stage-card">
            <YouTubePlayer
              videoId={videoId}
              syncState={syncState}
              userRole={userRole}
              onLocalPlay={handlePlay}
              onLocalPause={handlePause}
              onLocalSeek={handleSeek}
              onCurrentTimeChange={handleTimeChange}
            />

            <PlaybackControls
              playState={syncState?.playState || 'paused'}
              currentTime={currentTime}
              duration={duration}
              userRole={userRole}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeek={handleSeek}
            />

            {canControl && (
              <form onSubmit={handleChangeVideoSubmit} className="video-change-bar">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Paste YouTube URL or Video ID to change video..."
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                  <Film size={16} />
                  Change Video
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Sidebar: Participants + Activity */}
        <aside className="sidebar">
          <ParticipantList
            participants={participants}
            currentUserId={userId}
            currentUserRole={userRole}
            onAssignRole={handleAssignRole}
            onRemoveParticipant={handleRemoveParticipant}
          />

          <ActivityFeed activities={activities} />
        </aside>
      </main>
    </div>
  );
};
