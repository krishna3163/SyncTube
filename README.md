# SyncTube

Watch YouTube videos together in real time. Create a room, invite friends, and enjoy synchronized playback, chat, and shared party features from your browser.

[Open SyncTube](https://sync-tube-tqda.vercel.app) · [Backend status](https://synctube-2ar4.onrender.com/health)

## Preview

![SyncTube home page](client/public/synctube-homepage.png)

## What you can do

- Create a watch party with an optional YouTube video, or join with a room code.
- Watch videos in sync and control playback according to your room role.
- Chat, send live reactions, create polls, and manage a shared playlist.
- Invite friends and return to saved rooms from your watch party history.
- Adjust your local playback settings without changing what other viewers hear.

## Start a watch party

1. Open [SyncTube](https://sync-tube-tqda.vercel.app).
2. Enter your name and create a room, optionally adding a YouTube link.
3. Share the room code with friends so they can join.
4. Choose a video and use the room chat and controls together.

## Run locally

Requires Node.js 18 or later and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The local API and room connection run alongside the website.

## Website updates

The website is hosted on Vercel and the room service is hosted on Render. Pushes to `main` automatically update the deployments; Render waits for the GitHub checks to pass before deploying.
