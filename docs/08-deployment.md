# Deployment Plan

## Platform split
### GitHub
Source control, issues, pull requests, CI.

### Vercel
Host the React/Vite frontend.

### Render
Host the Node.js/Express/Socket.IO backend.

### PostgreSQL
Use Neon PostgreSQL or Render PostgreSQL if persistence is required.

## Frontend environment
```env
VITE_API_URL=https://YOUR-BACKEND.onrender.com
VITE_SOCKET_URL=https://YOUR-BACKEND.onrender.com
```

## Backend environment
```env
PORT=10000
NODE_ENV=production
FRONTEND_URL=https://YOUR-FRONTEND.vercel.app
DATABASE_URL=postgresql://...
```

Never commit real credentials.

## Render
- Web Service
- Node runtime
- Build: `npm ci && npm run build`
- Start: `npm start`
- Health: `/health`
- bind to `0.0.0.0`
- use platform `PORT`
- configure exact frontend CORS origin

Production browser connections must use HTTPS and secure WebSocket/Socket.IO transport.

## Vercel
- Vite frontend
- Build: `npm run build`
- Output: `dist`
- set `VITE_*` variables
- configure SPA fallback if client-side routing is used

## Database
Start with in-memory active room state if persistence is not required. Add PostgreSQL only for persistence that actually helps the assignment.

## Deployment acceptance
Do not mark deployment complete until:
- frontend loads
- backend health works
- Socket.IO connects from Vercel
- two public browser sessions synchronize playback
- CORS works
- reconnect works
- README contains actual live URLs
