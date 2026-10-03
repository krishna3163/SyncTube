# Platform Map

| Need | Platform | Why |
|---|---|---|
| Source code | GitHub | Git hosting, issues, PRs, CI |
| Frontend | Vercel | React/Vite frontend |
| Backend | Render | Node/Express + WebSocket service |
| Database | Neon PostgreSQL or Render PostgreSQL | Persistent room metadata |
| Browser debugging | Better Bugs | Reproducible bug reports + optional HAR |
| AI code quality | Ponytail | Reduce over-engineering and audit diffs |

Architecture:
GitHub → Vercel (frontend)
GitHub → Render (backend)
Backend → PostgreSQL
Browser → YouTube IFrame API
Browser ↔ Render → Socket.IO/WebSocket
