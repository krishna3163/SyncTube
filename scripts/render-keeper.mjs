#!/usr/bin/env node

/**
 * Render Keeper & Multi-Account Self-Healing Automation
 * ====================================================
 * 1. Pings the Render backend /health endpoint every 10 minutes to prevent sleep.
 * 2. If the service is dead, suspended, or requesting an upgrade:
 *    - Tries available Render API keys (auto-rotation across accounts).
 *    - Restarts the existing service or creates a fresh Web Service via Render API.
 *    - Cleans up old broken services to respect free-tier quotas.
 *    - Updates project files with the new URL and triggers a commit.
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_URL = 'https://github.com/krishna3163/SyncTube';
const DEFAULT_URL = 'https://synctube-vslw.onrender.com';
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function setGithubOutput(key, value) {
  if (GITHUB_OUTPUT && fs.existsSync(GITHUB_OUTPUT)) {
    fs.appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

// Extract all available Render API keys from environment
function getRenderApiKeys() {
  const keys = [];
  if (process.env.RENDER_API_KEYS) {
    keys.push(...process.env.RENDER_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean));
  }
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`RENDER_API_KEY_${i}`];
    if (k && !keys.includes(k.trim())) keys.push(k.trim());
  }
  if (process.env.RENDER_API_KEY && !keys.includes(process.env.RENDER_API_KEY.trim())) {
    keys.push(process.env.RENDER_API_KEY.trim());
  }
  return keys;
}

// Read current backend URL from vercel.json if available
function getCurrentBackendUrl() {
  if (process.env.BACKEND_URL && process.env.BACKEND_URL.trim().length > 0) {
    return process.env.BACKEND_URL.trim().replace(/\/+$/, '');
  }
  try {
    const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const url = vercelConfig?.env?.VITE_API_URL || vercelConfig?.build?.env?.VITE_API_URL;
    if (url) return url.replace(/\/+$/, '');
  } catch {}
  return DEFAULT_URL;
}

// Check health of an endpoint with Render cold start tolerance
async function checkHealth(baseUrl) {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const endpoints = ['/health', '/'];

  for (const ep of endpoints) {
    const healthUrl = `${cleanUrl}${ep}`;
    try {
      const controller = new AbortController();
      // Render free-tier cold starts take 50-80s; allow 60s per attempt
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, data };
      }

      // If /health returns 404, fallback to /
      if (ep === '/health' && res.status === 404) {
        continue;
      }

      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    } catch (err) {
      if (ep === '/health') {
        continue;
      }
      return { ok: false, status: 0, error: err.message };
    }
  }

  return { ok: false, status: 0, error: 'Connection failed' };
}

// Render API Helper
async function renderApi(apiKey, endpoint, options = {}) {
  const url = `https://api.render.com/v1${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(options.headers || {}),
      },
    });

    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data: body };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

// Get Workspace Owner ID for an API key
async function getOwnerId(apiKey) {
  const { ok, data } = await renderApi(apiKey, '/owners');
  if (ok && Array.isArray(data) && data.length > 0) {
    return data[0].owner.id;
  }
  return null;
}

// Update files across the repository with new backend URL
function updateRepositoryUrls(newUrl) {
  log(`Updating project files with new Backend URL: ${newUrl}`);

  const updateFile = (filePath, replacer) => {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const updated = replacer(content);
    if (content !== updated) {
      fs.writeFileSync(filePath, updated, 'utf8');
      log(` Updated ${filePath}`);
    }
  };

  const urlRegex = /https:\/\/synctube-[a-z0-9-]+\.onrender\.com/g;

  // 1. root vercel.json
  updateFile('vercel.json', (text) => text.replace(urlRegex, newUrl));

  // 2. client/vercel.json
  updateFile('client/vercel.json', (text) => text.replace(urlRegex, newUrl));

  // 3. client/src/utils/api.ts
  updateFile('client/src/utils/api.ts', (text) => text.replace(urlRegex, newUrl));

  // 4. client/src/services/socket.ts
  updateFile('client/src/services/socket.ts', (text) => text.replace(urlRegex, newUrl));

  // 5. client/src/components/YouTubeSearchModal.tsx
  updateFile('client/src/components/YouTubeSearchModal.tsx', (text) => text.replace(urlRegex, newUrl));

  // 6. client/src/pages/HomePage.tsx
  updateFile('client/src/pages/HomePage.tsx', (text) => text.replace(urlRegex, newUrl));

  // 7. client/src/pages/RoomPage.tsx
  updateFile('client/src/pages/RoomPage.tsx', (text) => text.replace(urlRegex, newUrl));

  // 8. server/src/utils/cors.ts
  updateFile('server/src/utils/cors.ts', (text) => {
    if (!text.includes(newUrl)) {
      return text.replace(
        /const DEFAULT_TRUSTED_ORIGINS = new Set\(\[\n/,
        `const DEFAULT_TRUSTED_ORIGINS = new Set([\n  '${newUrl}',\n`
      );
    }
    return text;
  });

  // 9. README.md
  updateFile('README.md', (text) => text.replace(urlRegex, newUrl));

  // 10. scripts/render-keeper.mjs
  updateFile('scripts/render-keeper.mjs', (text) =>
    text.replace(/const DEFAULT_URL = 'https:\/\/synctube-[a-z0-9-]+\.onrender\.com';/, `const DEFAULT_URL = '${newUrl}';`)
  );
}

// Main Keeper Execution
async function main() {
  const currentUrl = getCurrentBackendUrl();
  const forceRecovery = process.env.FORCE_RECOVERY === 'true' || process.env.FORCE_RECOVERY === '1';

  log(`Target backend URL: ${currentUrl}`);

  if (forceRecovery) {
    log('⚡ Force recovery requested via workflow input. Skipping health check.');
  }

  // Step 1: Health Check (with retries for cold start)
  let isHealthy = false;
  if (!forceRecovery) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      log(`Ping attempt ${attempt}/3...`);
      const check = await checkHealth(currentUrl);

      if (check.ok) {
        log(`Backend is healthy and awake! Status: 200 OK. Uptime: ${check.data?.uptime || 'N/A'}s`);
        isHealthy = true;
        break;
      }

      log(`Ping attempt ${attempt} returned: ${check.error || 'Timeout'}`);
      if (attempt < 3) {
        log('Waiting 8 seconds before retry...');
        await new Promise((r) => setTimeout(r, 8000));
      }
    }
  }

  if (isHealthy) {
    setGithubOutput('url_changed', 'false');
    process.exit(0);
  }

  // Step 2: Auto-Recovery & Multi-Account Rotation
  log('🚨 Backend failed health check. Initiating Auto-Recovery on Render...');

  const apiKeys = getRenderApiKeys();
  if (apiKeys.length === 0) {
    log('⚠️ No Render API keys configured (RENDER_API_KEYS / RENDER_API_KEY_1..3).');
    log('👉 If this was a cold start, the ping has already sent the wake-up request to Render.');
    log('👉 To enable automatic redeployment/healing, add RENDER_API_KEYS in GitHub Secrets.');
    setGithubOutput('url_changed', 'false');
    // Exit cleanly to avoid false-negative failure notifications on simple cold-wake pings
    process.exit(0);
  }

  log(`Found ${apiKeys.length} Render API key(s) for recovery/rotation.`);

  let newServiceUrl = null;

  for (let idx = 0; idx < apiKeys.length; idx++) {
    const apiKey = apiKeys[idx];
    const maskedKey = apiKey.slice(0, 6) + '...' + apiKey.slice(-4);
    log(`[Account ${idx + 1}/${apiKeys.length}] Trying Render API Key: ${maskedKey}`);

    try {
      const ownerId = await getOwnerId(apiKey);
      if (!ownerId) {
        log(`[Account ${idx + 1}] Could not fetch owner workspace. Trying next key.`);
        continue;
      }

      // Check existing services on this account
      const servicesRes = await renderApi(apiKey, '/services');
      const existingServices = servicesRes.ok && Array.isArray(servicesRes.data) ? servicesRes.data : [];
      const oldService = existingServices.find(
        (s) => s.service?.repo === REPO_URL || s.service?.name?.toLowerCase().includes('synctube')
      );

      // Strategy A: If an existing service is already present on this account, attempt restart first
      if (oldService?.service?.id) {
        const oldId = oldService.service.id;
        const oldUrl = (oldService.service.serviceDetails?.url || '').replace(/\/+$/, '');
        log(`[Account ${idx + 1}] Found existing service ${oldId} (${oldUrl}). Triggering restart...`);

        const restartRes = await renderApi(apiKey, `/services/${oldId}/restart`, {
          method: 'POST',
          body: JSON.stringify({}),
        });

        if (restartRes.ok) {
          log(`[Account ${idx + 1}] Restart accepted. Waiting 30s for container to wake up...`);
          await new Promise((r) => setTimeout(r, 30000));
          const verifyCheck = await checkHealth(oldUrl);
          if (verifyCheck.ok) {
            log(`🎉 [Account ${idx + 1}] Existing service recovered successfully via restart!`);
            newServiceUrl = oldUrl;
            break;
          }
          log(`[Account ${idx + 1}] Existing service still unresponsive after restart.`);
        }

        // Clean up old broken service before creating new one to prevent Free Tier quota rejection
        log(`[Account ${idx + 1}] Cleaning up stale service ${oldId} to free workspace quota...`);
        await renderApi(apiKey, `/services/${oldId}`, { method: 'DELETE' });
        await new Promise((r) => setTimeout(r, 4000));
      }

      // Strategy B: Create a fresh Web Service (lowercase name is strictly required by Render API)
      const serviceSlug = `synctube-${Date.now().toString(36).toLowerCase().slice(-4)}`;
      log(`[Account ${idx + 1}] Creating fresh Web Service on Render: ${serviceSlug}...`);

      const createRes = await renderApi(apiKey, '/services', {
        method: 'POST',
        body: JSON.stringify({
          type: 'web_service',
          name: serviceSlug,
          ownerId,
          repo: REPO_URL,
          branch: 'main',
          autoDeploy: 'yes',
          serviceDetails: {
            env: 'node',
            plan: 'free',
            region: 'oregon',
            buildCommand: 'npm install --include=dev && npm run build:server',
            startCommand: 'npm start -w server',
            healthCheckPath: '/health',
            envVars: [
              { key: 'NODE_VERSION', value: '22' },
              { key: 'NODE_ENV', value: 'production' },
              { key: 'PORT', value: '10000' },
              { key: 'CLUSTER', value: '0' },
              { key: 'MEDIASOUP_WORKER_BIN', value: 'false' },
            ],
          },
        }),
      });

      // Handle both { service: { serviceDetails: { url } } } and { serviceDetails: { url } }
      const serviceData = createRes.data?.service || createRes.data;
      const createdUrl = serviceData?.serviceDetails?.url || serviceData?.url;

      if (!createRes.ok || !createdUrl) {
        log(`[Account ${idx + 1}] Creation failed (${createRes.status}): ${JSON.stringify(createRes.data)}`);
        continue;
      }

      newServiceUrl = createdUrl.replace(/\/+$/, '');
      log(`🎉 [Account ${idx + 1}] New Web Service created successfully: ${newServiceUrl}`);
      break;
    } catch (err) {
      log(`[Account ${idx + 1}] Error: ${err.message}`);
    }
  }

  if (!newServiceUrl) {
    log('❌ Failed to recover or deploy a new service across all provided Render accounts.');
    process.exit(1);
  }

  // Step 3: Update local files with new URL if changed
  if (newServiceUrl !== currentUrl) {
    updateRepositoryUrls(newServiceUrl);
    setGithubOutput('url_changed', 'true');
    setGithubOutput('new_url', newServiceUrl);
    log(`Auto-recovery complete! New live URL: ${newServiceUrl}`);
  } else {
    setGithubOutput('url_changed', 'false');
    log('Service recovered at current URL without rotation.');
  }
}

main().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
