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

export interface PlaylistItem {
  id: string;
  videoId: string;
  title?: string;
  addedBy?: string;
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

export interface ActionRequestResolvedPayload {
  requestId: string;
  approved: boolean;
  resolvedBy: string;
  request: PendingActionRequest;
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
}


export interface StoredWatchParty {
  roomId: string;
  username: string;
  role: Role;
  videoId?: string;
  videoTitle?: string;
  avatarId?: string;
  lastVisited: number;
}

export interface UserSettings {
  name: string;
  color: string;
  rememberMe: boolean;
  avatarId?: string;
}


export interface PermissionMatrix {
  add: { viewer: boolean; moderator: boolean; owner: boolean };
  remove: { viewer: boolean; moderator: boolean; owner: boolean };
  move: { viewer: boolean; moderator: boolean; owner: boolean };
  playPause: { viewer: boolean; moderator: boolean; owner: boolean };
  seek: { viewer: boolean; moderator: boolean; owner: boolean };
  skip: { viewer: boolean; moderator: boolean; owner: boolean };
  chatSend: { viewer: boolean; moderator: boolean; owner: boolean };
  chatDelete: { viewer: boolean; moderator: boolean; owner: boolean };
  ban: { viewer: boolean; moderator: boolean; owner: boolean };
}

export interface RoomSettingsData {
  name: string;
  permissions: PermissionMatrix;
  autoRemovePlayed: boolean;
  shuffle: boolean;
  allowLinks: boolean;
  allowEmbeddedLinks: boolean;
}
