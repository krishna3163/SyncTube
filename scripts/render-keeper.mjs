#!/usr/bin/env node

/**
 * Render Multi-Account Keeper & Self-Healing Automation
 * ====================================================
 * 1. Pings the Render backend /health endpoint every 5 minutes to prevent sleep.
 * 2. Connects to all 3 Render accounts (via RENDER_API_KEY_1..3 / RENDER_API_KEYS)
 *    and keeps ALL discovered services warm, awake, and monitored simultaneously.
 * 3. If any service is dead, suspended, or failing:
 *    - Automatically triggers a service restart via Render API.
 *    - Rotates primary backend URL across accounts if the active service goes down.
 *    - Updates project files with the new URL and commits back to GitHub.
 * 4. Writes a health & uptime report directly to GitHub Actions Step Summary.
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_URL = 'https://github.com/krishna3163/SyncTube';
const DEFAULT_URL = 'https://synctube-vslw.onrender.com';
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function setGithubOutput(key, value) {
  if (GITHUB_OUTPUT && fs.existsSync(GITHUB_OUTPUT)) {
    try {
      fs.appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`);
    } catch (e) {
      log(`Failed to write GITHUB_OUTPUT: ${e.message}`);
    }
  }
}

function appendStepSummary(markdown) {
  if (GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(GITHUB_STEP_SUMMARY, markdown + '\n');
    } catch (e) {
      log(`Failed to write GITHUB_STEP_SUMMARY: ${e.message}`);
    }
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

// Read extra URLs if configured
function getExtraServiceUrls() {
  const urls = [];
  if (process.env.RENDER_SERVICE_URLS) {
    urls.push(
      ...process.env.RENDER_SERVICE_URLS.split(',')
        .map((u) => u.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    );
  }
  return urls;
}

// Read current active backend URL from vercel.json if available
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

// Check health of an endpoint with Render cold start tolerance and latency measurement
async function checkHealth(baseUrl, timeoutMs = 60000) {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  const endpoints = ['/health', '/'];
  const startTime = Date.now();

  for (const ep of endpoints) {
    const healthUrl = `${cleanUrl}${ep}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, data, latencyMs, endpoint: ep };
      }

      // If /health returns 404, fallback to /
      if (ep === '/health' && res.status === 404) {
        continue;
      }

      return { ok: false, status: res.status, error: `HTTP ${res.status}`, latencyMs, endpoint: ep };
    } catch (err) {
      if (ep === '/health') {
        continue;
      }
      return { ok: false, status: 0, error: err.message, latencyMs: Date.now() - startTime, endpoint: ep };
    }
  }

  return { ok: false, status: 0, error: 'Connection failed', latencyMs: Date.now() - startTime };
}

// Render API Helper
async function renderApi(apiKey, endpoint, options = {}) {
  const url = `https://api.render.com/v1${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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

// Discover all Render web services across all provided API keys
async function discoverAllRenderServices(apiKeys) {
  const servicesList = [];

  for (let idx = 0; idx < apiKeys.length; idx++) {
    const apiKey = apiKeys[idx];
    const maskedKey = apiKey.slice(0, 6) + '...' + apiKey.slice(-4);
    log(`[Account ${idx + 1}/${apiKeys.length}] Querying Render services (Key: ${maskedKey})...`);

    const res = await renderApi(apiKey, '/services?limit=50');
    if (res.ok && Array.isArray(res.data)) {
      for (const item of res.data) {
        const s = item.service || item;
        const url = (s.serviceDetails?.url || s.url || '').replace(/\/+$/, '');
        if (url) {
          servicesList.push({
            accountIndex: idx + 1,
            apiKey,
            maskedKey,
            serviceId: s.id,
            name: s.name || `synctube-acc${idx + 1}`,
            url,
            status: s.status,
            suspended: s.suspended,
            type: s.type,
          });
        }
      }
      const count = servicesList.filter((s) => s.accountIndex === idx + 1).length;
      log(`[Account ${idx + 1}] Found ${count} service(s).`);
    } else {
      log(`[Account ${idx + 1}] Could not fetch services (${res.status || res.error}).`);
    }
  }

  return servicesList;
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
    text.replace(
      /const DEFAULT_URL = 'https:\/\/synctube-[a-z0-9-]+\.onrender\.com';/,
      `const DEFAULT_URL = '${newUrl}';`
    )
  );
}

// Main Keeper Execution
async function main() {
  const currentUrl = getCurrentBackendUrl();
  const forceRecovery = process.env.FORCE_RECOVERY === 'true' || process.env.FORCE_RECOVERY === '1';
  const apiKeys = getRenderApiKeys();
  const extraUrls = getExtraServiceUrls();

  log(`🚀 Starting Render Multi-Account Keep-Alive & Health Monitoring`);
  log(`Primary Backend Target: ${currentUrl}`);
  log(`Configured Render API Keys: ${apiKeys.length}`);

  if (forceRecovery) {
    log('⚡ Force recovery requested via workflow input.');
  }

  // Step 1: Discover all services across all 3 Render accounts
  const discoveredServices = await discoverAllRenderServices(apiKeys);

  // Compile list of all distinct targets to ping and monitor
  const targetsMap = new Map();

  // Add primary active backend
  targetsMap.set(currentUrl, {
    accountIndex: 0,
    name: 'Primary Active Backend',
    url: currentUrl,
    isPrimary: true,
  });

  // Add all discovered Render services
  for (const s of discoveredServices) {
    const existing = targetsMap.get(s.url);
    if (existing) {
      targetsMap.set(s.url, { ...existing, ...s });
    } else {
      targetsMap.set(s.url, { ...s, isPrimary: s.url === currentUrl });
    }
  }

  // Add any extra explicitly provided URLs
  for (const url of extraUrls) {
    if (!targetsMap.has(url)) {
      targetsMap.set(url, {
        accountIndex: 0,
        name: 'Extra Configured Backend',
        url,
        isPrimary: url === currentUrl,
      });
    }
  }

  const targets = Array.from(targetsMap.values());
  log(`Monitoring and keeping alive ${targets.length} service endpoint(s)...`);

  const monitoringResults = [];

  // Step 2: Health check & keep-alive ping on EVERY service
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    log(`--------------------------------------------------`);
    log(`Checking target [${i + 1}/${targets.length}]: ${target.name} (${target.url})`);

    let checkResult = null;
    let healthy = false;

    // Retry ping up to 2 times for cold starts
    for (let attempt = 1; attempt <= 2; attempt++) {
      log(`  Ping attempt ${attempt}/2...`);
      checkResult = await checkHealth(target.url);

      if (checkResult.ok) {
        log(`  ✅ Healthy! Status: ${checkResult.status} OK | Latency: ${checkResult.latencyMs}ms | Uptime: ${checkResult.data?.uptime || 'N/A'}s`);
        healthy = true;
        break;
      }

      log(`  Attempt ${attempt} returned: ${checkResult.error || 'Failed'}`);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 4000));
      }
    }

    let actionTaken = 'Pinged (Kept Awake)';

    // If service is unhealthy and we have its API credentials, trigger an automatic restart
    if (!healthy && target.serviceId && target.apiKey) {
      log(`  🚨 Service is unresponsive. Triggering auto-restart via Render API for ${target.serviceId}...`);
      const restartRes = await renderApi(target.apiKey, `/services/${target.serviceId}/restart`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (restartRes.ok) {
        actionTaken = 'Restarted via Render API';
        log(`  🔄 Restart accepted. Waiting 25s for container initialization...`);
        await new Promise((r) => setTimeout(r, 25000));
        const recheck = await checkHealth(target.url);
        if (recheck.ok) {
          healthy = true;
          checkResult = recheck;
          log(`  🎉 Service recovered successfully after restart!`);
          actionTaken = 'Recovered via Restart';
        } else {
          log(`  ⚠️ Still unresponsive after restart: ${recheck.error}`);
        }
      } else {
        log(`  ❌ Restart request failed (${restartRes.status}): ${JSON.stringify(restartRes.data)}`);
      }
    }

    monitoringResults.push({
      account: target.accountIndex > 0 ? `Account ${target.accountIndex}` : 'Configured',
      name: target.name,
      url: target.url,
      isPrimary: target.isPrimary,
      healthy,
      status: checkResult?.status || 0,
      latencyMs: checkResult?.latencyMs || 0,
      uptime: checkResult?.data?.uptime ? `${Math.round(checkResult.data.uptime)}s` : 'N/A',
      actionTaken,
      error: healthy ? null : checkResult?.error,
    });
  }

  // Step 3: Check Primary Active Backend & Auto-Failover if necessary
  const primaryResult = monitoringResults.find((r) => r.isPrimary) || monitoringResults[0];
  let newServiceUrl = null;

  if (!primaryResult?.healthy || forceRecovery) {
    log(`⚠️ Primary backend (${currentUrl}) is not healthy. Finding healthiest fallback service...`);

    // Look for another healthy service across the 3 accounts
    const healthyFallback = monitoringResults.find((r) => r.healthy && r.url !== currentUrl);

    if (healthyFallback) {
      log(`🎉 Found healthy fallback service: ${healthyFallback.name} (${healthyFallback.url})`);
      newServiceUrl = healthyFallback.url;
    } else if (apiKeys.length > 0) {
      // If no existing service is healthy, attempt fresh creation using available API keys
      log(`Creating fresh Web Service on Render across accounts...`);
      for (let idx = 0; idx < apiKeys.length; idx++) {
        const apiKey = apiKeys[idx];
        const ownerId = await getOwnerId(apiKey);
        if (!ownerId) continue;

        const serviceSlug = `synctube-${Date.now().toString(36).toLowerCase().slice(-4)}`;
        log(`[Account ${idx + 1}] Creating service: ${serviceSlug}...`);

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

        const serviceData = createRes.data?.service || createRes.data;
        const createdUrl = serviceData?.serviceDetails?.url || serviceData?.url;

        if (createRes.ok && createdUrl) {
          newServiceUrl = createdUrl.replace(/\/+$/, '');
          log(`🎉 Created fresh Web Service: ${newServiceUrl}`);
          break;
        }
      }
    }
  }

  // Update repository URLs if rotated
  if (newServiceUrl && newServiceUrl !== currentUrl) {
    updateRepositoryUrls(newServiceUrl);
    setGithubOutput('url_changed', 'true');
    setGithubOutput('new_url', newServiceUrl);
    log(`Auto-recovery rotated primary backend to: ${newServiceUrl}`);
  } else {
    setGithubOutput('url_changed', 'false');
  }

  // Step 4: Secondary Keep-Alive Pulse (Double-Pulse for Zero Sleep)
  const healthyUrls = monitoringResults.filter((r) => r.healthy).map((r) => r.url);
  if (healthyUrls.length > 0) {
    log(`--------------------------------------------------`);
    log(`Sending secondary keepalive pulse to reset sleep timers...`);
    await new Promise((r) => setTimeout(r, 6000));
    await Promise.all(
      healthyUrls.map((url) =>
        fetch(`${url}/health`, { signal: AbortSignal.timeout(10000) }).catch(() => {})
      )
    );
    log(`Double-pulse keepalive sent to ${healthyUrls.length} endpoint(s).`);
  }

  // Step 5: Render Markdown Summary for GitHub Actions
  const summaryMarkdown = [
    `## 🌐 Render Multi-Account Keep-Alive & Health Monitoring`,
    `**Time:** \`${new Date().toISOString()}\` | **Interval:** Every 5 Minutes`,
    '',
    `| Account | Service | URL | Status | Latency | Uptime | Action |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`,
    ...monitoringResults.map((r) => {
      const statusBadge = r.healthy ? `🟢 \`${r.status} OK\`` : `🔴 \`${r.status || 'DOWN'}\``;
      const primaryBadge = r.isPrimary ? ' ⭐ *(Active)*' : '';
      return `| ${r.account} | ${r.name}${primaryBadge} | [${r.url.replace('https://', '')}](${r.url}) | ${statusBadge} | ${r.latencyMs}ms | ${r.uptime} | ${r.actionTaken} |`;
    }),
    '',
    `> **Self-Healing Status:** All free-tier Render instances received keep-alive heartbeats to prevent 15-minute inactivity spin-down.`,
  ].join('\n');

  appendStepSummary(summaryMarkdown);

  log(`--------------------------------------------------`);
  log(`All ${targets.length} service(s) processed. Run complete.`);
}

main().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
