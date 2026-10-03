export type Role = 'HOST' | 'MODERATOR' | 'PARTICIPANT';

export type PlayState = 'playing' | 'paused';

export interface Participant {
  userId: string;
  socketId: string;
  username: string;
  role: Role;
  joinedAt: number;
}

export interface RoomState {
  roomId: string;
  videoId: string;
  playState: PlayState;
  currentTime: number;
  updatedAt: number;
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
  code: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' | 'ALREADY_EXISTS' | 'INTERNAL_ERROR';
  message: string;
}

export interface ParticipantPublic {
  userId: string;
  username: string;
  role: Role;
}
