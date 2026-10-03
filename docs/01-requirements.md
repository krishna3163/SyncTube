# Functional Requirements

## Room
- Create a room.
- Generate a short unique room code.
- Creator becomes Host.
- Join by room code or link.
- Reject invalid/nonexistent rooms.
- Show current participants and roles.

## Playback
Authorized roles:
- Host
- Moderator

Actions:
- play
- pause
- seek
- change video

State:
- `videoId`
- `playState`
- `currentTime`
- optional `updatedAt`

## Participant management
Host:
- assign Moderator
- demote Moderator to Participant
- remove participant
- optional transfer host

## Requests
If bonus/request flow is implemented:
- Participant can request a playback/video change.
- Host/Moderator can approve or reject.
- The requested action is not applied until approved.

## Synchronization
On join:
- server sends current room state.
After an authorized state change:
- server updates authoritative room state.
- server broadcasts the resulting state to all clients.

## Reconnect
On reconnect:
- client rejoins/re-authenticates its room session.
- server sends current authoritative state.
- client corrects local player state.

## UI
Required:
- create room
- join room
- YouTube player
- playback controls
- current room code/link
- participant list
- role badges
- host moderation controls
- connection status
- useful error messages
