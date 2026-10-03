# RBAC and Security

| Action | Host | Moderator | Participant |
|---|---:|---:|---:|
| Play | yes | yes | no |
| Pause | yes | yes | no |
| Seek | yes | yes | no |
| Change video | yes | yes | no |
| Assign role | yes | no | no |
| Remove participant | yes | no | no |
| Transfer host | yes | no | no |

## Backend pattern
```text
socket event
   ↓
validate payload
   ↓
find room membership from server state
   ↓
check permission(role, action)
   ↓
if denied → emit FORBIDDEN
   ↓
if allowed → mutate room state
   ↓
broadcast canonical state
```

## Threats to test
- Participant emits `play`, `pause`, `seek`, `change_video`.
- Participant emits `assign_role`.
- Moderator attempts `assign_role`.
- Participant tries to remove another user.
- User joins a nonexistent room.
- User sends malformed video ID.
- User sends invalid role string.
- User reconnects after being removed.
- Two users attempt conflicting playback actions.

## Input validation
Validate room code, username, role enum, YouTube video ID, seek time, and event shape.

Never expose stack traces or secrets to clients.
