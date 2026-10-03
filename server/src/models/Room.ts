import { Participant, ParticipantPublic, PlayState, Role, SyncStatePayload } from '../types.js';

export class Room {
  public readonly id: string;
  public videoId: string;
  public playState: PlayState;
  public currentTime: number;
  public updatedAt: number;
  public hostUserId: string | null = null;

  private participants: Map<string, Participant> = new Map();
  private socketToUserId: Map<string, string> = new Map();
  private removedUserIds: Set<string> = new Set();

  constructor(id: string, initialVideoId: string = 'dQw4w9WgXcQ') {
    this.id = id;
    this.videoId = initialVideoId;
    this.playState = 'paused';
    this.currentTime = 0;
    this.updatedAt = Date.now();
  }

  public isRemoved(userId: string): boolean {
    return this.removedUserIds.has(userId);
  }

  public addParticipant(userId: string, socketId: string, username: string, isCreator: boolean = false): Participant {
    if (this.isRemoved(userId)) {
      throw new Error('User has been removed from this room');
    }

    // Check if user already exists (e.g. reconnect or new socket)
    const existing = this.participants.get(userId);
    if (existing) {
      this.socketToUserId.delete(existing.socketId);
      existing.socketId = socketId;
      existing.username = username; // update display name if changed
      this.socketToUserId.set(socketId, userId);
      return existing;
    }

    // Role assignment:
    // If no participants exist or isCreator, role is HOST
    let role: Role = 'PARTICIPANT';
    if (this.participants.size === 0 || isCreator || !this.hostUserId) {
      role = 'HOST';
      this.hostUserId = userId;
    }

    const participant: Participant = {
      userId,
      socketId,
      username,
      role,
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
    } else if (this.hostUserId === targetUserId) {
      // Demoting current host, elect a new host
      this.electNewHost();
    }

    participant.role = newRole;
    return participant;
  }

  private electNewHost(): void {
    if (this.participants.size === 0) {
      this.hostUserId = null;
      return;
    }

    // Prefer a Moderator first
    for (const participant of this.participants.values()) {
      if (participant.role === 'MODERATOR') {
        participant.role = 'HOST';
        this.hostUserId = participant.userId;
        return;
      }
    }

    // Otherwise, pick the oldest participant
    const oldest = Array.from(this.participants.values()).sort((a, b) => a.joinedAt - b.joinedAt)[0];
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

  public getAllParticipants(): ParticipantPublic[] {
    return Array.from(this.participants.values()).map((p) => ({
      userId: p.userId,
      username: p.username,
      role: p.role,
    }));
  }

  public getParticipantCount(): number {
    return this.participants.size;
  }

  public toSyncStatePayload(): SyncStatePayload {
    return {
      videoId: this.videoId,
      playState: this.playState,
      currentTime: Math.round(this.getEffectiveCurrentTime() * 100) / 100,
      updatedAt: this.updatedAt,
    };
  }
}
