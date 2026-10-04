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

export type ActionRequestType = 'play' | 'pause' | 'seek' | 'change_video';

export interface PendingActionRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  type: ActionRequestType;
  data?: {
    time?: number;
    videoId?: string;
  };
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  userColor?: string;
  avatarId?: string;
  role: Role;
  text: string;
  timestamp: number;
}

export interface EmojiReaction {
  id: string;
  emoji: string;
  userId: string;
  username: string;
  timestamp: number;
}

export interface SoundEffectPayload {
  soundId: string;
  userId: string;
  username: string;
  timestamp: number;
}

