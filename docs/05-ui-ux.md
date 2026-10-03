# UI/UX Brief

Create a clean, beginner-friendly, polished interface.

## Home
- app name
- short explanation
- Create Room
- Join Room
- username
- room code
- validation/error states

## Room
- video/player area
- playback controls
- video URL/change input
- room code + copy link
- participant list
- role badges
- host-only management controls
- connection indicator
- errors

## Role-aware UI
Host:
- full controls
- assign role
- remove participant

Moderator:
- playback controls

Participant:
- playback controls disabled/hidden
- explanation that only Host/Moderator can control playback

UI restrictions are for usability; backend checks are the security boundary.

## UX states
- connecting
- connected
- reconnecting
- disconnected
- room not found
- permission denied
- invalid YouTube URL
- participant removed
- server error
