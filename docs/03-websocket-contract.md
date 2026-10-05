# WebSocket / Socket.IO Contract

Use Socket.IO unless there is a strong reason to use raw `ws`.

## Client → Server

### join_room
```json
{ "roomId": "ABC123", "username": "Krishna" }
```

### leave_room
```json
{ "roomId": "ABC123" }
```

### play
```json
{}
```
Requires Host or Moderator.

### pause
```json
{}
```
Requires Host or Moderator.

### seek
```json
{ "time": 125.4 }
```
Requires Host or Moderator.

### change_video
```json
{ "videoId": "dQw4w9WgXcQ", "play": true }
```
Requires Host or Moderator.
The optional `play` flag starts the selected video at `0` for every room member.

### assign_role
```json
{ "userId": "user-id", "role": "MODERATOR" }
```
Requires Host.

### remove_participant
```json
{ "userId": "user-id" }
```
Requires Host.

## Server → Client

### sync_state
```json
{
  "videoId": "dQw4w9WgXcQ",
  "playState": "playing",
  "currentTime": 125.4
}
```

### user_joined
```json
{
  "username": "Aman",
  "userId": "user-id",
  "role": "PARTICIPANT",
  "participants": []
}
```

### user_left
```json
{
  "username": "Aman",
  "userId": "user-id",
  "participants": []
}
```

### role_assigned
```json
{
  "userId": "user-id",
  "username": "Aman",
  "role": "MODERATOR",
  "participants": []
}
```

### participant_removed
```json
{
  "userId": "user-id",
  "participants": []
}
```

### error
```json
{
  "code": "FORBIDDEN",
  "message": "You do not have permission to perform this action."
}
```

## Event handling rules
- Never trust a client-provided role.
- Derive the role from server-side room membership.
- Validate every payload.
- Never broadcast an unauthorized mutation.
- Prefer broadcasting canonical state after mutation.
