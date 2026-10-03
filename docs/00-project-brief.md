# Project Brief

## Assignment
Intern Assignment: YouTube Watch Party System.

The application lets multiple users watch YouTube videos together in real time. When an authorized user plays, pauses, seeks, or changes the video, other users in the same room should receive the same state.

## Required pillars
1. Real-time synchronization
2. Room-based model
3. YouTube integration
4. WebSockets
5. Role-based access control
6. Public deployment
7. README + architecture explanation
8. Code walkthrough readiness

## Roles
### Host
Automatically assigned to the room creator.
- play/pause
- seek
- change video
- assign roles
- remove participants
- optional host transfer

### Moderator
Assigned by Host.
- play/pause
- seek
- change video
- optional participant/role management

### Participant
Default role for joiners.
- watch only
- cannot directly control playback

For MVP, Host + Participant may be simplified, but the Host must be able to promote a participant to Moderator.

## Important security rule
The backend must reject privileged events from unauthorized roles. Hiding a button in React is not authorization.

## Deployment target
- GitHub for repository/source control
- Vercel for the React frontend
- Render for the Node.js + Socket.IO backend
- PostgreSQL for persistence if used
