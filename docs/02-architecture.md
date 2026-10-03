# Architecture

## High-level
Browser (React/Vite)
→ HTTP API + Socket.IO
→ Node/Express server
→ active room state + PostgreSQL persistence when needed
→ YouTube IFrame Player API in browser

## Responsibilities
### Frontend
- routes/pages
- room UI
- YouTube player adapter
- local UI state
- Socket.IO connection
- participant/role display
- role-aware controls

### Backend
- room creation/joining
- room membership
- role enforcement
- authoritative playback state
- event validation
- broadcasting
- participant removal
- health endpoint

### Database
Persist only what is actually needed:
- rooms
- optional participant metadata
- optional room state
- timestamps

For MVP, active Socket.IO membership can remain in server memory. Do not build Redis or multi-region infrastructure unless the assignment needs it.

## Authoritative state
The server owns the room state. A client event is a request to mutate server state, not proof that the client is allowed to do so.

Flow:
1. Client emits event.
2. Server validates payload.
3. Server identifies participant/session.
4. Server checks role.
5. Server updates room state.
6. Server broadcasts canonical state.
7. Clients reconcile their YouTube player.

## Feedback-loop rule
A remote state update must not trigger the same outbound event again.
