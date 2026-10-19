# SyncTube — Architecture & Implementation Improvement Plan

**Document Status**: Approved & In Progress  
**Date**: October 19, 2026  
**Architect**: Principal Software Architect  

---

## Task Matrix Overview

| Task ID | Component | Priority | Target Ref Repo | Status |
|---|---|---|---|---|
| **TASK-1** | Mediasoup SFU Authorization & Eviction | **P0** | Official Mediasoup Demo | In Progress |
| **TASK-2** | Playback Engine Hard Drift Threshold | **P1** | WatchParty & Watch Party Sync | Ready |
| **TASK-3** | Browser Extension Event-Loop Prevention | **P1** | Watch Party Sync | Ready |
| **TASK-4** | Distributed Socket.IO Redis Streams Adapter | **P2** | Socket.IO Redis Streams Adapter | Ready |
| **TASK-5** | Automated Security & Regression Test Suite | **P2** | All reference repositories | Ready |

---

## Detailed Task Specifications

### TASK-1: Mediasoup SFU Server-Authoritative Calling Security & Eviction
- **Priority**: **P0**
- **Problem**: When a room host or moderator blocks a disruptive participant via `admin_toggle_block_call`, the user's active SFU media producers/consumers in `mediasoupManager` were not immediately destroyed. Furthermore, SFU handlers (`sfu:produce`, `sfu:create_transport`, etc.) failed to check `room.isBlockedFromCall(participant.userId)`.
- **Evidence**: `server/src/socket/handler.ts` lines 1450–1470 and 2125–2280.
- **Root Cause**: Signaling permissions and SFU media routing were not fully synchronized upon administrative block/kick.
- **Proposed Solution**:
  1. Add strict `room.isBlockedFromCall(participant.userId)` guards to all SFU socket endpoints (`sfu:create_transport`, `sfu:connect_transport`, `sfu:produce`, `sfu:consume`, `sfu:consumer_resume`, `sfu:consumer_preferred_layers`, `sfu:close_producer`).
  2. In `admin_toggle_block_call`, if the participant is blocked, immediately invoke:
     ```ts
     mediasoupManager.handleParticipantLeave(room.id, targetSocket.id);
     callTopologyPolicyManager.removeCaller(room.id, targetSocket.id);
     ```
     and broadcast `call:topology_transition` to notify remaining peers.
  3. In `remove_participant`, perform identical media teardown.
- **Reference Repository**: Official Mediasoup Demo (`versatica/mediasoup-demo`) — Cascading structural resource cleanup.
- **Files Changing**: `server/src/socket/handler.ts`.
- **Dependency Impact**: None (uses existing `mediasoupManager` and `callTopologyPolicyManager`).
- **Security Implications**: Prevents call eavesdropping, unauthorized media streaming, and moderator bypass.
- **Acceptance Criteria**: Blocked participants cannot create transports or produce tracks, and are immediately evicted from ongoing calls.

---

### TASK-2: Playback Synchronization Engine & Drift Threshold Hardening
- **Priority**: **P1**
- **Problem**: `HARD_RESYNC_THRESHOLD_MS` in `server/src/sync/universalSync.ts` was set to `15000` (15 seconds).
- **Evidence**: `server/src/sync/universalSync.ts` line 53.
- **Root Cause**: Overly generous drift threshold caused desynced participants to lag for tens of seconds before hard resyncing.
- **Proposed Solution**:
  1. Reduce `HARD_RESYNC_THRESHOLD_MS` to `2000` (2.0s).
  2. When $|drift| \ge 2.0s$, `assessDrift` emits `action: 'hard_seek'` with the target position compensated for latency.
  3. For minor drift ($250ms \le |drift| < 2.0s$), emit soft rate adjustment (1.06x / 0.94x).
- **Reference Repositories**: WatchParty (`howardchung/watchparty`) & Watch Party Sync (`eicyer/watch-party-sync`).
- **Files Changing**: `server/src/sync/universalSync.ts`.
- **Dependency Impact**: None.
- **Acceptance Criteria**: Client position evaluated at $> 2.0s$ drift immediately returns `hard_seek`.

---

### TASK-3: Browser Extension Event-Loop Prevention
- **Priority**: **P1**
- **Problem**: Programmatic `PLAY`, `PAUSE`, `SEEK` commands sent to `extension/src/content/contentScript.ts` trigger HTML5 video DOM events that are captured by `currentAdapter.subscribeToEvents` and re-emitted back to the background worker and server in an infinite sync loop.
- **Evidence**: `extension/src/content/contentScript.ts` lines 24–51 and 74–120.
- **Proposed Solution**:
  Implement the programmatic lock pattern:
  - Add `isExecutingRemoteCommand` boolean flag.
  - Set `isExecutingRemoteCommand = true` before executing `adapter.play()`, `adapter.pause()`, or `adapter.seek()`.
  - In `subscribeToEvents`, if `isExecutingRemoteCommand` is true, drop the event and return early.
  - Reset `isExecutingRemoteCommand = false` after 150ms debounce.
- **Reference Repository**: Watch Party Sync (`eicyer/watch-party-sync`).
- **Files Changing**: `extension/src/content/contentScript.ts`.
- **Dependency Impact**: None.
- **Acceptance Criteria**: Remote playback commands do not trigger outbound playback echo events.

---

### TASK-4: Clustered Socket.IO Redis Streams Adapter Support
- **Priority**: **P2**
- **Problem**: `server/src/index.ts` only looked for classic `@socket.io/redis-adapter` pub/sub, which drops inter-server packets during temporary Redis hiccups.
- **Proposed Solution**:
  Support both `@socket.io/redis-streams-adapter` (primary) and `@socket.io/redis-adapter` (fallback).
  Configure Socket.IO `connectionStateRecovery` and validate environment variables with graceful in-memory fallback.
- **Reference Repository**: Official Socket.IO Redis Streams Adapter (`socketio/socket.io-redis-streams-adapter`).
- **Files Changing**: `server/src/index.ts`, `.env.example`.
- **Dependency Impact**: Zero mandatory new dependencies; uses optional peer loading pattern.
- **Acceptance Criteria**: System starts cleanly in in-memory mode, and uses Redis Streams when packages and `REDIS_URL` are provided.

---

### TASK-5: Automated Security & Regression Test Suite
- **Priority**: **P2**
- **Problem**: Ensure newly hardened behaviors (call eviction, SFU security, 2-second hard seek threshold, extension loop lock) have explicit automated test verification.
- **Proposed Solution**:
  Create new automated unit and integration tests:
  - `server/src/__tests__/sfuAuth.test.ts`
  - `server/src/__tests__/universalSyncDrift.test.ts`
  - `extension/tests/loopPrevention.test.ts`
- **Files Changing**: `server/src/__tests__/`, `extension/tests/`.
- **Acceptance Criteria**: All new and existing tests pass (100% success rate).
