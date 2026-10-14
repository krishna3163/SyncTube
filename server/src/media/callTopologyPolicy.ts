/**
 * Call Topology Policy Manager
 * 
 * Enforces production media architecture based strictly on active media call members:
 * - 0 or 1 caller: IDLE (no P2P, no SFU resources)
 * - 2 callers: P2P (direct WebRTC with STUN/TURN fallback)
 * - 3+ callers: SFU (Mediasoup Selective Forwarding Unit)
 * 
 * Transition Safety & Hysteresis:
 * - 2 -> 3 callers: Triggers atomic transition from P2P to SFU.
 * - 3+ -> 2 callers: Call remains in SFU mode to eliminate rapid oscillation (hysteresis).
 * - Drops to IDLE only when callers <= 1.
 */

export type CallTopologyMode = 'idle' | 'p2p' | 'sfu';

export interface TopologyDecision {
  roomId: string;
  previousMode: CallTopologyMode;
  targetMode: CallTopologyMode;
  version: number;
  shouldTransition: boolean;
  activeCallerCount: number;
  callers: string[];
}

export interface RoomTopologyState {
  roomId: string;
  mode: CallTopologyMode;
  version: number;
  isTransitioning: boolean;
  callerSocketIds: Set<string>;
  createdAt: number;
  updatedAt: number;
}

export interface TopologyPolicyConfig {
  /** Configured mode: 'hybrid' (default), 'sfu_only', 'p2p_only', or 'disabled' */
  configuredMode?: 'hybrid' | 'sfu_only' | 'p2p_only' | 'disabled';
  /** Max participants allowed in a single call */
  maxCallParticipants?: number;
}

export class CallTopologyPolicyManager {
  private roomStates: Map<string, RoomTopologyState> = new Map();
  private config: Required<TopologyPolicyConfig>;

  constructor(config?: TopologyPolicyConfig) {
    this.config = {
      configuredMode: config?.configuredMode || (process.env.CALL_TOPOLOGY_MODE as any) || 'hybrid',
      maxCallParticipants: config?.maxCallParticipants || 50,
    };
  }

  /**
   * Get current topology state for a room
   */
  public getRoomState(roomId: string): RoomTopologyState {
    let state = this.roomStates.get(roomId);
    if (!state) {
      state = {
        roomId,
        mode: 'idle',
        version: 1,
        isTransitioning: false,
        callerSocketIds: new Set(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.roomStates.set(roomId, state);
    }
    return state;
  }

  /**
   * Evaluate topology when a new active caller joins the media call
   */
  public evaluateOnJoin(roomId: string, socketId: string): TopologyDecision {
    const state = this.getRoomState(roomId);
    const previousMode = state.mode;

    state.callerSocketIds.add(socketId);
    state.updatedAt = Date.now();

    const count = state.callerSocketIds.size;
    let targetMode: CallTopologyMode = 'idle';

    if (this.config.configuredMode === 'disabled') {
      targetMode = 'idle';
    } else if (this.config.configuredMode === 'sfu_only') {
      targetMode = count >= 2 ? 'sfu' : 'idle';
    } else if (this.config.configuredMode === 'p2p_only') {
      targetMode = count >= 2 ? 'p2p' : 'idle';
    } else {
      // Default Hybrid Mode
      if (count <= 1) {
        targetMode = 'idle';
      } else if (count === 2) {
        // If already in SFU due to hysteresis, keep it in SFU
        targetMode = previousMode === 'sfu' ? 'sfu' : 'p2p';
      } else {
        // count >= 3
        targetMode = 'sfu';
      }
    }

    const shouldTransition = targetMode !== previousMode;
    if (shouldTransition) {
      state.mode = targetMode;
      state.version += 1;
      state.isTransitioning = targetMode === 'sfu' && previousMode === 'p2p';
    }

    return {
      roomId,
      previousMode,
      targetMode,
      version: state.version,
      shouldTransition,
      activeCallerCount: count,
      callers: Array.from(state.callerSocketIds),
    };
  }

  /**
   * Evaluate topology when a caller leaves the media call
   */
  public evaluateOnLeave(roomId: string, socketId: string): TopologyDecision {
    const state = this.getRoomState(roomId);
    const previousMode = state.mode;

    state.callerSocketIds.delete(socketId);
    state.updatedAt = Date.now();

    const count = state.callerSocketIds.size;
    let targetMode: CallTopologyMode = previousMode;

    if (count <= 1) {
      targetMode = 'idle';
      state.isTransitioning = false;
    } else if (count === 2) {
      // ANTI-FLAPPING HYSTERESIS:
      // If currently in SFU, do NOT flip back to P2P. Retain SFU until call ends.
      if (previousMode === 'sfu') {
        targetMode = 'sfu';
      } else if (this.config.configuredMode === 'hybrid') {
        targetMode = 'p2p';
      }
    } else {
      // count >= 3
      targetMode = this.config.configuredMode === 'p2p_only' ? 'p2p' : 'sfu';
    }

    const shouldTransition = targetMode !== previousMode;
    if (shouldTransition) {
      state.mode = targetMode;
      state.version += 1;
    }

    // Clean up empty room state
    if (count === 0) {
      this.roomStates.delete(roomId);
    }

    return {
      roomId,
      previousMode,
      targetMode,
      version: state.version,
      shouldTransition,
      activeCallerCount: count,
      callers: Array.from(state.callerSocketIds),
    };
  }

  /**
   * Confirm that all participants have successfully established SFU connections
   */
  public confirmTransition(roomId: string, version: number): boolean {
    const state = this.roomStates.get(roomId);
    if (!state) return false;

    if (state.version === version && state.isTransitioning) {
      state.isTransitioning = false;
      state.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Remove room state upon room disposal
   */
  public removeRoom(roomId: string): void {
    this.roomStates.delete(roomId);
  }

  /**
   * Check if a socket is an active media caller in the given room
   */
  public isCallerInRoom(roomId: string, socketId: string): boolean {
    const state = this.roomStates.get(roomId);
    return Boolean(state && state.callerSocketIds.has(socketId));
  }
}

export const callTopologyPolicyManager = new CallTopologyPolicyManager();
