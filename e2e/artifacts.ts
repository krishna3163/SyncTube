import fs from 'node:fs';
import path from 'node:path';

export const artifactsDir = path.resolve(
  process.env.PLAYWRIGHT_ARTIFACTS_DIR || 'test-results/artifacts'
);

fs.mkdirSync(artifactsDir, { recursive: true });
