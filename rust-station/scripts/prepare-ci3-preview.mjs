import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../../dist/', import.meta.url);
const preview = new URL('../ci3-preview/', import.meta.url);
const output = new URL('dist/', preview);
const html = readFileSync(new URL('index.html', source), 'utf8');
const config = JSON.parse(readFileSync(new URL('tauri.conf.json', preview), 'utf8'));
const policy = config.app.security.csp;
const policyTag = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
const entryTag = /<script type="module"[^>]*>/;

if (!policyTag.test(html) || !entryTag.test(html)) {
  throw new Error('Run the root npm build before preparing the Rust sample.');
}

rmSync(output, { force: true, recursive: true });
cpSync(source, output, { recursive: true });
cpSync(new URL('sample-bridge.js', preview), new URL('sample-bridge.js', output));
writeFileSync(
  new URL('index.html', output),
  html
    .replace(policyTag, `<meta http-equiv="Content-Security-Policy" content="${policy}">`)
    .replace(entryTag, (tag) => `<script src="./sample-bridge.js"></script>\n    ${tag}`),
);
console.log(`Prepared offline Rust sample frontend at ${fileURLToPath(output)}`);
