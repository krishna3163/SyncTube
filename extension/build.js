import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

async function build() {
  console.log('Building SyncTube Chrome Extension...');

  // 1. Bundle content script as IIFE (MUST be self-contained for Chrome MV3 content scripts)
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/content/contentScript.ts')],
    bundle: true,
    format: 'iife',
    outfile: path.join(distDir, 'contentScript.js'),
    target: ['chrome100'],
    sourcemap: true,
  });

  // 2. Bundle service worker as ESM
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/background/serviceWorker.ts')],
    bundle: true,
    format: 'esm',
    outfile: path.join(distDir, 'serviceWorker.js'),
    target: ['chrome100'],
    sourcemap: true,
  });

  // 3. Bundle popup script as ESM
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/popup/popup.ts')],
    bundle: true,
    format: 'esm',
    outfile: path.join(distDir, 'popup.js'),
    target: ['chrome100'],
    sourcemap: true,
  });

  // 4. Copy static assets to dist/
  fs.copyFileSync(path.join(__dirname, 'src/popup/popup.html'), path.join(distDir, 'popup.html'));
  fs.copyFileSync(path.join(__dirname, 'src/popup/popup.css'), path.join(distDir, 'popup.css'));

  // 5. Read root manifest.json
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));

  // Dist manifest has relative paths directly inside dist/
  const distManifest = {
    ...manifest,
    background: {
      service_worker: 'serviceWorker.js',
      type: 'module',
    },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['contentScript.js'],
        all_frames: true,
        run_at: 'document_idle',
      },
    ],
    action: {
      ...manifest.action,
      default_popup: 'popup.html',
    },
  };
  fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(distManifest, null, 2));

  // Root manifest points to dist/ so loading unpacked extension from either folder works!
  const rootManifest = {
    ...manifest,
    background: {
      service_worker: 'dist/serviceWorker.js',
      type: 'module',
    },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['dist/contentScript.js'],
        all_frames: true,
        run_at: 'document_idle',
      },
    ],
    action: {
      ...manifest.action,
      default_popup: 'dist/popup.html',
    },
  };
  fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(rootManifest, null, 2));

  console.log('Build complete! Extension bundled in extension/ and extension/dist/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
