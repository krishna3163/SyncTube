#!/usr/bin/env node

/**
 * Render Keeper & Multi-Account Self-Healing Automation
 * ====================================================
 * 1. Pings the Render backend /health endpoint every 10 minutes to prevent sleep.
 * 2. If the service is dead, suspended, or requesting an upgrade:
 *    - Tries available Render API keys (auto-rotation across accounts).
 *    - Creates a fresh Web Service automatically via the Render API.
 *    - Cleans up old broken services.
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
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/+$/, '');
  try {
    const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const url = vercelConfig?.env?.VITE_API_URL || vercelConfig?.build?.env?.VITE_API_URL;
    if (url) return url.replace(/\/+$/, '');
  } catch {}
  return DEFAULT_URL;
}

// Check health of an endpoint
async function checkHealth(baseUrl) {
  const healthUrl = `${baseUrl}/health`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const res = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, status: res.status, data };
    }
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

// Render API Helper
async function renderApi(apiKey, endpoint, options = {}) {
  const url = `https://api.render.com/v1${endpoint}`;
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
}

// Get Workspace Owner ID for an API key
async function getOwnerId(apiKey) {
  const { ok, data } = await renderApi(apiKey, '/owners');
  if (ok && Array.isArray(data) && data.length > 0) {
    return data[0].owner.id;
  }
  return null;
}

// Update files in repository with new backend URL
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

  // 1. root vercel.json
  updateFile('vercel.json', (text) =>
    text.replace(/https:\/\/synctube-[a-z0-9]+\.onrender\.com/g, newUrl)
  );

  // 2. client/vercel.json
  updateFile('client/vercel.json', (text) =>
    text.replace(/https:\/\/synctube-[a-z0-9]+\.onrender\.com/g, newUrl)
  );

  // 3. client/src/utils/api.ts
  updateFile('client/src/utils/api.ts', (text) =>
    text.replace(/https:\/\/synctube-[a-z0-9]+\.onrender\.com/g, newUrl)
  );

  // 4. client/src/services/socket.ts
  updateFile('client/src/services/socket.ts', (text) =>
    text.replace(/https:\/\/synctube-[a-z0-9]+\.onrender\.com/g, newUrl)
  );

  // 5. README.md
  updateFile('README.md', (text) =>
    text.replace(/https:\/\/synctube-[a-z0-9]+\.onrender\.com/g, newUrl)
  );
}

// Main Keeper Execution
async function main() {
  const currentUrl = getCurrentBackendUrl();
  log(`Checking health of current backend: ${currentUrl}`);

  // Step 1: Health Check (with retries for cold start)
  let isHealthy = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    log(`Ping attempt ${attempt}/3...`);
    const check = await checkHealth(currentUrl);

    if (check.ok) {
      log(`Backend is healthy and awake! Status: 200 OK. Uptime: ${check.data?.uptime || 'N/A'}s`);
      isHealthy = true;
      break;
    }

    log(`Ping failed: ${check.error}. Waiting 7 seconds before retry...`);
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 7000));
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
    log('❌ ERROR: No Render API keys configured! Set RENDER_API_KEYS in GitHub Secrets.');
    process.exit(1);
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

      // Create a fresh Web Service
      log(`[Account ${idx + 1}] Creating fresh Web Service on Render...`);
      const createRes = await renderApi(apiKey, '/services', {
        method: 'POST',
        body: JSON.stringify({
          type: 'web_service',
          name: `SyncTube-${Date.now().toString(36).slice(-4)}`,
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

      if (!createRes.ok || !createRes.data?.serviceDetails?.url) {
        log(`[Account ${idx + 1}] Creation failed (${createRes.status}): ${JSON.stringify(createRes.data)}`);
        continue;
      }

      newServiceUrl = createRes.data.serviceDetails.url.replace(/\/+$/, '');
      log(`🎉 [Account ${idx + 1}] New Web Service created successfully: ${newServiceUrl}`);

      // Delete old service on this account if present to clean up quota
      if (oldService?.service?.id && oldService.service.id !== createRes.data.id) {
        log(`Cleaning up old service ${oldService.service.id}...`);
        await renderApi(apiKey, `/services/${oldService.service.id}`, { method: 'DELETE' });
      }

      break;
    } catch (err) {
      log(`[Account ${idx + 1}] Error: ${err.message}`);
    }
  }

  if (!newServiceUrl) {
    log('❌ Failed to recover or deploy a new service across all provided Render accounts.');
    process.exit(1);
  }

  // Step 3: Update local files with new URL
  updateRepositoryUrls(newServiceUrl);
  setGithubOutput('url_changed', 'true');
  setGithubOutput('new_url', newServiceUrl);
  log(`Auto-recovery complete! New live URL: ${newServiceUrl}`);
}

main().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
