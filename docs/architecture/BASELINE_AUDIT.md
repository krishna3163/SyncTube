# SyncTube — Baseline Verification & Codebase Audit

**Document Status**: Complete & Verified  
**Date**: October 19, 2026  
**Auditor**: Principal Software Architect & QA Automation Engineer  

---

## 1. Verified Baseline Test & Build Outcomes

Before any code modifications, the entire repository was executed and audited to establish an honest starting baseline.

| Command | Target Workspace | Test Files | Total Tests | Outcome | Details / Log |
|---|---|---|---|---|---|
| `npm run typecheck` | Root (Server + Client + Extension) | All | — | **PASS** | 0 TypeScript errors across all 3 `tsconfig.json` configurations. |
| `npm run test:server` | `server` | 16 | 109 | **PASS** | All 109 unit & integration tests passed. |
| `npm run test:client` | `client` | 8 | 31 | **PASS** | All 31 client tests (feature flags, memory, hybrid calls, sentry, codecs) passed. |
| `npm run test:extension` | `extension` | 1 | 17 | **PASS** | All 17 adapter registry and platform tests passed. |
| `npm run build:extension`| `extension` | — | — | **PASS** | Extension build completed into `extension/dist/`. |
| `npm run build:client` | `client` | — | — | **PASS** | Vite production bundle created in 22.48s without errors. |

**Baseline Integrity Result**: The codebase has a solid test foundation (157 automated tests passing across 25 test suites). No pre-existing test failures exist.

---

## 2. Architecture & Codebase Inventory

### Monorepo Workspaces:
- **`server/`** (Node.js 20+, Express, Socket.IO 4.8.1, mediasoup 3.29.0, PostgreSQL with pg pool / in-memory fallback, Zod 3.24, Sentry, Tsx).
- **`client/`** (React 18.3, TypeScript 5.7, Vite 6.2, mediasoup-client 3.24, dashjs 5.2, @hevcjs/dashjs-plugin, Lucide React).
- **`extension/`** (Chrome Manifest V3, Web Extension APIs, custom platform adapters for YouTube, Netflix, Prime, Disney+ Hotstar, generic HTML5).
- **`e2e/`** (Playwright test suite for room creation, watch party workflows, and extension interaction).

---

## 3. Prioritized Audit Findings

### [P0 / P1] Security & Server-Authoritative Media Calling
- **Finding**: In `server/src/socket/handler.ts`, SFU media operations (`sfu:produce`, `sfu:consume`, `sfu:connect_transport`, `sfu:consumer_resume`, `sfu:consumer_preferred_layers`, `sfu:close_producer`) did not verify `room.isBlockedFromCall(participant.userId)`.
- **Vulnerability**: A participant blocked from calling by the room host could still produce media tracks or consume SFU streams if they retained an active socket or bypassed `call:join`.
- **Teardown Gap**: When a host invoked `admin_toggle_block_call`, the server toggled the boolean flag but failed to immediately tear down the user's active SFU WebRTC transports, producers, and consumers in `mediasoupManager`. The blocked user continued transmitting video/audio to peers until manual disconnect.

### [P1] Universal Playback Synchronization & Drift Engine
- **Finding**: In `server/src/sync/universalSync.ts`, `HARD_RESYNC_THRESHOLD_MS` was set to `15000` (15 seconds).
- **Correctness Issue**: In synchronous watch parties with simultaneous voice/video calls, a 15-second threshold is far too loose. If a participant drifted 3–5 seconds behind, the server only commanded soft playback rate adjustments (1.06x), which takes minutes to catch up.
- **Remediation**: Adjust `HARD_RESYNC_THRESHOLD_MS` to `2000` (2.0 seconds) to ensure responsive, instant atomic snap seeks when noticeable desync occurs, matching industry standards.

### [P1] Extension Event-Loop Prevention
- **Finding**: In `extension/src/content/contentScript.ts`, when incoming messages (`PLAY`, `PAUSE`, `SEEK`) were executed via `chrome.runtime.onMessage`, the underlying HTML5 video element fired domestic `play`/`pause`/`seeked` events.
- **Echo Risk**: The content script's `currentAdapter.subscribeToEvents` listener captured these programmatic events and rebroadcast them back to `chrome.runtime.sendMessage` and `window.postMessage('SYNCTUBE_TAB_EVENT')`, creating a feedback loop between the player and extension runtime.
- **Remediation**: Implement the lock pattern (`isExecutingRemoteCommand` flag with automatic reset window).

### [P2] Distributed Horizontal Scaling & Redis Streams Adapter
- **Finding**: In `server/src/index.ts`, Socket.IO multi-instance scaling only looked for `@socket.io/redis-adapter` (classic pub/sub).
- **Resilience Gap**: Classic pub/sub drops messages during transient network disconnects. Repository E demonstrated that `@socket.io/redis-streams-adapter` uses Redis Streams (`XADD`/`XREADGROUP`) to provide bounded message buffering and native `connectionStateRecovery`.
- **Remediation**: Enhance `server/src/index.ts` to support both `@socket.io/redis-streams-adapter` and `@socket.io/redis-adapter` with environment validation and graceful in-memory fallback.

### [P3] Testing Coverage Gaps
- **Finding**: Existing tests validated happy-path calling and basic room joining, but lacked explicit tests asserting:
  1. Denial of SFU operations when a caller is call-blocked.
  2. Immediate SFU producer teardown upon host block.
  3. UniversalSync drift assessment with 2-second hard seek threshold.
  4. Extension loop prevention lock behavior.
