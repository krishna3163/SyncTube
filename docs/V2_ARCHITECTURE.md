# SyncTube V2: Universal Watch Party Architecture & Specification

## 1. Executive Summary

SyncTube V2 transforms the platform from a single-service YouTube player into a **Universal Watch Party System** capable of synchronizing playback across any web video platform.

### Core Principle
> **"SyncTube synchronizes the watch experience, not the video stream."**

- **Zero Stream Proxying:** Video streams are never downloaded, proxied, transcoded, or re-broadcasted through SyncTube servers.
- **Zero Credential / Token Interception:** Users authenticate directly with video providers using their own subscriptions and browsers.
- **Zero DRM Bypass:** Protected media remains strictly within the provider's authorized player and DRM sandbox.
- **Authoritative Control Channel:** SyncTube transmits lightweight, event-driven timeline coordination commands (`state`, `position`, `timestamp`, `revision`).

---

## 2. High-Level Architecture

```
                    ┌─────────────────────────────────┐
                    │          SyncTube V2            │
                    └────────────────┬────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌─────────────────────────┐                         ┌─────────────────────┐
│  SyncTube Web Client    │                         │  Browser Extension  │
│  (React 19 + TypeScript)│                         │    (Manifest V3)    │
└──────────┬──────────────┘                         └──────────┬──────────┘
           │                                                   │
           │  YouTube IFrame API                               │  Platform Adapters
           ├────────────────────────┐               ┌──────────┼──────────┐
           ▼                        ▼               ▼          ▼          ▼
     YouTube Player           Custom Video      YouTube    Netflix*   Generic
       (Embedded)              (HTML5/HLS)      (Native)   (Limited)  (HTML5)
           │                        │               │          │          │
           └────────────────────────┴───────┬───────┴──────────┴──────────┘
                                            │
                                            ▼
                                Universal Sync Protocol
                            (JSON + Monotonic Revisions)
                                            │
                                            ▼
                               SyncTube Real-Time Core
                              (Socket.IO + Node/Express)
                                            │
                                            ▼
                               Database & Persistence
                             (PostgreSQL / Memory Fallback)
```

*\* Streaming platforms with strict DRM or UI sandboxing expose graceful "Limited Support" (media detection only) without invasive script injection.*

---

## 3. Universal Sync Protocol

### State Machine

```
              ┌───────────────┐
              │    CREATED    │
              └───────┬───────┘
                      │ host sets video
                      ▼
              ┌───────────────┐
              │    WAITING    │◄───────────────┐
              └───────┬───────┘                │
                      │ participants buffering  │ participant
                      ▼                        │ reports buffering
              ┌───────────────┐                │
              │     READY     │────────────────┘
              └───────┬───────┘
                      │ host triggers play
                      ▼
   ┌───────────►┌───────────┐
   │ resume     │  PLAYING  ├──────────┐
   │            └─────┬─────┘          │ pause
   │                  │ drift > 1s     │
   │                  ▼                ▼
   │            ┌───────────┐    ┌───────────┐
   │            │ BUFFERING │    │  PAUSED   │
   │            └─────┬─────┘    └─────┬─────┘
   │                  │                │ video ends
   │                  ▼                ▼
   └─────────── ┌───────────┐    ┌───────────┐
                │   READY   │    │   ENDED   │
                └───────────┘    └───────────┘
```

### Authoritative State Payload

```typescript
export interface UniversalPlaybackState {
  roomId: string;
  platform: 'youtube' | 'generic' | 'custom';
  mediaIdentity: {
    platform: string;
    mediaId: string;
    title?: string;
    url?: string;
    duration?: number;
  };
  state: 'CREATED' | 'WAITING' | 'READY' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ENDED';
  position: number;        // Current playback time in seconds
  playbackRate: number;    // e.g. 1.0, 1.05, 0.95
  timestamp: number;       // Server epoch ms when position was recorded
  revision: number;        // Monotonically increasing sequence number
  updatedBy: string;       // userId of initiator
}
```

### Drift Calculation & Correction Algorithm

When a participant client checks synchronization against the authoritative server state:

1. **Calculate Target Position:**
   $$\text{elapsed} = \frac{\text{now}() - \text{timestamp}}{1000}$$
   $$\text{targetPosition} = \text{state} = \text{'PLAYING'} \,?\, \text{position} + (\text{elapsed} \times \text{playbackRate}) : \text{position}$$

2. **Compute Absolute Drift:**
   $$\text{drift} = |\text{clientPosition} - \text{targetPosition}|$$

3. **Multi-Tier Correction Strategy:**
   - **$\text{drift} < 250\,\text{ms}$ (`none`):** Within natural audio-visual tolerance. No action taken; playback rate stays $1.0\times$.
   - **$250\,\text{ms} \le \text{drift} \le 1000\,\text{ms}$ (`soft_rate_adjust`):** Imperceptible pitch-preserved rate change:
     - Client is behind: rate temporarily set to $1.05\times$.
     - Client is ahead: rate temporarily set to $0.95\times$.
   - **$\text{drift} > 1000\,\text{ms}$ (`hard_seek`):** Instant programmatic seek directly to $\text{targetPosition}$ and rate reset to $1.0\times$.

---

## 4. Manifest V3 Browser Extension

Located in `extension/`, the SyncTube Extension provides cross-site synchronization for platforms outside the embedded iframe sandbox.

### Structure
- **`manifest.json`:** Manifest V3 schema with isolated content scripts and background service worker.
- **`src/adapters/PlatformAdapter.ts`:** Abstract interface defining required playback controls (`play`, `pause`, `seek`, `getCurrentTime`, `getDuration`, `getCapabilities`).
- **`src/adapters/YouTubeAdapter.ts`:** Native adapter targeting YouTube web players (`video.html5-main-video`).
- **`src/adapters/GenericHTML5Adapter.ts`:** Fallback adapter discovering standard `<video>` elements with debounce safeguards.
- **`src/adapters/registry.ts`:** Adapter registry with URL matching and capability detection.
- **`src/popup/`:** Extension popup with party connection UI, room code binding, and platform health status.

### Security Guarantees
- No permissions for cookies, credentials, or header modifications.
- Communication with SyncTube web client via standard `window.postMessage` bridge with origin verification.
- Inactive when not in an active watch party.

---

## 5. User Accounts & Persistence

### Authentication Architecture
- **Algorithm:** Node.js native `crypto.scrypt` with random 16-byte salt (64-byte key length).
- **Verification:** Constant-time `crypto.timingSafeEqual` prevents timing attack side-channels.
- **Sessions:** Cryptographically random 32-byte hex session tokens with 30-day expiration.
- **Dual Persistence:**
  - Production: PostgreSQL database (`users`, `sessions`, `rooms`, `watch_history`, `friendships`).
  - Fallback: Thread-safe in-memory maps for zero-dependency standalone deployments.

### Guest Compatibility
- Unregistered users can join any room instantly with guest credentials.
- Registered users enjoy persistent avatars, watch history across devices, and room ownership recovery.

---

## 6. V2 REST API Reference

| Endpoint | Method | Description | Auth |
|---|---|---|---|
| `/api/auth/register` | `POST` | Create a new user account | Public |
| `/api/auth/login` | `POST` | Authenticate and obtain session token | Public |
| `/api/auth/logout` | `POST` | Terminate session | Bearer Token |
| `/api/me` | `GET` | Get current user profile | Bearer Token |
| `/api/profile` | `PUT` | Update bio, avatar, or display name | Bearer Token |
| `/api/platforms` | `GET` | Supported platforms and sync capabilities | Public |
| `/api/rooms/:roomId/readiness` | `GET` | Read current participant readiness states | Public |
| `/api/rooms/:roomId/sync` | `GET` | Read current authoritative playback snapshot | Public |
| `/api/history` | `GET` | Retrieve user watch history | Bearer Token |

---

## 7. Quality Assurance & Verification Report

### Test Suite Execution
- **Server:** 67 tests passing (auth, universal sync, v2 REST APIs, socket handling, permissions, rooms, sentry).
- **Client:** 11 tests passing (sentry, character memory, youtube identity).
- **Extension:** 8 tests passing (URL matching, YouTube adapter, Generic HTML5 adapter, registry detection).
- **Total:** **86 unit/integration tests passing with 0 failures.**

### Production Build Validation
- `npm run build -w server`: TypeScript compilation clean (`tsc` -> 0 errors).
- `npm run build -w client`: TypeScript compilation & Vite bundle clean (`tsc && vite build` -> 0 errors).
- `npm run build -w extension`: TypeScript compilation clean (`tsc` -> 0 errors).
