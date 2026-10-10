export type PlatformId = 'youtube' | 'generic' | 'netflix' | 'prime' | 'disney' | 'twitch' | string;

export type UniversalState =
  | 'CREATED'
  | 'WAITING'
  | 'READY'
  | 'PLAYING'
  | 'PAUSED'
  | 'BUFFERING'
  | 'ENDED'
  | 'CLOSED';

export interface MediaIdentity {
  platform: PlatformId;
  mediaId: string;
  title: string;
  url?: string;
  duration?: number;
  thumbnail?: string;
}

export interface UniversalPlaybackState {
  revision: number;
  state: UniversalState;
  position: number;
  playbackRate: number;
  timestamp: number;
  mediaIdentity: MediaIdentity | null;
  lastEventId?: string;
  lastUpdatedBy?: string;
}

export interface ParticipantReadiness {
  userId: string;
  username: string;
  status: 'ready' | 'loading' | 'buffering' | 'desynced' | 'not_connected';
  reportedPosition?: number;
  mediaMatched: boolean;
  activePlatform?: string;
  activeMediaId?: string;
  updatedAt: number;
}

export interface DriftAssessment {
  driftMs: number;
  action: 'none' | 'soft_rate_adjust' | 'hard_seek';
  targetRate?: number;
  targetPosition?: number;
}

export const DRIFT_CONFIG = {
  MIN_DRIFT_THRESHOLD_MS: 250,
  HARD_RESYNC_THRESHOLD_MS: 1000,
  SOFT_ACCELERATE_RATE: 1.05,
  SOFT_DECELERATE_RATE: 0.95,
};

export class UniversalSyncSession {
  private revision: number = 0;
  private state: UniversalState = 'PAUSED';
  private position: number = 0;
  private playbackRate: number = 1.0;
  private updatedAt: number = Date.now();
  private mediaIdentity: MediaIdentity | null = null;
  private processedEventIds: Set<string> = new Set();
  private readiness: Map<string, ParticipantReadiness> = new Map();
  private autoPlayWhenReady: boolean = false;

  constructor(initialMedia?: MediaIdentity) {
    if (initialMedia) {
      this.mediaIdentity = initialMedia;
    }
  }

  public getRevision(): number {
    return this.revision;
  }

  public getMediaIdentity(): MediaIdentity | null {
    return this.mediaIdentity;
  }

  public setMediaIdentity(media: MediaIdentity, updaterId?: string): number {
    this.mediaIdentity = media;
    this.position = 0;
    this.state = 'PAUSED';
    this.playbackRate = 1.0;
    this.updatedAt = Date.now();
    this.revision++;
    return this.revision;
  }

  public getEffectivePosition(): number {
    if (this.state === 'PLAYING') {
      const elapsedSeconds = Math.max(0, (Date.now() - this.updatedAt) / 1000);
      return this.position + elapsedSeconds * this.playbackRate;
    }
    return this.position;
  }

  public getStateSnapshot(): UniversalPlaybackState {
    return {
      revision: this.revision,
      state: this.state,
      position: Math.round(this.getEffectivePosition() * 100) / 100,
      playbackRate: this.playbackRate,
      timestamp: Date.now(),
      mediaIdentity: this.mediaIdentity,
    };
  }

  public isEventProcessed(eventId: string): boolean {
    return this.processedEventIds.has(eventId);
  }

  public recordEvent(eventId: string): void {
    this.processedEventIds.add(eventId);
    if (this.processedEventIds.size > 500) {
      const first = this.processedEventIds.values().next().value;
      if (first) this.processedEventIds.delete(first);
    }
  }

  public applyPlay(position?: number, eventId?: string, senderId?: string): { success: boolean; state: UniversalPlaybackState; rejectedReason?: string } {
    if (eventId && this.isEventProcessed(eventId)) {
      return { success: true, state: this.getStateSnapshot() };
    }

    if (typeof position === 'number' && !isNaN(position) && position >= 0) {
      this.position = position;
    } else {
      this.position = this.getEffectivePosition();
    }

    this.state = 'PLAYING';
    this.updatedAt = Date.now();
    this.revision++;

    if (eventId) this.recordEvent(eventId);

    const snapshot = this.getStateSnapshot();
    snapshot.lastEventId = eventId;
    snapshot.lastUpdatedBy = senderId;
    return { success: true, state: snapshot };
  }

  public applyPause(position?: number, eventId?: string, senderId?: string): { success: boolean; state: UniversalPlaybackState; rejectedReason?: string } {
    if (eventId && this.isEventProcessed(eventId)) {
      return { success: true, state: this.getStateSnapshot() };
    }

    if (typeof position === 'number' && !isNaN(position) && position >= 0) {
      this.position = position;
    } else {
      this.position = this.getEffectivePosition();
    }

    this.state = 'PAUSED';
    this.updatedAt = Date.now();
    this.revision++;

    if (eventId) this.recordEvent(eventId);

    const snapshot = this.getStateSnapshot();
    snapshot.lastEventId = eventId;
    snapshot.lastUpdatedBy = senderId;
    return { success: true, state: snapshot };
  }

  public applySeek(targetPosition: number, eventId?: string, senderId?: string): { success: boolean; state: UniversalPlaybackState; rejectedReason?: string } {
    if (eventId && this.isEventProcessed(eventId)) {
      return { success: true, state: this.getStateSnapshot() };
    }

    this.position = Math.max(0, targetPosition);
    this.updatedAt = Date.now();
    this.revision++;

    if (eventId) this.recordEvent(eventId);

    const snapshot = this.getStateSnapshot();
    snapshot.lastEventId = eventId;
    snapshot.lastUpdatedBy = senderId;
    return { success: true, state: snapshot };
  }

  // Drift assessment helper for clients
  public assessDrift(clientReportedPosition: number, rttMs: number = 0): DriftAssessment {
    const serverPosition = this.getEffectivePosition();
    // Adjust for one-way network latency estimate
    const latencyAdjustedServerPosition = serverPosition + (this.state === 'PLAYING' ? (rttMs / 2000) * this.playbackRate : 0);
    const driftSec = clientReportedPosition - latencyAdjustedServerPosition;
    const driftMs = Math.round(driftSec * 1000);

    const absDriftMs = Math.abs(driftMs);

    if (absDriftMs < DRIFT_CONFIG.MIN_DRIFT_THRESHOLD_MS) {
      return { driftMs, action: 'none' };
    }

    if (absDriftMs >= DRIFT_CONFIG.HARD_RESYNC_THRESHOLD_MS) {
      return {
        driftMs,
        action: 'hard_seek',
        targetPosition: latencyAdjustedServerPosition,
      };
    }

    // Between 250ms and 1000ms: Soft rate adjust
    return {
      driftMs,
      action: 'soft_rate_adjust',
      targetRate: driftMs < 0 ? DRIFT_CONFIG.SOFT_ACCELERATE_RATE : DRIFT_CONFIG.SOFT_DECELERATE_RATE,
    };
  }

  // Readiness management
  public setParticipantReadiness(
    userId: string,
    username: string,
    status: ParticipantReadiness['status'],
    options: {
      reportedPosition?: number;
      activePlatform?: string;
      activeMediaId?: string;
    } = {}
  ): ParticipantReadiness {
    const isMatched =
      !this.mediaIdentity ||
      (options.activePlatform === this.mediaIdentity.platform &&
        (!options.activeMediaId || options.activeMediaId === this.mediaIdentity.mediaId));

    const record: ParticipantReadiness = {
      userId,
      username,
      status,
      reportedPosition: options.reportedPosition,
      mediaMatched: isMatched,
      activePlatform: options.activePlatform,
      activeMediaId: options.activeMediaId,
      updatedAt: Date.now(),
    };

    this.readiness.set(userId, record);
    return record;
  }

  public removeParticipantReadiness(userId: string): void {
    this.readiness.delete(userId);
  }

  public getAllReadiness(): ParticipantReadiness[] {
    return Array.from(this.readiness.values());
  }

  public areAllParticipantsReady(): boolean {
    if (this.readiness.size === 0) return true;
    for (const r of this.readiness.values()) {
      if (r.status !== 'ready') return false;
    }
    return true;
  }

  public setAutoPlayWhenReady(enabled: boolean): void {
    this.autoPlayWhenReady = enabled;
  }

  public shouldAutoPlayWhenReady(): boolean {
    return this.autoPlayWhenReady && this.areAllParticipantsReady() && this.state !== 'PLAYING';
  }
}
