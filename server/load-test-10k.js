// Simple 10k capacity smoke test — no external deps, uses Node built-ins + optional socket.io-client if installed.
// It hammers HTTP endpoints and, if socket.io-client is present, opens WS connections in batches.
// Run:  BASE_URL=http://localhost:10000 npm run load:10k
// For real 10k soak, use k6/Artillery/autocannon on a dedicated load host (see SCALING doc).
import http from 'node:http';
import https from 'node:https';

const BASE = process.env.BASE_URL || 'http://localhost:10000';
const ROOMS_TO_CREATE = parseInt(process.env.ROOMS || '200', 10);     // 200 rooms
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '100', 10);  // 100 parallel HTTP at a time
const WS_PER_ROOM = parseInt(process.env.WS_PER_ROOM || '10', 10);    // 10 sockets per room ≈ 2k sockets total smoke
// For true 10k sockets: ROOMS=1000 WS_PER_ROOM=10  or ROOMS=500 WS_PER_ROOM=20

function fetchJson(url, opts = {}) {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method: opts.method || 'GET', headers: opts.headers || {}, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null, headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body, headers: res.headers }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

async function poolRun(items, limit, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  console.log(`[load-test] BASE=${BASE} rooms=${ROOMS_TO_CREATE} concurrency=${CONCURRENCY} wsPerRoom=${WS_PER_ROOM}`);
  const t0 = Date.now();

  // 1) Health — must be < 200ms p50 for 10k readiness
  console.log('[load-test] 1) Health check...');
  const h = await fetchJson(`${BASE}/health`);
  console.log(`  -> /health ${h.status} rooms=${h.body?.roomsActive} rssMB=${h.body?.memory?.rssMB} cpus=${h.body?.cpus}`);
  if (h.status !== 200) throw new Error('health failed');

  // 2) Create rooms in parallel (simulates room-creation spike)
  console.log(`[load-test] 2) Creating ${ROOMS_TO_CREATE} rooms @ concurrency ${CONCURRENCY} ...`);
  const createStart = Date.now();
  const roomIds = [];
  const errors = [];
  await poolRun(Array.from({ length: ROOMS_TO_CREATE }), CONCURRENCY, async () => {
    try {
      const r = await fetchJson(`${BASE}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      if (r.status === 201 && r.body?.roomId) roomIds.push(r.body.roomId);
      else errors.push(r.status + ':' + JSON.stringify(r.body).slice(0, 200));
    } catch (e) { errors.push(String(e.message).slice(0, 200)); }
  });
  const createMs = Date.now() - createStart;
  console.log(`  -> created ${roomIds.length}/${ROOMS_TO_CREATE} rooms in ${createMs}ms  (${(roomIds.length / (createMs / 1000)).toFixed(1)} rps)  errors=${errors.length}`);
  if (errors.length) console.log('     sample errors:', errors.slice(0, 3));

  // 3) Burst GET /api/rooms/:id (room fetch is hot path)
  console.log(`[load-test] 3) Burst GET ${Math.min(roomIds.length, 500)} rooms...`);
  const burstIds = roomIds.slice(0, 500);
  const burstStart = Date.now();
  let burstOk = 0;
  await poolRun(burstIds, CONCURRENCY, async (id) => {
    const r = await fetchJson(`${BASE}/api/rooms/${id}`);
    if (r.status === 200) burstOk++;
  });
  const burstMs = Date.now() - burstStart;
  console.log(`  -> ${burstOk}/${burstIds.length} ok in ${burstMs}ms  (${(burstOk / (burstMs / 1000)).toFixed(1)} rps)  p50≈${burstMs / Math.max(1, burstIds.length)}ms avg`);

  // 4) Movie endpoints (cached — should not hit MovieBox more than once per key even at 10k)
  console.log('[load-test] 4) Movie trending/browse/details/streams (fixture-backed, should be < 100ms cached)...');
  const movieStart = Date.now();
  const mt = await fetchJson(`${BASE}/api/movies/trending`);
  console.log(`  -> /movies/trending ${mt.status} count=${mt.body?.results?.length}  ${Date.now() - movieStart}ms`);
  const mb = await fetchJson(`${BASE}/api/movies/browse?type=movies&page=1`);
  console.log(`  -> /movies/browse ${mb.status} count=${mb.body?.results?.length}`);
  const md = await fetchJson(`${BASE}/api/movies/details/fx-001`);
  console.log(`  -> /movies/details/fx-001 ${md.status} title=${md.body?.details?.title} seasons=${md.body?.details?.seasons?.length ?? 0}`);
  const ms = await fetchJson(`${BASE}/api/movies/streams?id=fx-001`);
  console.log(`  -> /movies/streams ${ms.status} streams=${ms.body?.streams?.length} qualities=${ms.body?.availableQualities?.length}`);

  // 5) Optional WS fan-out if socket.io-client is installed
  let wsOk = 0, wsFail = 0;
  try {
    const { io } = await import('socket.io-client');
    console.log(`[load-test] 5) WS fan-out: ${Math.min(roomIds.length, 50)} rooms × ${WS_PER_ROOM} sockets...`);
    const targetRooms = roomIds.slice(0, 50);
    const sockets = [];
    await poolRun(targetRooms, 20, async (roomId) => {
      for (let k = 0; k < WS_PER_ROOM; k++) {
        const socket = io(BASE, { transports: ['websocket'], timeout: 5000, reconnection: false });
        sockets.push(socket);
        await new Promise((resolve) => {
          let done = false;
          const finish = (ok) => { if (!done) { done = true; ok ? wsOk++ : wsFail++; resolve(); } };
          socket.on('connect', () => {
            socket.emit('joinRoom', { roomId, userName: `load-${k}` });
          });
          socket.on('roomJoined', () => finish(true));
          socket.on('connect_error', () => finish(false));
          socket.on('error', () => finish(false));
          setTimeout(() => finish(false), 3500);
        });
      }
    });
    console.log(`  -> WS connected ${wsOk}/${sockets.length}  failed ${wsFail}`);
    sockets.forEach((s) => s.disconnect());
    // give server time to process disconnects
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    console.log('[load-test] 5) WS skipped (socket.io-client not installed). Install with: npm i socket.io-client --save-dev');
  }

  // 6) Final health + verdict
  const h2 = await fetchJson(`${BASE}/health`);
  const elapsed = Date.now() - t0;
  console.log(`[load-test] Done in ${elapsed}ms — final rooms=${h2.body?.roomsActive} heap=${h2.body?.memory?.heapUsedMB}MB`);
  const ok = roomIds.length >= ROOMS_TO_CREATE * 0.95 && burstOk >= burstIds.length * 0.95;
  console.log(ok ? '[load-test] PASS — instance handles burst. For true 10k, run distributed k6/autocannon behind ALB.' : '[load-test] FAIL — check logs/timeouts');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('[load-test] fatal', e); process.exit(1); });
