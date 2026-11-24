#!/usr/bin/env node
// npm run test:bridge - bundles and runs scripts/portal-bridge.test.ts in Node.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(os.tmpdir(), 'gtis-bridge-test-'));
const outfile = path.join(dir, 'portal-bridge.test.cjs');
await build({
  entryPoints: [path.join(repoRoot, 'scripts/portal-bridge.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile,
  external: ['electron'],
  logLevel: 'warning'
});
// Run once with Node fetch, then inside Electron with net.fetch (production).
const require = createRequire(import.meta.url);
const runs = [['Node fetch', process.execPath]];
// BRIDGE_NODE_ONLY=1 skips the Electron run (for Linux CI without a display).
if (process.env.BRIDGE_NODE_ONLY !== '1') {
  runs.push(['Electron net.fetch', require('electron')]);
}
let status = 0;
for (const [label, binary] of runs) {
  console.log(`--- ${label}`);
  const result = spawnSync(binary, [outfile], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 60000 });
  process.stdout.write(result.stdout || '');
  if (result.status !== 0) {
    status = 1;
    process.stdout.write((result.stderr || '').split('\n').filter((line) => !/^\[\d+:/.test(line)).join('\n'));
  }
}
rmSync(dir, { recursive: true, force: true });
process.exit(status);
