import { Participant, ParticipantPublic, PlayState, Role, SyncStatePayload, PendingActionRequest, ChatMessage } from '../types.js';

export interface ServerPlaylistItem {
  id: string;
  videoId: string;
  title: string;
  channel?: string;
  duration?: string;
  thumbnail?: string;
  addedBy?: string;
  addedByAvatarId?: string;
  votes?: string[];
}

export interface RoomPoll {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, string[]>;
  createdBy: string;
}

const DEFAULT_AVATARS = [
  'naruto', 'goku', 'sailor', 'pikachu',
  'luffy', 'levi', 'zerotwo', 'rem',
  'itachi', 'gojo', 'nezuko', 'hinata',
  'kakashi', 'mikasa', 'tanjiro', 'erza'
];

function getDefaultAvatarForUsername(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash) + username.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DEFAULT_AVATARS.length;
  return DEFAULT_AVATARS[index];
}

export class Room {
  public readonly id: string;
  public readonly creatorUserId: string | null;
  public videoId: string;
  public playState: PlayState;
  public currentTime: number;
  public updatedAt: number;
  public hostUserId: string | null = null;
  public playlist: ServerPlaylistItem[] = [];
  public activePoll: RoomPoll | null = null;

  private participants: Map<string, Participant> = new Map();
  private identityCredentialHashes: Map<string, string> = new Map();
  private socketToUserId: Map<string, string> = new Map();
  private removedUserIds: Set<string> = new Set();
  private pendingRequests: Map<string, PendingActionRequest> = new Map();
  private chatMessages: ChatMessage[] = [];

  constructor(
    id: string,
    initialVideoId: string = '',
    creatorIdentity?: { userId: string; credentialHash: string }
  ) {
    this.id = id;
    this.videoId = initialVideoId;
    this.playState = 'paused';
    this.currentTime = 0;
    this.updatedAt = Date.now();
    this.creatorUserId = creatorIdentity?.userId || null;
    if (creatorIdentity) {
      this.identityCredentialHashes.set(creatorIdentity.userId, creatorIdentity.credentialHash);
    }
  }

  public isRemoved(userId: string): boolean {
    return this.removedUserIds.has(userId);
  }

  public getIdentityCredentialHash(userId: string): string | undefined {
    return this.identityCredentialHashes.get(userId);
  }

  public registerIdentityCredential(userId: string, credentialHash: string): void {
    this.identityCredentialHashes.set(userId, credentialHash);
  }

  public addParticipant(
    userId: string,
    socketId: string,
    username: string,
    isCreator: boolean = false,
    avatarId?: string
  ): Participant {
    if (this.isRemoved(userId)) {
      throw new Error('User has been removed from this room');
    }

    const effectiveAvatarId =
      avatarId && avatarId.trim() !== ''
        ? avatarId.trim()
        : (this.participants.get(userId)?.avatarId || getDefaultAvatarForUsername(username));

    // Check if user already exists (e.g. reconnect or new socket)
    const existing = this.participants.get(userId);
    if (existing) {
      this.socketToUserId.delete(existing.socketId);
      existing.socketId = socketId;
      existing.username = username; // update display name if changed
      existing.avatarId = effectiveAvatarId;
      this.socketToUserId.set(socketId, userId);
      return existing;
    }

    // Role assignment:
    // If no participants exist or isCreator, role is HOST
    let role: Role = 'PARTICIPANT';
    if (this.creatorUserId) {
      if (isCreator && userId === this.creatorUserId) {
        role = 'HOST';
        this.hostUserId = userId;
      }
    } else if (this.participants.size === 0 || isCreator || !this.hostUserId) {
      role = 'HOST';
      this.hostUserId = userId;
    }

    const participant: Participant = {
      userId,
      socketId,
      username,
      role,
      avatarId: effectiveAvatarId,
      joinedAt: Date.now(),
    };

    this.participants.set(userId, participant);
    this.socketToUserId.set(socketId, userId);

    return participant;
  }

  public getParticipant(userId: string): Participant | undefined {
    return this.participants.get(userId);
  }

  public getParticipantBySocket(socketId: string): Participant | undefined {
    const userId = this.socketToUserId.get(socketId);
    if (!userId) return undefined;
    return this.participants.get(userId);
  }

  public removeParticipantBySocket(socketId: string): Participant | null {
    const userId = this.socketToUserId.get(socketId);
    if (!userId) return null;
    this.socketToUserId.delete(socketId);

    const participant = this.participants.get(userId);
    if (!participant) return null;

    this.participants.delete(userId);
    this.cleanupUserRequests(userId);

    // If host left, elect a new host if participants remain
    if (this.hostUserId === userId) {
      this.hostUserId = null;
      this.electNewHost();
    }

    return participant;
  }

  public kickParticipant(userId: string): Participant | null {
    const participant = this.participants.get(userId);
    if (!participant) return null;

    this.removedUserIds.add(userId);
    this.socketToUserId.delete(participant.socketId);
    this.participants.delete(userId);
    this.cleanupUserRequests(userId);

    if (this.hostUserId === userId) {
      this.hostUserId = null;
      this.electNewHost();
    }

    return participant;
  }


  public assignRole(targetUserId: string, newRole: Role): Participant | null {
    const participant = this.participants.get(targetUserId);
    if (!participant) return null;

    if (newRole === 'HOST') {
      // Transfer host
      if (this.hostUserId && this.hostUserId !== targetUserId) {
        const currentHost = this.participants.get(this.hostUserId);
        if (currentHost) {
          currentHost.role = 'MODERATOR';
        }
      }
      this.hostUserId = targetUserId;
      participant.role = 'HOST';
    } else {
      participant.role = newRole;
      if (this.hostUserId === targetUserId) {
        // Demoting current host, elect a new host among remaining participants
        this.hostUserId = null;
        this.electNewHost(targetUserId);
      }
    }

    return participant;
  }

  private electNewHost(excludeUserId?: string): void {
    const eligible = Array.from(this.participants.values()).filter(
      (p) => !excludeUserId || p.userId !== excludeUserId
    );

    if (eligible.length === 0) {
      this.hostUserId = null;
      return;
    }

    // Prefer a Moderator first
    for (const participant of eligible) {
      if (participant.role === 'MODERATOR') {
        participant.role = 'HOST';
        this.hostUserId = participant.userId;
        return;
      }
    }

    // Otherwise, pick the oldest participant among eligible
    const oldest = eligible.sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (oldest) {
      oldest.role = 'HOST';
      this.hostUserId = oldest.userId;
    }
  }

  public getEffectiveCurrentTime(): number {
    if (this.playState === 'playing') {
      const elapsedSeconds = Math.max(0, (Date.now() - this.updatedAt) / 1000);
      return this.currentTime + elapsedSeconds;
    }
    return this.currentTime;
  }

  public play(time?: number): void {
    if (typeof time === 'number' && !isNaN(time) && time >= 0) {
      this.currentTime = time;
    } else {
      this.currentTime = this.getEffectiveCurrentTime();
    }
    this.playState = 'playing';
    this.updatedAt = Date.now();
  }

  public pause(time?: number): void {
    if (typeof time === 'number' && !isNaN(time) && time >= 0) {
      this.currentTime = time;
    } else {
      this.currentTime = this.getEffectiveCurrentTime();
    }
    this.playState = 'paused';
    this.updatedAt = Date.now();
  }

  public seek(time: number): void {
    this.currentTime = Math.max(0, time);
    this.updatedAt = Date.now();
  }

  public changeVideo(videoId: string): void {
    this.videoId = videoId;
    this.currentTime = 0;
    this.playState = 'paused';
    this.updatedAt = Date.now();
  }

  // ── Playlist mutations ────────────────────────────────────
  public addToPlaylist(item: ServerPlaylistItem, atTop: boolean = false): void {
    if (!item.votes) item.votes = [];
    const existingIdx = this.playlist.findIndex((i) => i.id === item.id || i.videoId === item.videoId);
    if (existingIdx >= 0) {
      if (atTop && existingIdx > 0) {
        const [existing] = this.playlist.splice(existingIdx, 1);
        this.playlist.unshift(existing);
      }
      return;
    }
    if (atTop) {
      this.playlist.unshift(item);
    } else {
      this.playlist.push(item);
    }
  }

  public removeFromPlaylist(itemId: string): void {
    this.playlist = this.playlist.filter((i) => i.id !== itemId);
  }

  public reorderPlaylist(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= this.playlist.length || toIndex >= this.playlist.length) return;
    const [moved] = this.playlist.splice(fromIndex, 1);
    this.playlist.splice(toIndex, 0, moved);
  }

  public moveToTop(itemId: string): void {
    const idx = this.playlist.findIndex((i) => i.id === itemId);
    if (idx <= 0) return;
    const [item] = this.playlist.splice(idx, 1);
    this.playlist.unshift(item);
  }

  public votePlaylistItem(itemId: string, userId: string): boolean {
    const item = this.playlist.find((i) => i.id === itemId);
    if (!item) return false;
    if (!Array.isArray(item.votes)) {
      item.votes = [];
    }
    const idx = item.votes.indexOf(userId);
    if (idx >= 0) {
      item.votes.splice(idx, 1);
    } else {
      item.votes.push(userId);
    }
    return true;
  }

  public shufflePlaylist(): void {
    for (let i = this.playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
    }
  }

  public clearPlaylist(): void {
    this.playlist = [];
  }

  public getAllParticipants(): ParticipantPublic[] {
    return Array.from(this.participants.values()).map((p) => ({
      userId: p.userId,
      username: p.username,
      role: p.role,
      avatarId: p.avatarId,
    }));
  }

  public getParticipantCount(): number {
    return this.participants.size;
  }

  public toSyncStatePayload(): SyncStatePayload {
    const isPaused = this.playState === 'paused';
    const effectiveTime = isPaused ? this.currentTime : this.getEffectiveCurrentTime();
    return {
      videoId: this.videoId,
      playState: this.playState,
      currentTime: Math.round(effectiveTime * 100) / 100,
      updatedAt: Date.now(),
    };
  }

  // ── Action Request mutations ──────────────────────────────
  public addPendingRequest(req: PendingActionRequest): void {
    this.pendingRequests.set(req.id, req);
  }

  public getPendingRequest(id: string): PendingActionRequest | undefined {
    return this.pendingRequests.get(id);
  }

  public removePendingRequest(id: string): boolean {
    return this.pendingRequests.delete(id);
  }

  public getPendingRequests(): PendingActionRequest[] {
    return Array.from(this.pendingRequests.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  private cleanupUserRequests(userId: string): void {
    for (const [id, req] of this.pendingRequests.entries()) {
      if (req.requesterId === userId) {
        this.pendingRequests.delete(id);
      }
    }
  }

  // ── Chat & Message Reactions ─────────────────────────────
  public addChatMessage(message: ChatMessage): void {
    this.chatMessages.push(message);
    if (this.chatMessages.length > 100) {
      this.chatMessages.shift();
    }
  }

  public getChatMessages(): ChatMessage[] {
    return [...this.chatMessages];
  }

  public toggleMessageReaction(messageId: string, emoji: string, userId: string): void {
    const msg = this.chatMessages.find((m) => m.id === messageId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};

    const alreadySelected = msg.reactions[emoji]?.includes(userId) ?? false;
    for (const [existingEmoji, userIds] of Object.entries(msg.reactions)) {
      const remainingUsers = userIds.filter((id) => id !== userId);
      if (remainingUsers.length === 0) {
        delete msg.reactions[existingEmoji];
      } else {
        msg.reactions[existingEmoji] = remainingUsers;
      }
    }

    if (!alreadySelected) {
      msg.reactions[emoji] = [...(msg.reactions[emoji] || []), userId];
    }
  }
}
