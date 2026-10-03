export type Role = 'HOST' | 'MODERATOR' | 'PARTICIPANT';

export type PlayState = 'playing' | 'paused';

export interface ParticipantPublic {
  userId: string;
  username: string;
  role: Role;
}

export interface SyncStatePayload {
  videoId: string;
  playState: PlayState;
  currentTime: number;
  updatedAt: number;
}

export interface UserJoinedPayload {
  username: string;
  userId: string;
  role: Role;
  participants: ParticipantPublic[];
}

export interface UserLeftPayload {
  username: string;
  userId: string;
  participants: ParticipantPublic[];
}

export interface RoleAssignedPayload {
  userId: string;
  username: string;
  role: Role;
  participants: ParticipantPublic[];
}

export interface ParticipantRemovedPayload {
  userId: string;
  participants: ParticipantPublic[];
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ActivityItem {
  id: string;
  time: string;
  text: string;
  type: 'joined' | 'left' | 'playback' | 'role' | 'removed' | 'error';
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';
