#!/usr/bin/env node
// npm run test:archive
// Bundles scripts/archive-harness.ts, then runs it in Electron at several
// forced display scales (Windows NUCs commonly run at 125% or 150%). Each run
// writes front/back PNGs to archive-test-output/ and asserts size, upright
// back, no margins and file size. Set ARCHIVE_SCALES=1,1.5 to choose scales.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'archive-test-output');
const bundleDir = path.join(os.tmpdir(), `gtis-archive-harness-${process.pid}`);
const scales = (process.env.ARCHIVE_SCALES || '1,1.25,1.5,2').split(',').map((value) => value.trim()).filter(Boolean);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(bundleDir, { recursive: true });
const bundle = path.join(bundleDir, 'archive-harness.cjs');

await build({
  entryPoints: [path.join(repoRoot, 'scripts/archive-harness.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  outfile: bundle,
  logLevel: 'warning'
});

const electronBinary = require('electron');
let failed = false;
const sizesByScale = [];

for (const scale of scales) {
  const label = `scale-${scale}`;
  const result = spawnSync(electronBinary, [`--force-device-scale-factor=${scale}`, bundle], {
    cwd: repoRoot,
    env: { ...process.env, ARCHIVE_REPO_ROOT: repoRoot, ARCHIVE_OUT_DIR: outDir, ARCHIVE_LABEL: label, ELECTRON_ENABLE_LOGGING: '' },
    encoding: 'utf8',
    timeout: 120000
  });
  const line = (result.stdout || '').split('\n').find((text) => text.startsWith('ARCHIVE_REPORT '));
  if (!line) {
    failed = true;
    console.log(`${label}: FAILED (no report, exit ${result.status})`);
    console.log((result.stderr || '').split('\n').filter((text) => text.includes('harness') || text.includes('Error')).slice(-10).join('\n'));
    continue;
  }
  const report = JSON.parse(line.slice('ARCHIVE_REPORT '.length));
  const sides = ['front', 'back']
    .filter((side) => report[side])
    .map((side) => `${side} ${report[side].width}x${report[side].height} ${report[side].kb} KB`)
    .join(', ');
  if (report.front && report.back) {
    sizesByScale.push({ label, front: report.front.kb, back: report.back.kb });
  }
  const ok = result.status === 0 && report.failures.length === 0;
  failed ||= !ok;
  console.log(`${label}: ${ok ? 'ok' : 'FAILED'} - screen ${report.screen}${report.taller ? ' (card taller than screen)' : ''} - ${sides}${report.backTopLuminance !== undefined ? ` (back top/bottom luminance ${report.backTopLuminance}/${report.backBottomLuminance})` : ''}${report.brokenFont ? `, broken font ${report.brokenFont}` : ''}`);
  for (const failure of report.failures) {
    console.log(`  - ${failure}`);
  }
}

// The archive must not depend on the station's display scale.
if (sizesByScale.length > 1) {
  const spread = (key) => {
    const values = sizesByScale.map((entry) => entry[key]);
    return (Math.max(...values) - Math.min(...values)) / Math.max(...values);
  };
  const consistent = spread('front') <= 0.03 && spread('back') <= 0.03;
  failed ||= !consistent;
  console.log(`across scales: ${consistent ? 'ok' : 'FAILED'} - file sizes vary by ${(spread('front') * 100).toFixed(1)}% (front) and ${(spread('back') * 100).toFixed(1)}% (back)`);
}

rmSync(bundleDir, { recursive: true, force: true });
console.log(`PNG files: ${path.relative(repoRoot, outDir)}/`);
process.exit(failed ? 1 : 0);
