#!/usr/bin/env node
// npm run check:public
// Guards a PUBLIC repository and its public release builds against leaking
// the device token or any other secret. It never prints a secret value:
// findings show only file, commit and line.
//
//  (a) no tracked .env* file except .env.example
//  (b) no tracked env-style assignment of a non-empty value to a name
//      containing TOKEN, SECRET, PASSWORD or KEY
//  (c) build output (dist/, dist-electron/, release/ app bundles) contains
//      neither VITE_GTIS_IDPRINT_API_TOKEN nor the value of any secret-like
//      variable in local .env, .env.local, .env.production or .env.*.local
//      files (compared in memory only)
//  (d) git history (all refs, merges included) has no high-entropy 32+
//      character value assigned to a token-like name
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|KEY)/i;
const failures = [];
let checks = 0;

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 });
}

function result(label, problems) {
  checks += 1;
  if (problems.length === 0) {
    console.log(`ok    ${label}`);
    return;
  }
  console.log(`FAIL  ${label}`);
  for (const problem of problems) {
    console.log(`        ${problem}`);
  }
  failures.push(label);
}

const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);

// (a) tracked .env files
result(
  '(a) no tracked .env files other than .env.example',
  tracked
    .filter((file) => /(^|\/)\.env(\.|$)/.test(file) && path.basename(file) !== '.env.example')
    .map((file) => `${file} is tracked`)
);

// (b) env-style secret assignments in tracked files.
// Matches dotenv/shell lines `NAME=value` / `export NAME=value` and YAML
// `NAME: value` where NAME is UPPER_SNAKE_CASE. Code such as
// `const STORAGE_KEY = '...'` is not env-style and is not matched.
// YAML values that reference GitHub secrets (${{ secrets.X }}) are allowed.
const ENV_LINE = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/;
const YAML_LINE = /^\s*([A-Z][A-Z0-9_]*):\s*(.*)$/;
function stripValue(raw) {
  let value = raw.trim();
  if (!value.startsWith('"') && !value.startsWith("'")) {
    value = value.replace(/\s+#.*$/, '');
  }
  return value.replace(/^(['"])(.*)\1$/, '$2').trim();
}
const bProblems = [];
for (const file of tracked) {
  const full = path.join(repoRoot, file);
  if (!existsSync(full) || statSync(full).size > 2 * 1024 * 1024 || file === 'package-lock.json') {
    continue;
  }
  const buffer = readFileSync(full);
  if (buffer.includes(0)) {
    continue; // binary
  }
  const isYaml = /\.ya?ml$/i.test(file);
  buffer
    .toString('utf8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const match = line.match(ENV_LINE) || (isYaml ? line.match(YAML_LINE) : null);
      if (!match || !SECRET_NAME.test(match[1])) {
        return;
      }
      const value = stripValue(match[2]);
      if (value === '' || /^\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}$/.test(value)) {
        return;
      }
      bProblems.push(`${file}:${index + 1} sets a value for ${match[1]}`);
    });
}
result('(b) no tracked file sets a value for a TOKEN/SECRET/PASSWORD/KEY variable', bProblems);

// (c) build output
function walk(dir, out = []) {
  if (!existsSync(dir)) {
    return out;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}
const outputs = [
  ...walk(path.join(repoRoot, 'dist')),
  ...walk(path.join(repoRoot, 'dist-electron')),
  // Packaged apps: app.asar is an uncompressed archive, so a plain byte
  // search finds baked-in strings. Installers (.exe/.dmg) are compressed and
  // are covered by scanning their app.asar before packaging.
  ...walk(path.join(repoRoot, 'release')).filter((file) => /app\.asar$|[\\/]resources[\\/]app[\\/]/.test(file))
];
const cProblems = [];
if (!existsSync(path.join(repoRoot, 'dist')) || !existsSync(path.join(repoRoot, 'dist-electron'))) {
  cProblems.push('dist/ or dist-electron/ is missing. Run `npm run build` first.');
}
const needles = [{ label: 'the name VITE_GTIS_IDPRINT_API_TOKEN', bytes: Buffer.from('VITE_GTIS_IDPRINT_API_TOKEN') }];
const envFiles = readdirSync(repoRoot).filter(
  (name) => name === '.env' || name === '.env.local' || name === '.env.production' || /^\.env\..+\.local$/.test(name)
);
let envSecretValues = 0;
for (const name of envFiles) {
  for (const line of readFileSync(path.join(repoRoot, name), 'utf8').split(/\r?\n/)) {
    const match = line.match(ENV_LINE);
    if (!match || !SECRET_NAME.test(match[1])) {
      continue;
    }
    const value = stripValue(match[2]);
    if (value.length >= 8) {
      envSecretValues += 1;
      needles.push({ label: `the value of ${match[1]} from ${name}`, bytes: Buffer.from(value) });
    }
  }
}
for (const needle of needles) {
  const hits = outputs.filter((file) => readFileSync(file).includes(needle.bytes));
  console.log(`      build output: ${needle.label}: ${hits.length ? 'found' : 'not found'}`);
  for (const file of hits) {
    cProblems.push(`${path.relative(repoRoot, file)} contains ${needle.label}`);
  }
}
console.log(
  `      scanned ${outputs.length} build files; local env files: ${envFiles.length ? `${envFiles.join(', ')} (${envSecretValues} secret-like value(s) compared, not printed)` : 'none'}`
);
result('(c) build output contains no device token', cProblems);

// (d) git history
const shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true';
const HISTORY_ASSIGN =
  /(token|secret|password|passwd|api[_-]?key|private[_-]?key|auth|bearer)[A-Za-z0-9_\-]*["'\])]{0,3}\s*(?:[:=]|=>)\s*["'`]?(?:Bearer\s+)?([A-Za-z0-9+/=_\-]{32,})/gi;
const BEARER = /Bearer\s+([A-Za-z0-9+/=_\-]{32,})/g;
function entropy(value) {
  const counts = new Map();
  for (const char of value) {
    counts.set(char, (counts.get(char) || 0) + 1);
  }
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}
function looksSecret(value) {
  if (/^[0-9a-f]+$/i.test(value)) {
    return value.length >= 32 && entropy(value) >= 3.0; // random hex
  }
  // mixed alphabet: random base64/base64url tokens sit well above 4 bits/char
  return entropy(value) >= 4.0 && /[0-9]/.test(value) && /[a-z]/i.test(value);
}
const dProblems = [];
// --cc also shows lines a merge introduced (combined diff format).
const log = git(['log', '-p', '--all', '--cc', '--no-color', '--no-ext-diff', '--unified=0', '--format=COMMIT %H']);
let commit = '';
let file = '';
let newLine = 0;
let prefixWidth = 1; // 1 for normal diffs, number of parents for combined diffs
for (const line of log.split('\n')) {
  if (line.startsWith('COMMIT ')) {
    commit = line.slice(7, 19);
    continue;
  }
  if (line.startsWith('+++ ')) {
    file = line.startsWith('+++ b/') ? line.slice(6) : line.slice(4);
    continue;
  }
  const hunk = line.match(/^(@@+) (?:-\d+(?:,\d+)? )+\+(\d+)(?:,\d+)? @@+/);
  if (hunk) {
    prefixWidth = hunk[1].length - 1;
    newLine = Number(hunk[2]);
    continue;
  }
  const prefix = line.slice(0, prefixWidth);
  if (prefix.length === prefixWidth && prefix.includes('+') && !prefix.includes('-') && /^[ +]+$/.test(prefix)) {
    if (file !== 'package-lock.json') {
      const candidates = [...line.matchAll(HISTORY_ASSIGN)].map((m) => m[2]).concat([...line.matchAll(BEARER)].map((m) => m[1]));
      if (candidates.some(looksSecret)) {
        dProblems.push(`${file}:${newLine} in commit ${commit}`);
      }
    }
    newLine += 1;
  } else if (prefix.length === prefixWidth && /^ +$/.test(prefix)) {
    newLine += 1;
  }
}
console.log(`      history: ${git(['rev-list', '--all', '--count']).trim()} commits scanned${shallow ? ' (SHALLOW clone: fetch full history for a complete scan)' : ''}`);
if (shallow && process.env.CI) {
  dProblems.push('Shallow clone in CI: use actions/checkout with fetch-depth: 0.');
}
result('(d) git history has no token-like high-entropy values', dProblems);

console.log(failures.length === 0 ? `Public safety: all ${checks} checks passed.` : `Public safety: ${failures.length} of ${checks} checks failed.`);
process.exit(failures.length === 0 ? 0 : 1);
