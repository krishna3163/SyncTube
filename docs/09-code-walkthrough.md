# Code Walkthrough Preparation

Be able to explain these topics.

## Why Socket.IO?
Event-based bidirectional real-time communication and reconnection behavior.

## Why backend-authoritative state?
A browser is untrusted. Frontend button hiding is not authorization. The backend checks the actor and role before changing room state.

## Synchronization
Host clicks Play
→ client emits `play`
→ server checks role
→ server updates room state
→ server broadcasts `sync_state`
→ clients update YouTube player
→ clients reconcile to canonical state.

## Feedback-loop prevention
Remote `sync_state` must not emit the same local event back to the server.

## Vercel + Render
Vercel hosts the browser frontend; Render runs the long-lived Node/Socket.IO service.

## Deployment concerns
- environment variables
- CORS
- HTTPS/WSS
- dynamic PORT
- health checks
- reconnects

## Trade-offs
In-memory active rooms are simple but disappear after process restart. PostgreSQL adds persistence and migrations. Multi-instance WebSocket scaling would need shared state/pub/sub and is not an MVP requirement.
