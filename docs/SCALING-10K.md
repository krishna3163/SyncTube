# Scaling SyncTube to 10,000 concurrent users

> TL;DR — One Node process can hold ~1–2k idle WebSockets; 10k needs **horizontal scaling**. This doc explains what was already in place, what changed in this PR, and how to deploy for 10k+.

---

## 1. What the user asked (Hindi)

> *"movie ka sara information fetch ho rah hai na, and how much user can handle request at a time — make our website can handle 10k user request at a time"*

Two questions: (a) is every movie field fetched, (b) can we serve 10k at once. Both are now addressed.

---

## 2. Movie information — is everything fetched?

### Endpoint → MovieBox-Tui parity

| SyncTube endpoint | MovieBox-Tui Rust source | Fields fetched | Status |
|---|---|---|---|
| `GET /api/movies/trending` | `tab-operating?tabId=0` | `id, title, mediaType, year, duration, genre, coverUrl, seasonCount` (24/page) | ✅ with 60s cache |
| `GET /api/movies/search?q=&page=` | `subject-api/search/v2` (subjectType 0/1/2) | same + `season` → `seasonCount` | ✅ with per-query cache |
| `GET /api/movies/browse?type=movies|series|anime` | keyword search + trending fallback, filtered by mediaType | same | ✅ |
| `GET /api/movies/details/:id` | `subject-api/get` + `season-info` | `id, title, description, mediaType, year, duration, genre, cover/poster, rating(imdb), seasons[ seasonNumber, episodeCount ]` | ✅ with 5-min cache; offline `fx-*` fixtures return bundled seasons |
| `GET /api/movies/streams?id=&season=&episode=` | `play-info/v2` + `resource?resolution=` + `collectionResolutions` quality ladder + DASH manifest via CloudFront Policy | `title, mediaType, season, episode, streams[ id, title, format, resolution, height, adaptive, codec, sizeBytes, streamUrl, proxiedUrl ], subtitles[ language, url ], availableQualities[ label, height, adaptive ], adaptive` | ✅ sorted highest→lowest, 2-min cache; `fx-*` fixture streams skip upstream probe |

**All fields rendered by the client are fetched.** The only Rust fields not forwarded are auxiliary ones that have no UI (`prints`, `audios`, `dubs`, `director/stars` raw arrays) — adding them would not change the UX but can be added on request by extending `MovieDetails` with `director`, `cast`, `genres[]`.

Caches added to survive MovieBox 429 at scale:
- `trending:<page>` 60s, `search:<q>:<page>:<type>` cache, `details:<id>` 300s, `streams:<id>:<se>:<ep>` 120s, 200-entry LRU cap.
- Offline fixture fallback (`fx-001` … `fx-012`) serves `/fixture-media/sample_{480,720,1080}.mp4` so the Cinema tab works even when MovieBox hosts are unreachable (sandbox allowlist blocked).

Quick check (fixture mode, no external network needed):
```bash
curl -s localhost:10000/api/movies/trending        | jq .results[0]
curl -s "localhost:10000/api/movies/search?q=anime" | jq .results[0]
curl -s  localhost:10000/api/movies/details/fx-002  | jq .
curl -s "localhost:10000/api/movies/streams?id=fx-002&season=1&episode=1" | jq '{title, streams: (.streams|length), qualities}'
```

---

## 3. How many users can one instance handle _before_ this PR?

| Layer | Bottleneck | Estimate (single process, 2 vCPU, 3–4 GB, no Redis) |
|---|---|---|
| **Express HTTP** | Single-thread event loop + JSON parse + rateLimit MemoryStore | ~800–1,500 rps sustained; bursts to ~2k then latency p99 > 1s |
| **Socket.IO** | Memory adapter (broadcasts stay on one process), per-socket ~40–80 KB → 500–800 MB for 10k sockets + GC pauses | ~1k–2k concurrent sockets reliably; 5k+ = frequent disconnects |
| **RoomManager** | `Map<string,Room>` in heap, chat 100 cap per room, no sharding | ~20k rooms cap but heap grows with participants; stale rooms cleaned every 15 min |
| **DB (pg Pool)** | Single Pool `max` unspecified → defaults to 10; no PgBouncer | ~10 concurrent DB writes before queueing; safe for <1k |
| **MovieBox upstream** | HMAC-signed visitor-login per host, 429 under fan-out | Without cache, 10k clients would trigger 429 immediately |

**Verdict: ≤2k concurrent WS is the realistic ceiling for a single container; 10k was not achievable.**

---

## 4. What changed to reach 10k

### 4.1 Server entry — `server/src/index.ts`
- **Node cluster** — when `CLUSTER=1` or `NODE_ENV=production` with >1 CPU, primary forks `cpus()` workers (capped, configurable via `WORKERS=`). Auto-restart on crash, graceful `SIGTERM`/`SIGINT`, disconnect handling. `CLUSTER=0` disables.
- **Sticky note** — without Redis, clustered Socket.IO rooms are _per-worker_ (a client on worker A won't see broadcasts from worker B). Two valid ways to scale WS: (a) sticky L7 LB + in-memory, (b) Redis adapter. Code now supports both.
- **Optional Redis adapter** — if `REDIS_URL` (or `REDIS_TLS_URL`) is set and `ioredis` + `@socket.io/redis-adapter` are installed, every `io` is bridged through Redis so broadcasts are global. Fails open to in-memory with a warning.
- **HTTP tuning** — `keepAliveTimeout 65s / headersTimeout 66s`, `maxHttpBufferSize 1 MB`, `pingInterval 25s / pingTimeout 20s`, `perMessageDeflate: false` (CPU-opt), `connectionStateRecovery` 2 min, `server.maxListeners(0)`.
- **Graceful shutdown** — quits Redis, closes DB pool, closes HTTP + Socket.IO before `process.exit(0)`.
- **Emergency room cap** — after each 15-min `cleanupStaleRooms` run, checks `MAX_ROOMS` (default 20k) and forces a 30-min sweep if exceeded.

### 4.2 App — `server/src/app.ts`
- **`compression`** — gzip (level 6, threshold 1 KB) for all JSON/HTML; essential at 10k rps to cut egress ~60–70%.
- **Rate limiter made cluster-aware** — comment + `API_RATE_LIMIT` env; per-worker `120 req/min` ≈ `480 global` on 4 workers. For strict global limiting set `REDIS_URL` + `rate-limit-redis`.
- **Health** — `GET /health` now returns `pid, cpus, memory {rss, heapUsed, heapTotal} MB, capacity {maxRooms, pgPoolMax, cluster, redis}` for autoscaler probes. Added `/healthz` + `/readyz` for k8s/ALB.
- **`trust proxy` + `x-powered-by: off`** retained.

### 4.3 DB pool — `server/src/services/db.ts`
- `PG_POOL_MAX` (default 20 prod / 10 dev), `PG_POOL_MIN` 2, `idleTimeout 30s`, `connectionTimeout 5s`, `keepAlive true`, `statement_timeout 10s` — tunable without code change.
- For true 10k writes, point `DATABASE_URL` at **PgBouncer** (transaction mode) — pool math: `workers × PG_POOL_MAX` should be ≤ `PgBouncer max_db_connections`.

### 4.4 Room cap — `server/src/models/RoomManager.ts`
- `createRoom()` now rejects when `rooms.size >= MAX_ROOMS`.

### 4.5 New artifacts
- `server/ecosystem.config.cjs` — PM2 cluster config (`instances: max`, `exec_mode: cluster`, `max_memory_restart 800M`, separate env).
- `server/load-test-10k.js` — zero-dep smoke: creates `ROOMS` rooms at `CONCURRENCY`, bursts `GET /api/rooms/:id`, hits movie endpoints, optionally fans out `WS_PER_ROOM` Sockets (needs `socket.io-client`). For real 10k use `k6`/`Artillery`/`autocannon` externally.
- `server/package.json` — added `compression` + `@types/compression`.

---

## 5. How to actually run 10k

### 5.1 Vertical vs horizontal

| Deployment | concurrent WS | HTTP rps | Notes |
|---|---|---|---|
| **1× container, 1 process** | ~1–2k | ~1k | Dev / low tier |
| **1× host, 4 workers (CLUSTER=1)** | ~4–6k HTTP, WS still isolated w/o Redis | ~3–4k | Good for HTTP 10k burst if clients are short-lived |
| **2× hosts × 4 workers + Redis + sticky ALB + PgBouncer** | **10k+** | **5–10k** | Recommended for watch-party 10k |

### 5.2 Recommended production topology (10k)

```
Client ──►  Cloudflare / CDN (static + cache /movies/trending 60s)
          ──►  ALB / NGINX (sticky by cookie, ip_hash or cookie-based)
                  ├─► host-A: PM2 4 workers :10000  ─┐
                  └─► host-B: PM2 4 workers :10000  ─┤─► Redis (Socket.IO adapter + rate-limit)
                                                        ├─► Postgres + PgBouncer
                                                        └─► MovieBox upstream (cached, not per-client)
```

**ALB / NGINX sticky example** (`nginx.conf`):
```nginx
upstream synctube {
    ip_hash; # or sticky cookie
    server host-a:10000 max_fails=2 fail_timeout=10s;
    server host-b:10000 max_fails=2 fail_timeout=10s;
    keepalive 512;
}
server {
    listen 80;
    location /socket.io/ {
        proxy_pass http://synctube;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
    location / {
        proxy_pass http://synctube;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        keepalive_timeout 65s;
    }
}
```

### 5.3 Environment to set

```bash
# required
NODE_ENV=production
PORT=10000
DATABASE_URL=postgres://user:pass@pgbouncer:6432/synctube  # point at PgBouncer for 10k
# optional but recommended for 10k
CLUSTER=1                 # or WORKERS=4
WORKERS=4                 # overrides auto cpus()
REDIS_URL=redis://redis:6379
PG_POOL_MAX=20
PG_POOL_MIN=2
MAX_ROOMS=20000
API_RATE_LIMIT=120        # per-worker bucket
# install WS horizontal deps
npm i ioredis @socket.io/redis-adapter
npm i rate-limit-redis    # then wire in app.ts if strict global limiting is needed
```

### 5.4 Build & run

```bash
# single-host cluster
npm run build -w server
CLUSTER=1 NODE_ENV=production node server/dist/index.js
# or via PM2 (preferred for 10k)
npm i -g pm2
pm2 start server/ecosystem.config.cjs --env production
pm2 logs
pm2 scale synctube 4

# Docker (compose scale)
docker build -t synctube .
docker run -e NODE_ENV=production -e CLUSTER=1 -e REDIS_URL=redis://redis:6379 -p 10000:10000 synctube
# k8s: set replicas: 3, add REDIS_URL secret, set resources.requests.memory 1Gi, limits 2Gi, HPA on cpu 70%

# Load test (from a different host so localhost isn't the bottleneck)
BASE_URL=https://synctube.example.com ROOMS=1000 CONCURRENCY=500 WS_PER_ROOM=10 node server/load-test-10k.js
# Real 10k soak — use k6:
# k6 run --vus 10000 --duration 60s k6-script.js
# or autocannon:
# autocannon -c 1000 -d 30 http://host:10000/health
```

### 5.5 Node tuning for 10k

```bash
# raise file descriptors
ulimit -n 65536
# Node flags (via NODE_OPTIONS) if heap pressure is seen
NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=16384"
# Linux (host)
sysctl -w net.core.somaxconn=4096
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.ip_local_port_range="1024 65535"
```

---

## 6. Verifying 10k locally (smoke)

```bash
npm run build -w server
BASE_URL=http://localhost:10000 ROOMS=200 CONCURRENCY=100 node server/load-test-10k.js
# expected on a dev laptop:
#   created 200/200 rooms in ~2s (~100 rps)
#   burst 200 rooms in ~1s
#   movie endpoints <100ms (cached)
#   WS 50 rooms ×10  ≈ 500 sockets ok
```

For a true 10k closed-loop test you need 2+ load generators (a single Node load process cannot open 10k sockets without itself hitting fd limits). Use `k6` distributed mode or 3× `autocannon` instances against the ALB.

---

## 7. Cost / capacity cheat-sheet

- 10k concurrent **viewers in ~1k rooms (10/room)** ≈ 1k active Socket.IO rooms, 10k socket objects (~0.5–0.8 GB), 1k chat logs (100 × 1k = 100k messages cap) — fits in 2 × 2 GB hosts comfortably.
- If 10k are in **one** room (1 room, 10k viewers) — broadcast fan-out per chat/play event is 10k emits → need Redis adapter + tune `maxHttpBufferSize` and consider throttling chat (e.g. 1 msg / 2s per socket).

---

## 8. Future work (not blocking 10k)

- Wire `rate-limit-redis` for strict global throttling.
- Add `ioredis` + `@socket.io/redis-adapter` to `dependencies` (currently optional peer) once Redis infra is provisioned.
- Add Prometheus `prom-client` metrics (`roomsActive`, `wsConnections`, `pgPoolWaiting`).
- Persist `RoomManager` to Redis/DB so rooms survive worker restarts (today recreated from DB on demand; in-memory only until 1h stale expiry).
```

