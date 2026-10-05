export type Role = 'HOST' | 'MODERATOR' | 'PARTICIPANT';

export type PlayState = 'playing' | 'paused';

export interface Participant {
  userId: string;
  socketId: string;
  username: string;
  role: Role;
  avatarId?: string;
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
  avatarId?: string;
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
  avatarId?: string;
}

export type ActionRequestType = 'play' | 'pause' | 'seek' | 'change_video' | 'request_next_video';

export interface PendingActionRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarId?: string;
  type: ActionRequestType;
  data?: {
    time?: number;
    videoId?: string;
    title?: string;
    duration?: string;
    channel?: string;
  };
  createdAt: number;
}

export interface ChatReplyPreview {
  messageId: string;
  username: string;
  text: string;
  avatarId?: string;
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
  replyTo?: ChatReplyPreview;
  reactions?: Record<string, string[]>;
}

export interface EmojiReaction {
  id: string;
  emoji: string;
  userId: string;
  username: string;
  timestamp: number;
  videoTime?: number;
  burstCount?: number;
}

export interface SoundEffectPayload {
  soundId: string;
  userId: string;
  username: string;
  timestamp: number;
}
