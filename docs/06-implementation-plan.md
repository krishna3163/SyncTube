# Implementation Plan

Build in small vertical slices.

## Phase 0 — Bootstrap
- frontend + backend
- TypeScript
- lint/format
- `.env.example`
- README
- health endpoint
- local startup verification

## Phase 1 — Room engine
- Room
- RoomManager
- create/join/leave
- participant list
- Host assignment

Checkpoint: two browser sessions can join one room.

## Phase 2 — WebSocket state
- Socket.IO
- typed event contract
- authoritative state
- `sync_state`
- reconnect handling

## Phase 3 — YouTube
- YouTube IFrame API adapter
- common YouTube URL → video ID parsing
- load/play/pause/seek
- feedback-loop prevention

## Phase 4 — RBAC
- permission map
- Host/Moderator/Participant
- backend rejection of unauthorized events
- host role assignment
- host removal

## Phase 5 — UI polish
- responsive layout
- role-aware controls
- loading/error states
- connection status
- copy room link
- accessibility

## Phase 6 — Persistence
Only if needed:
- PostgreSQL
- migrations
- room metadata

Do not overbuild the database.

## Phase 7 — Testing
Test room lifecycle, playback, forbidden events, malformed payloads, reconnect, and production configuration.

## Phase 8 — Deployment
Frontend → Vercel.
Backend/WebSocket → Render.
Database → PostgreSQL provider.
Configure CORS and environment variables.
Use HTTPS/WSS in production.

## Phase 9 — Final QA
Two/three browser sessions → Better Bugs smoke test → Ponytail review → Ponytail audit → README/live URL verification.
