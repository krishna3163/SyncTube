# SyncTube — Real-Time YouTube Watch Party System

A production-grade, real-time synchronized YouTube watch party application built with **React**, **TypeScript**, **Node.js**, **Socket.IO**, and the **YouTube IFrame Player API**.

[![Live App on Vercel](https://img.shields.io/badge/Vercel-Live%20Frontend-black?style=for-the-badge&logo=vercel)](https://sync-tube-tqda.vercel.app)
[![Backend on Render](https://img.shields.io/badge/Render-Live%20Backend-46E3B7?style=for-the-badge&logo=render&logoColor=black)](https://synctube-2ar4.onrender.com)
[![CI Pipeline](https://github.com/krishna3163/SyncTube/actions/workflows/ci.yml/badge.svg)](https://github.com/krishna3163/SyncTube/actions)

### 🌐 Live Deployments
- 🚀 **Live Web Application (Vercel):** [https://sync-tube-tqda.vercel.app](https://sync-tube-tqda.vercel.app)
- ⚙️ **Live Backend Service (Render):** [https://synctube-2ar4.onrender.com](https://synctube-2ar4.onrender.com)
- 🩺 **Backend Health Check:** [https://synctube-2ar4.onrender.com/health](https://synctube-2ar4.onrender.com/health)

---

## 🌟 Features

- **Authoritative Real-Time Synchronization**: Play, pause, seek, and video changes are verified and broadcast with low latency via Socket.IO.
- **Role-Based Access Control (RBAC)**:
  - 👑 **Host**: Full control over playback, room settings, role assignments (promote to Moderator / demote to Participant), and participant kicking.
  - 🛡️ **Moderator**: Access to play, pause, seek, and change video.
  - 👤 **Participant**: Synchronized viewing with read-only state.
- **Server-Side Security**: All privileged operations are strictly validated and enforced on the backend. Unauthorized actions receive structured `FORBIDDEN` error responses.
- **Echo & Feedback-Loop Prevention**: Programmatic updates from remote sync do not trigger duplicate outbound socket emissions.
- **Drift Reconciliation**: Computes server-authoritative elapsed time and reconciles client playback drift automatically.
- **Persistent Metadata (Optional)**: Seamless in-memory operation with optional PostgreSQL persistence via `DATABASE_URL`.
- **Responsive Modern UI**: Dark-mode glassmorphic interface built with Vanilla CSS design tokens, Plus Jakarta Sans typography, and Lucide icons.

---

## 🏗️ Architecture

```text
Browser (React + Vite)
      │
      ├─── HTTP REST API ───► Express Server (/health, /api/rooms)
      │
      ├─── WebSockets ──────► Socket.IO Server
      │                          │
      │                          ├── Room Engine (Authoritative State)
      │                          ├── RBAC Validator (Permission Matrix)
      │                          └── PostgreSQL (Optional Persistence)
      │
      └─── YouTube IFrame Player API (Reconciled with Server State)
```

### RBAC Permission Matrix

| Action | Host | Moderator | Participant |
| :--- | :---: | :---: | :---: |
| **Play Video** | ✅ | ✅ | ❌ |
| **Pause Video** | ✅ | ✅ | ❌ |
| **Seek Timeline** | ✅ | ✅ | ❌ |
| **Change Video** | ✅ | ✅ | ❌ |
| **Assign Roles** | ✅ | ❌ | ❌ |
| **Remove / Kick Participant** | ✅ | ❌ | ❌ |

---

## 📁 Repository Structure

```text
├── client/                     # Frontend application (React + TypeScript + Vite)
│   ├── src/
│   │   ├── components/         # YouTubePlayer, PlaybackControls, ParticipantList, RoomHeader
│   │   ├── pages/              # HomePage, RoomPage
│   │   ├── services/           # Socket.IO client manager
│   │   ├── utils/              # YouTube URL extraction & timestamp formatters
│   │   └── types.ts            # Shared client TypeScript types
│   ├── index.html              # HTML shell with Google fonts & metadata
│   └── vite.config.ts          # Vite configuration (builds into root ../dist)
│
├── server/                     # Backend application (Node.js + Express + Socket.IO)
│   ├── src/
│   │   ├── models/             # Room and RoomManager authoritative engines
│   │   ├── socket/             # Socket.IO event handlers and Zod validation schemas
│   │   ├── services/           # RBAC permissions and PostgreSQL DatabaseService
│   │   ├── utils/              # YouTube ID extraction and URL parsing
│   │   ├── __tests__/          # Vitest suite (Permissions, Room, API, Sockets, YouTube)
│   │   ├── app.ts              # Express application definition
│   │   └── index.ts            # Server entrypoint & WebSocket listener
│   └── tsconfig.json           # NodeNext TypeScript configuration
│
├── render.yaml                 # Render backend deployment blueprint
├── vercel.json                 # Vercel frontend deployment blueprint
└── package.json                # Monorepo root workspaces configuration
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18 (Tested on v22)
- **npm** >= 9

### Installation

```bash
git clone <repo-url>
cd youtube-watch-party-ai-build-pack
npm install
```

### Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

Default variables:
```env
# Backend
PORT=10000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
DATABASE_URL=               # Optional: PostgreSQL connection string

# Frontend
VITE_API_URL=http://localhost:10000
VITE_SOCKET_URL=http://localhost:10000
```

### Running Locally

To run both backend and frontend concurrently:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:10000`
- Health check: `http://localhost:10000/health`

Alternatively, to build and run production mode:

```bash
npm run build
npm start
```
The unified production server will serve the API, WebSockets, and the frontend on `http://localhost:10000`.

---

## 🧪 Testing

The test suite covers:
- **Unit tests**: Room lifecycle, YouTube URL extraction, RBAC permission matrix.
- **Integration tests**: Socket.IO connection, room join/leave, sync broadcasts, server-side RBAC enforcement, unauthorized event rejections, malformed payload rejections, participant kick/block, and REST endpoints.

Run all tests:
```bash
npm test
```

Run server tests:
```bash
npm run test:server
```

Run client tests:
```bash
npm run test:client
```

---

## 🚢 Deployment

### 1. Frontend (Vercel)
- **Framework Preset**: Vite
- **Root Directory**: `./` (or `client`)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_URL`: `https://synctube-2ar4.onrender.com`
  - `VITE_SOCKET_URL`: `https://synctube-2ar4.onrender.com`

### 2. Backend (Render)
- **Environment**: Node
- **Build Command**: `npm ci --include=dev && npm run build:server`
- **Start Command**: `npm start`
- **Health Check Path**: `/health`
- **Environment Variables**:
  - `NODE_ENV`: `production`
  - `PORT`: `10000` (or platform default)
  - `FRONTEND_URL`: `https://sync-tube-tqda.vercel.app`
  - `DATABASE_URL`: Optional (e.g. Supabase or Neon PostgreSQL connection string)

---

## 🛡️ Verification & Ponytail Discipline

This application adheres to **Ponytail full mode** constraints:
- Zero unnecessary abstractions or speculative pub-sub infrastructure.
- High-integrity authoritative state engine.
- 100% strict server-side authorization checks.
- 32 automated unit and integration tests passing.
