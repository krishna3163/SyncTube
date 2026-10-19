# SyncTube - AI Memory & Architecture Context ("Remember Me")

> **AI INSTRUCTION PROTOCOL (MANDATORY)**  
> 1. **Read First**: Any AI assistant working on this codebase MUST read this file first to obtain immediate deep context without needing to open and re-analyze multiple raw files.  
> 2. **Update on Change**: Whenever you add, modify, or remove features, schemas, or architectural components, you MUST update this file—specifically the **AI Memory Ledger & Changelog** at the bottom and any relevant technical sections—exactly as a senior human engineer maintains living project documentation, formatted so subsequent AI agents instantly comprehend current state.  
> 3. **Non-Breaking Guarantee**: All auxiliary features (reactions, voice/video calls, chat, playlists, ambient glow, etc.) must remain modular and toggleable via feature switch buttons so that core video playback and room synchronization are NEVER degraded or broken.

---

## 1. Project Overview & Identity
- **Repository**: `https://github.com/krishna3163/SyncTube.git`
- **Application**: **SyncTube** (Ultra-low latency synchronized watch party and live streaming platform).
- **Core Functionality**: Synchronized multi-user media consumption supporting:
  - **YouTube IFrame API** with sub-50ms synchronization and drift correction.
  - **Direct Video Streams** (MP4, WebM, HLS `.m3u8`, MPEG-DASH `.mpd`, HEVC/H.265 via Dash.js & Hevc.js).
  - **WebRTC Screen & Browser Tab Sharing** (low-latency WebRTC streams).
  - **Remote Cloud Browser / Playwright Streams** for web cinema and shared browsing.
  - **Zoom / Google Meet Style Voice & Video Calls** via Mediasoup SFU.
  - **Live Chat, Polls, Floating Emoji Reactions, and Audio Chimes**.
  - **Viewer Action Requests** (Host/Moderator approval system for seek/play/pause).

---

## 2. Monorepo Structure & File Map

```
SyncTube/
├── PROJECT_MEMORY.md          # THIS FILE: Master context & AI memory ledger
├── .agents/                   # Customization root
│   ├── rules/
│   │   └── project-memory.md  # Rule enforcing reading and updating PROJECT_MEMORY.md
│   └── skills/
│       └── ponytail/SKILL.md  # Pragmatic lazy senior dev skill (DietrichGebert/ponytail)
├── client/                    # Vite + React 18 frontend
│   ├── src/
│   │   ├── components/        # Modular UI components (see Component Directory below)
│   │   ├── pages/             # Route views: HomePage.tsx, RoomPage.tsx, TemporaryBrowserPage.tsx
│   │   ├── services/          # Socket (socket.ts) & WebRTC Call Manager (webrtcCallManager.ts)
│   │   ├── utils/             # Utilities: featureFlags.ts, soundEffects.ts, media.ts, api.ts, etc.
│   │   ├── types.ts           # Central TypeScript definitions
│   │   ├── App.tsx            # Main router & root application wrapper
│   │   └── index.css          # Design system & CSS stylesheet
├── server/                    # Node.js + Express + Socket.IO + Mediasoup SFU backend
│   ├── src/                   # Server sources, socket handlers, and room managers
│   └── dist/                  # Compiled JavaScript
└── extension/                 # Chrome MV3 Extension for tab sharing & direct streaming
```

### Key Client Component Directory
- `pages/RoomPage.tsx`: Primary watch party orchestrator. Handles socket events, video player state, layout dock, sidebar tabs, and modals.
- `components/RoomHeader.tsx`: Top navigation bar containing Room code chip, Sync Quality badge, Feature Controls button, Search, Invite, Settings, and Leave buttons.
- `components/FeatureControlsModal.tsx`: Dedicated modular Feature Switcher modal where every feature can be turned ON/OFF via button switches with live state indicators.
- `components/SettingsModal.tsx`: Room & User configuration dialog including dedicated "Features" switch tab.
- `components/YouTubePlayer.tsx`: YouTube IFrame wrapper with sync pulses, buffer handling, and play/pause/seek controllers.
- `components/DirectVideoPlayer.tsx`: HTML5 / HLS / DASH video player for direct video links and cloud stream playback.
- `components/SidebarCallStage.tsx`: Zoom/Google Meet style WebRTC audio/video call stage above sidebar tabs.
- `components/VideoAmbientBackdrop.tsx`: Real-time canvas/CSS ambient glow backdrop illuminating behind the video player.
- `components/FloatingReactions.tsx` & `ReactionOverlay.tsx`: Interactive floating emoji particles and in-player reaction bursts.
- `components/Chat.tsx`: In-room live chat, message replies, emoji reactions, and live polls.
- `components/Playlist.tsx`: Synchronized party playlist with vote-to-skip, reordering, and batch import.
- `components/ActionRequestsPanel.tsx`: Queue of pending viewer permissions (e.g. participant requests to pause or seek).
- `components/SyncQualityBadge.tsx` & `SyncDiagnosticsModal.tsx`: Live telemetry, drift milliseconds, RTT latency, and resync triggers.
- `components/BrowserHubModal.tsx`: Direct stream selector and virtual browser launcher.

---

## 3. Real-Time Synchronization Engine

### Clock Synchronization & Drift Calculation
1. **Host Pulse**: The Room Host periodically emits `host_sync_pulse` with `{ videoId, currentTime, playState, updatedAt }`.
2. **One-Way Latency & RTT Offset**:
   $$\text{latency} = \frac{\text{RTT}}{2}$$
   $$\text{expectedPosition} = \text{hostCurrentTime} + (\text{now} - \text{updatedAt}) \times \text{playbackRate}$$
   $$\text{drift} = |\text{localCurrentTime} - \text{expectedPosition}|$$
3. **Dual-Tier Drift Correction**:
   - **Soft Rate Adjustment**: When $0.2s < \text{drift} \le 1.5s$, slightly ramp playback rate (e.g., $1.05\times$ or $0.95\times$) for seamless inaudible adjustment.
   - **Hard Seek**: When $\text{drift} > 1.5s$, execute an instant atomic seek to snap into lockstep.

---

## 4. Feature Toggle & Button Switch Architecture

To satisfy the core requirement:
> *"Saare feature ko button ki tarah banao like jab chahe on ya off kar sake aur main working par koi effect na pade"*

All non-core features are decoupled behind the **Feature Flag System** in `client/src/utils/featureFlags.ts`.

### Feature Flag Schema (`RoomFeatureFlags`)
| Key | Label | Default | Description | Impact when OFF |
|---|---|---|---|---|
| `ambientGlow` | Ambient Lighting | `true` | Dynamic glow behind the player | Canvas/glow disabled; zero CPU/GPU overhead |
| `floatingReactions` | Floating Reactions | `true` | Flying emojis & reaction bar | Reactions hidden; socket reaction listeners idle |
| `soundEffects` | Sound Effects | `true` | Web Audio chimes for chat/reactions | AudioContext bypassed; complete silent mode |
| `voiceVideoCall` | Voice & Video Call | `true` | Sidebar WebRTC video/audio stage | WebRTC tracks stopped; call stage unmounted |
| `screenShare` | Screen & Tab Share | `true` | Screen sharing buttons & relays | Screen share triggers disabled/hidden |
| `chat` | Live Chat & Polls | `true` | Live messaging & room polls | Chat tab safely removed from sidebar |
| `playlist` | Playlist & Queue | `true` | Synced video queue & voting | Playlist tab safely removed from sidebar |
| `actionRequests` | Action Requests | `true` | Viewer seek/play approval system | Requests banner & tab safely removed |
| `activityFeed` | Activity Audit Log | `true` | Room event auditing log | Activity tab safely removed from sidebar |
| `browserHub` | Direct Stream & Web Hub | `true` | Hub for MP4/HLS/Cloud Browser | Hub launch buttons hidden |
| `syncDiagnostics` | Sync Diagnostics | `true` | Quality telemetry badge & modal | Telemetry badge in header safely hidden |
| `theaterMode` | Theater Lights Dim | `false` | Dimmed cinematic background | Standard background illumination |
| `autoResync` | Auto Drift Recovery | `true` | Automatic soft-nudge sync pulses | Manual resync button only; no auto-nudges |

### Safe Mode & Core Player Isolation Guarantee
- **The Core Working** consists solely of:
  1. Room connection & socket heartbeat (`join_room`, `leave_room`).
  2. Active Video Player (`YouTubePlayer` or `DirectVideoPlayer`).
  3. Playback State Synchronization (`play`, `pause`, `seek`, `change_video`).
  4. Basic Viewers list (`ParticipantList`).
- Toggling ANY of the 13 feature flags ON or OFF operates under defensive guards. Even if a feature is toggled off or throws an internal error, the core video player will **never crash, pause, or lose sync**.

---

## 5. How to Access & Toggle Features
Users have two immediate ways to toggle features like buttons:
1. **Header Feature Controls Button**:
   - Located in `RoomHeader.tsx` next to Settings with a `SlidersHorizontal` icon.
   - Opens `FeatureControlsModal` with toggle buttons, live active badges, and preset filters ("Minimal / Pure Video", "Full Party").
2. **Settings Modal -> Features Tab**:
   - In `SettingsModal.tsx`, select the "Features" tab to toggle any switch with real-time persistence in `localStorage`.

---

## 6. AI Memory Ledger & Changelog

### Entry 1: 2026-10-19 — Project Memory, Ponytail Skill & Modular Feature Switch System
- **Author**: Antigravity Assistant (Pair programmer with Krishna)
- **Objective**:
  1. Establish `PROJECT_MEMORY.md` as the permanent AI memory bank and context provider.
  2. Install and configure `ponytail` skill (`.agents/skills/ponytail/SKILL.md`) for lazy, pragmatic senior-level development.
  3. Build modular Feature Toggle architecture (`client/src/utils/featureFlags.ts`, `client/src/components/FeatureControlsModal.tsx`) allowing every feature to be turned ON/OFF via button switches without affecting core video synchronization.
- **Files Touched**:
  - `PROJECT_MEMORY.md` (Created master AI memory & architecture documentation)
  - `.agents/rules/project-memory.md` (Created agent rule to read & update this file)
  - `.agents/skills/ponytail/SKILL.md` (Added Ponytail senior dev skill)
  - `client/src/utils/featureFlags.ts` (Feature flag store, localStorage synchronization, React hook)
  - `client/src/components/FeatureControlsModal.tsx` (Interactive feature toggle modal with presets and live switch buttons)
  - `client/src/components/RoomHeader.tsx` (Added quick Feature Controls button)
  - `client/src/components/SettingsModal.tsx` (Added Features tab alongside Room & User tabs)
  - `client/src/pages/RoomPage.tsx` (Wired feature flags to dynamically hide/disable features without touching core player)
  - `client/src/utils/soundEffects.ts` (Guarded audio synthesizer with `soundEffects` feature flag)
  - `client/src/__tests__/featureFlags.test.ts` (Unit test suite for feature flags: defaults, toggle, batch presets, reset, and subscriber notifications)
- **Status & Verification**:
  - `npm run typecheck` passes with zero errors across server, client, and extension.
  - Client vitest suite runs 8 test files (31 tests) with 100% passing.
  - Core player remains isolated and robust.
  - Features cleanly unmount/mount dynamically upon toggle.
  - Settings persist across browser refreshes.

### Entry 2: 2026-10-19 — UI Upgrade via 5 Open-Source Repositories (shadcn/ui, Magic UI, Motion Primitives, Origin UI, ImageKit Video Player)
- **Author**: Antigravity Assistant (Senior Frontend Engineer & Design Systems Architect)
- **Objective**:
  1. Systematically elevate SyncTube's real-time watch party UI without altering video synchronization, socket events, or WebRTC call state.
  2. Synthesize patterns from 5 repositories into a unified dark cinematic design system:
     - **shadcn/ui**: Standardized 34px button heights, 8px/10px border radii, accessible focus rings, segmented tabs, and consistent badge tokens.
     - **Magic UI**: Subtle `@keyframes borderBeam`, floating ambient halo, and `@keyframes shimmerSlide` on live badges without continuous moving particle distractions.
     - **Motion Primitives**: Smooth modal scale-in (`motionScaleIn`), crossfade tab switching (`motionSlideUp`), checkmark bounce feedback (`animate-check-bounce`), micro-press scaling (`:active { transform: scale(0.97) }`), and complete `@media (prefers-reduced-motion: reduce)` compliance.
     - **Origin UI**: Professional empty-player stage (`origin-cinema-stage`) with clear primary/secondary visual hierarchy (Search YouTube, Share Screen, Direct Stream) replacing cheesy emoji titles, plus an enhanced search input bar with left icon, instant clear (`X`) button, and shortcut badge (`↵ Enter`).
     - **ImageKit Video Player**: Precision timeline seekbar with floating hover timestamp preview pill (`.timeline-hover-pill`) positioned dynamically above the cursor.
- **Files Touched**:
  - `client/src/index.css`: Added complete 5-repo design system tokens, keyframes, timeline hover pill, cinema stage, search group, and motion utilities.
  - `client/src/components/PlaybackControls.tsx`: Added hover timestamp preview state (`hoverTime`, `hoverPercent`), timeline mouse move handlers, and `.timeline-hover-pill` floating tooltip above seekbar.
  - `client/src/pages/RoomPage.tsx`: Replaced empty player state with Origin UI `origin-cinema-stage` (halo badge, clean typography, primary/secondary action buttons) and stripped random trailing emojis.
  - `client/src/components/RoomHeader.tsx`: Integrated animated checkmark bounce (`animate-check-bounce`) for room code copy feedback and unified 34px action heights.
  - `client/src/components/StreamInfoBar.tsx`: Enhanced LIVE status pill with Magic UI shimmer badge and animated checkmark feedback on stream link copy.
  - `client/src/components/YouTubeSearchModal.tsx`: Upgraded search bar with Origin UI search group (left icon, clear button, shortcut badge) and modal entrance transition (`motion-scale-in`).
- **Status & Verification**:
  - `npm run typecheck` passes with zero errors across server, client, and extension.
  - `npm run test:client` runs 8 test files (31 tests) with 100% passing.
  - `npm run build:client` builds Vite production bundle cleanly (0 errors).
  - Socket.IO synchronization, WebRTC calls, YouTube API, and DASH playback untouched and 100% preserved.

### Entry 3: 2026-10-19 — Render Production Build & Playwright Dependency Fix
- **Author**: Antigravity Assistant (Pair programmer with Krishna)
- **Objective**:
  1. Fix Render deployment build failure (`TS2307: Cannot find module 'playwright'`).
  2. Add `playwright` directly to `server/package.json` dependencies so production installs include it under `NODE_ENV=production`.
  3. Streamline root `build:server` to avoid redundant duplicate `npx playwright install chromium` executions.
  4. Configure Render service `srv-dbb4t0mq1p3s73evcakg` build command to `npm install --include=dev && npm run build:server` and set `healthCheckPath: /health`.
- **Files Touched**:
  - `server/package.json`: Added `playwright: ^1.63.0` to `dependencies`.
  - `package.json`: Streamlined `build:server` script.
  - `package-lock.json`: Synchronized dependency tree.
  - `PROJECT_MEMORY.md`: Logged Entry 3 ledger update.
- **Status & Verification**:
  - `npm run typecheck` passes with zero errors across server, client, and extension.
  - Render web service configuration successfully updated via Render API.

### Entry 4: 2026-10-19 — Deep Multi-Repository Hardening & Production Upgrade
- **Author**: Antigravity Assistant (Pair programmer with Krishna)
- **Objective**:
  1. Complete architectural analysis of 5 mandatory reference repositories (`watchparty`, `mediasoup-demo`, `open-watch-party`, `watch-party-sync`, `socket.io-redis-streams-adapter`).
  2. Implement Mediasoup SFU caller authorization, call-block validation, and cascading transport cleanup upon eviction or block.
  3. Optimize playback drift thresholds (`HARD_RESYNC_THRESHOLD_MS: 2000ms`) and smooth micro-rate adjustments (1.06x / 0.94x) in `UniversalSyncSession`.
  4. Implement `isExecutingRemoteCommand` event loop prevention lock in Chrome extension content script.
  5. Add Redis Streams cluster adapter readiness with `connectionStateRecovery` in `server/src/index.ts`.
  6. Fortify temporary browser navigation and write unit test suites covering all newly hardened subsystems.
- **Files Touched**:
  - `docs/architecture/REFERENCE_REPOSITORY_ANALYSIS.md` (Created reference repository analysis)
  - `docs/architecture/BASELINE_AUDIT.md` (Created baseline code inventory and P0-P3 audit)
  - `docs/architecture/SYNCTUBE_IMPROVEMENT_PLAN.md` (Created detailed improvement plan)
  - `server/src/socket/handler.ts` (Added SFU caller authorization guards and cascading transport cleanup)
  - `server/src/sync/universalSync.ts` (Tightened 2000ms hard resync threshold & soft drift rate adjust)
  - `server/src/services/tempBrowserManager.ts` (Tolerated client redirect aborts gracefully in navigate)
  - `server/src/index.ts` (Integrated Redis Streams adapter support and connectionStateRecovery)
  - `.env.example` (Added Redis Streams cluster configuration variables)
  - `extension/src/content/contentScript.ts` (Added `isExecutingRemoteCommand` echo-prevention lock)
  - `server/src/__tests__/sfuAuth.test.ts` (Created SFU authorization & call-block test suite)
  - `server/src/__tests__/universalSyncDrift.test.ts` (Created drift calculation & threshold test suite)
  - `server/src/__tests__/tempBrowser.test.ts` (Improved navigation stability with standard test domain)
  - `extension/tests/loopPrevention.test.ts` (Created extension remote command event suppression test)
- **Status & Verification**:
  - `npm run test:server`: 18/18 test files passed (117/117 tests passing).
  - `npm run test:client`: 8/8 test files passed (31/31 tests passing).
  - `npm run test:extension`: 2/2 test files passed (18/18 tests passing).
  - Total automated test count: 166/166 passing (0 failures).
  - `npm run typecheck`: Passed with 0 errors across server, client, and extension.
  - `npm run build`: Production server & client builds succeed cleanly.
  - `npm run build:extension`: Extension bundled in `extension/dist/` without errors.

### Entry 5: 2026-10-19 — Render Keep-Alive, Auto-Healer & Multi-Account Rotation Automation
- **Author**: Antigravity Assistant (Pair programmer with Krishna)
- **Objective**:
  1. Build automated GitHub Actions keeper workflow (`.github/workflows/render-keeper.yml`) running every 10 minutes to prevent Render free-tier inactivity sleep (spindown).
  2. Implement intelligent self-healing script (`scripts/render-keeper.mjs`) that performs health checks with retry-backed cold start tolerance.
  3. Support multi-account Render API key rotation (`RENDER_API_KEYS` / `RENDER_API_KEY_1`, `RENDER_API_KEY_2`, `RENDER_API_KEY_3`) across 3 accounts (2,250 free hours/month total) to automatically deploy a fresh Web Service when an account hits quota or requests an upgrade.
  4. Automatically clean up stale services and update project endpoints (`vercel.json`, `client/vercel.json`, `client/src/utils/api.ts`, `client/src/services/socket.ts`, `README.md`) seamlessly via Git commits.
- **Files Touched**:
  - `.github/workflows/render-keeper.yml`: Created 10-minute cron keep-alive & auto-healer workflow with support for up to 3+ API keys.
  - `scripts/render-keeper.mjs`: Created self-healing and multi-account rotation script.
  - `client/src/__tests__/soundAndMobile.test.ts`: Added sound preferences & celebration confetti test suite.
  - `vercel.json` & `client/vercel.json`: Updated backend endpoint targets to `https://synctube-qg7l.onrender.com`.
  - `client/src/utils/api.ts` & `client/src/services/socket.ts`: Updated production fallback targets.
  - `README.md`: Updated active backend health check badge URL.
  - `PROJECT_MEMORY.md`: Logged Entry 5 documentation ledger update.
- **Status & Verification**:
  - `node scripts/render-keeper.mjs` executed locally and verified: cold-start detected, 200 OK received, backend awake.
  - All 3 Render API keys verified via Render API (`api.render.com/v1/owners`).
  - `npm run test:client`: 9/9 test files passed (36/36 tests passing).
  - GitHub Action workflow validated.

### Entry 6: 2026-10-20 — Production-Grade UI/UX, Mobile UX (320–430px), Soundboard & Reactions Upgrade
- **Author**: Antigravity Assistant (Pair programmer with Krishna)
- **Objective**:
  1. Inspect and implement comprehensive mobile-first navigation and layout for 320–430px viewports with prominent video player, fixed bottom navigation dock (`MobileBottomNav`), and accessible swipeable bottom drawer (`MobileDrawer` inspired by Vaul).
  2. Implement synthesized Web Audio API sound effects (`client/src/utils/soundEffects.ts`) with zero external file downloads, featuring master volume slider, global mute, and individual event toggles for user join/leave, chat messages, and live emoji reactions.
  3. Create curated Soundboard Modal (`SoundboardModal.tsx`) with 6 watch-party effects (Applause, Airhorn, Cheer, Nani?!, Wow!, Boom), local preview, room broadcast, and cooldown timer.
  4. Integrate celebration confetti (`client/src/utils/confetti.ts` using `canvas-confetti`) with reduced-motion support, triggered on room creation and party reactions (🎉).
  5. Enforce server-side rate limits on emoji reactions (max 10 reactions / 3s) and soundboard effects (1s cooldown) in `server/src/socket/handler.ts`.
  6. Polish chat entrance animations (`@keyframes chatMsgEntrance`) and mobile quick actions hub.
- **Files Touched**:
  - `client/src/components/MobileBottomNav.tsx`: Created mobile bottom navigation dock (Stage, Chat, Playlist, Viewers, Sounds, More).
  - `client/src/components/MobileDrawer.tsx`: Created Vaul-inspired accessible bottom drawer with swipe-down dismissal and safe-area insets.
  - `client/src/components/SoundboardModal.tsx`: Created interactive soundboard with volume slider, preview, and broadcast.
  - `client/src/components/RoomHeader.tsx`: Integrated dedicated soundboard trigger button.
  - `client/src/pages/RoomPage.tsx`: Wired real-time sound effects, confetti on 🎉, mobile bottom nav, and mobile drawer panels.
  - `client/src/pages/HomePage.tsx`: Added milestone celebration confetti on room creation.
  - `client/src/utils/confetti.ts`: Created lightweight celebration and party confetti utility with prefers-reduced-motion check.
  - `client/src/utils/soundEffects.ts`: Implemented synthesized sound effects, volume routing, and sound preferences storage.
  - `server/src/socket/handler.ts`: Added rate limiting for `send_reaction` (10/3s) and cooldown for `send_sound_effect` (1s).
  - `client/src/__tests__/soundAndMobile.test.ts`: Created unit test suite covering sound preferences and confetti.
  - `client/src/index.css`: Added styles for mobile bottom nav, bottom drawer, soundboard modal, chat entrance animations, and mobile hub grid.
- **Status & Verification**:
  - `npm run typecheck`: Passed with 0 errors across server, client, and extension.
  - `npm run test:client`: 9/9 test files passed (36/36 tests passing).
  - `npm run test:server`: 18/18 test files passed (117/117 tests passing).
  - `npm run build`: Production bundle built cleanly (0 errors).
  - Playwright real browser verification on iPhone 14 viewport (390x844): Verified room creation, milestone confetti, mobile bottom nav, chat drawer open/send, soundboard preview, and quick actions hub.

### Entry 7: 2026-10-20 — Home Action Cards (div[1]), Watch Party History (div[3]) & Social Sharing Overhaul
- **Author**: Antigravity Assistant (Pair programmer with Krishna)
- **Objective**:
  1. Fix and dramatically elevate the UI/UX of the Home page action cards (XPath `//*[@id="root"]/div/div[2]/div/div/div/div[1]` - `.home-card.create-card` and `.home-card.join-card`) and Watch Party History container (XPath `//*[@id="root"]/div/div[2]/div/div/div/div[3]` - `.stored-parties-section`).
  2. Implement frosted 3D glassmorphic cards with luminous top-glow accents (warm amber for Create, electric cyan for Join), glowing icon badges, and vibrant gradient CTA buttons (`.create-action-btn` and `.join-action-btn`).
  3. Re-engineer the Watch Party History section with an ambient glowing TV icon box, clean badge counters, and dashed gold-tinted container.
  4. Design official brand vector SVGs in `client/src/components/SocialBrandIcons.tsx` for WhatsApp (`#25D366`), Telegram (`#229ED9`), Discord (`#5865F2`), X/Twitter (`#F8FAFC`), and Reddit (`#FF4500`).
  5. Create reusable `SocialShareBar.tsx` with direct web intents, formatted Discord markdown invites, native Web Share API integration, and copy-link with audio chime feedback.
  6. Integrate `SocialShareBar` and `playLinkCopySound` across `InviteModal.tsx`, `ShareStreamModal.tsx`, and `StreamInfoBar.tsx`.
  7. Add automated test coverage in `client/src/__tests__/soundAndMobile.test.ts` for social URL generation and copy chime logic.
- **Files Touched**:
  - `client/src/components/SocialBrandIcons.tsx`: Created official platform SVG icons.
  - `client/src/components/SocialShareBar.tsx`: Created responsive social sharing bar.
  - `client/src/components/InviteModal.tsx`: Added `SocialShareBar` and link copy sound feedback.
  - `client/src/components/ShareStreamModal.tsx`: Added `SocialShareBar` and link copy sound feedback.
  - `client/src/components/StreamInfoBar.tsx`: Wired `playLinkCopySound()` to stream link copying.
  - `client/src/pages/HomePage.tsx`: Added card subtitles, symmetrical input layout, and Lucide Info icon.
  - `client/src/index.css`: Overhauled styles for `.home-grid`, `.home-card`, `.home-card-icon-box`, `.create-action-btn`, `.join-action-btn`, `.stored-parties-section`, and `.social-share-bar`.
  - `client/src/__tests__/soundAndMobile.test.ts`: Added social share URL unit tests.
- **Status & Verification**:
  - `npm run typecheck`: Passed with 0 errors.
  - `npm run test:client`: 9/9 test files passed (37/37 tests passing).
  - `npm run test:server`: 18/18 test files passed (117/117 tests passing).
  - `npm run build`: Production server & client builds succeed cleanly (0 errors).
  - Visual verification with Playwright headless Chrome: Captured full-resolution desktop screenshot (`desktop_home_current.png`) confirming pristine visual aesthetics, symmetry, and glowing gradients.

*(Future AI assistants: Append your changes above this line, keeping exact dates and files touched).*
