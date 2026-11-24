// Screenshot harness for the ID Print Station renderer.
//
// Usage (from the repo root):
//   npm exec --yes --package=playwright@1.61.1 -- node src/ui/harness/capture.mjs round-2
//
// Safety:
// - Starts its own Vite dev server on 127.0.0.1:5199 (strict port).
// - Every request that is not to 127.0.0.1:5199 is aborted, and the run fails if any was attempted.
// - window.gtPrint is a fake bridge (bridgeStub.js). Its `portal.request` answers from in-memory
//   synthetic students, so "Live" captures are SIMULATED: no portal is ever contacted.
// - Sample-mode flows assert the Sample badge before the first click.
// - Only synthetic students are used.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SIZES = [
  { w: 1920, h: 1080 },
  { w: 1280, h: 800 },
  { w: 1024, h: 768 }
];

const args = process.argv.slice(2);
const roundName = args.find((arg) => !arg.startsWith('--')) || 'check';
const baseline = args.includes('--baseline');
const outArg = args.find((arg) => arg.startsWith('--out='));
// --out=<folder> writes captures outside the repo (for check runs).
const outDir = outArg ? path.resolve(outArg.slice('--out='.length)) : path.join(repoRoot, 'docs/plans/ui/captures', roundName);

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const binDirs = (process.env.PATH || '').split(path.delimiter).filter((dir) => /node_modules[\\/]\.bin$/.test(dir));
  for (const dir of binDirs) {
    const candidate = path.join(dir, '..', 'playwright');
    if (existsSync(path.join(candidate, 'package.json'))) {
      return require(candidate);
    }
  }
  return require('playwright');
}

async function startVite() {
  const viteBin = path.join(repoRoot, 'node_modules/vite/bin/vite.js');
  const child = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: repoRoot,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', (chunk) => (log += chunk));
  child.stderr.on('data', (chunk) => (log += chunk));
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`${ORIGIN}/`);
      if (response.ok) return child;
    } catch {
      // not ready yet
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error(`Vite did not start on ${ORIGIN}.\n${log}`);
}

const syntheticPhoto = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1100">
  <rect width="900" height="1100" fill="#dfe8f0"/>
  <circle cx="450" cy="400" r="190" fill="#e9c4a6"/>
  <path d="M190 1100c20-300 500-300 520 0z" fill="#00692e"/>
  <circle cx="385" cy="390" r="16" fill="#2b2b2b"/><circle cx="515" cy="390" r="16" fill="#2b2b2b"/>
  <path d="M380 500c40 34 100 34 140 0" fill="none" stroke="#8a4b35" stroke-width="14" stroke-linecap="round"/>
  <text x="450" y="1000" font-family="Arial" font-size="60" fill="#fff" text-anchor="middle">SAMPLE</text>
</svg>`);

const blocked = [];
const captured = [];
const checksPassed = [];

/** Simulated Live: the app thinks it was started against the test portal; the stub answers. */
const LIVE = { mode: 'live', portalUrl: 'https://preportal.gtis.edu.ph' };

/**
 * preset: fields for window.__stub (mode, portalUrl, uploadFail, canEdit, ...).
 * signedIn: put a fixture operator session in storage (simulated live only).
 * simulatedLiveLock: baseline only (old app read portal settings from storage).
 */
async function newPage(browser, size, { preset = {}, signedIn = false, simulatedLiveLock = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1,
    permissions: ['camera']
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith('ws://127.0.0.1:' + PORT)) {
      return route.continue();
    }
    blocked.push(url);
    return route.abort();
  });
  await context.addInitScript((value) => {
    window.__stubPreset = value;
  }, preset);
  await context.addInitScript({ path: path.join(here, 'bridgeStub.js') });
  await context.addInitScript(
    ({ session, liveLock }) => {
      if (liveLock) {
        window.localStorage.setItem(
          'gtis-id-print-station.portal-settings',
          JSON.stringify({ baseUrl: 'https://portal.example.invalid', token: 'fixture-not-a-real-token', useMock: false })
        );
      }
      if (session) {
        window.localStorage.setItem(
          'gtis-id-print-station.operator-session',
          JSON.stringify({
            token: 'fixture-operator-session',
            name: 'Sample Registrar',
            email: 'registrar@example.invalid',
            permissions: { canView: true, canEdit: session === 'edit' },
            expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString()
          })
        );
      } else {
        window.localStorage.removeItem('gtis-id-print-station.operator-session');
      }
    },
    { session: signedIn, liveLock: simulatedLiveLock }
  );
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  return { context, page };
}

function shooter(page, size) {
  return async (name, note = '') => {
    await page.waitForTimeout(250);
    const file = `${name}.${size.w}x${size.h}.png`;
    await page.screenshot({ path: path.join(outDir, file) });
    captured.push({ name, file, size: `${size.w}x${size.h}`, note });
  };
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(400);
}

// ---------- Baseline (main 50f0128) ----------
async function baselineRun(browser, size) {
  {
    const { context, page } = await newPage(browser, size, { simulatedLiveLock: true });
    await page.goto(`${ORIGIN}/`);
    await settle(page);
    await shooter(page, size)('01-lock-screen', 'SIMULATED live mode (fake .invalid portal, network blocked, no submit)');
    await context.close();
  }

  const { context, page } = await newPage(browser, size);
  const shot = shooter(page, size);
  await page.goto(`${ORIGIN}/`);
  await settle(page);
  await page.getByText('Sample data loaded for local testing.').waitFor();

  await shot('02-app-open', 'first student auto-selected; search not focused');
  await page.getByPlaceholder('Search name or admission no.').fill('santos');
  await page.waitForTimeout(600);
  await shot('03-search-results', 'query "santos"');
  await page.getByPlaceholder('Search name or admission no.').fill('zzzz');
  await page.waitForTimeout(600);
  await shot('04-search-empty', 'query with no match');
  await page.getByPlaceholder('Search name or admission no.').fill('');
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: /Arielle/ }).click();
  await page.waitForTimeout(400);
  await shot('05-student-incomplete', 'no photo, no guardian phone or address; Print disabled');

  await page.getByRole('button', { name: /Nathaniel/ }).click();
  await page.waitForTimeout(400);
  await shot('06-long-text-student', 'long guardian name and address');
  await page.locator('.control-panel').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot('07-editor-scrolled', 'rest of the editor and printer settings');

  await page.getByRole('button', { name: /Jetto/ }).click();
  await page.waitForTimeout(400);
  await page.locator('.control-panel').evaluate((el) => el.scrollTo(0, 0));
  const phone = page.locator('.field', { hasText: 'Phone' }).locator('input');
  await phone.scrollIntoViewIfNeeded();
  await phone.fill('0917-222-3030');
  await shot('08-unsaved-edit', 'guardian phone edited, not saved: no unsaved indicator');

  await page.reload();
  await settle(page);
  await page.getByRole('button', { name: /Capture Photo/ }).click();
  await page.waitForTimeout(1200);
  await shot('09-photo-camera', 'fake camera feed');
  await page.locator('.capture-controls input[type=file]').setInputFiles({
    name: 'sample.svg',
    mimeType: 'image/svg+xml',
    buffer: syntheticPhoto
  });
  await page.waitForTimeout(900);
  await shot('10-photo-edit', 'synthetic photo chosen, crop controls');
  await page.getByRole('button', { name: /Close/ }).click();

  await page.getByRole('button', { name: /^Print ID$/ }).click();
  await page.waitForTimeout(500);
  await shot('11-printing', 'print in progress');
  await page.getByText(/Print dialog completed|Print job sent/).waitFor();
  await shot('12-print-done', 'print finished (sample)');

  await page.evaluate(() => (window.__stub.printFail = true));
  await page.getByRole('button', { name: /^Print ID$/ }).click();
  await page.getByText(/device offline/).waitFor();
  await shot('13-print-error', 'print failed (sample error)');
  await page.evaluate(() => (window.__stub.printFail = false));

  await page.getByRole('button', { name: /Save PDF/ }).click();
  await page.getByText(/Saved PDF/).waitFor();
  await shot('14-pdf-saved', 'PDF saved (sample path)');
  await context.close();
}

// ---------- Redesign ----------
async function assertSample(page) {
  await page.getByTestId('mode-badge').filter({ hasText: 'Sample mode' }).waitFor();
}

const strip = (page) => page.getByTestId('status-strip');
const searchBox = (page) => page.getByRole('combobox', { name: /Find a student/ });

/** Runs `action`, waits until a new print job reached the stub and the strip stopped working. */
async function printAndWait(page, action) {
  const before = await page.evaluate(() => window.__stub.printCalls);
  await action();
  await page.waitForFunction((b) => window.__stub.printCalls > b, before);
  await page.waitForFunction(() => !document.querySelector('[data-testid="status-strip"].tone-working'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
}

async function gallery(browser, size, view, name, note) {
  const { context, page } = await newPage(browser, size);
  await page.goto(`${ORIGIN}/src/ui/harness/gallery.html?view=${view}`);
  await settle(page);
  await shooter(page, size)(name, `GALLERY fixture: ${note}`);
  await context.close();
}

async function lockRun(browser, size) {
  const one = async (name, note, options, steps) => {
    const { context, page } = await newPage(browser, size, options);
    await page.goto(`${ORIGIN}/`);
    await settle(page);
    if (steps) await steps(page);
    await shooter(page, size)(name, note);
    await context.close();
  };
  await one('01-lock-screen', 'SIMULATED live (stub portal.info mode=live; no portal contacted)', { preset: LIVE });
  await one('01b-lock-sign-in-error', 'SIMULATED live: stub portal answers 401 for a fake password', { preset: LIVE }, async (page) => {
    await page.getByLabel('Portal email').fill('registrar@example.invalid');
    await page.getByRole('textbox', { name: 'Password' }).fill('wrong');
    await page.keyboard.press('Enter');
    await page.getByRole('alert').waitFor();
  });
}

async function sampleRun(browser, size) {
  const { context, page } = await newPage(browser, size);
  const shot = shooter(page, size);
  await page.goto(`${ORIGIN}/`);
  await settle(page);
  await assertSample(page);
  const search = searchBox(page);

  await shot('03-app-open', 'Sample mode; search focused on open; first student shown');
  await search.fill('santos');
  await page.waitForTimeout(700);
  await shot('04-search-results', 'query "santos": the first match (Arielle) is selected and previewed; blocked strip');
  await search.fill('zzzz');
  await page.waitForTimeout(700);
  await shot('05-search-empty', 'no match: nothing selected, Print ID disabled');
  await search.fill('');
  await page.waitForTimeout(700);

  await search.press('ArrowDown');
  await page.waitForTimeout(500);
  await shot('06-student-incomplete', 'Arielle: photo needed placeholder on the preview, blockers with Fix buttons');
  await page.locator('.readiness-list').getByRole('button', { name: 'Fix' }).first().click();
  await page.waitForTimeout(500);
  await shot('06b-fix-focuses-field', 'Fix focuses the empty address field; preview follows to the back side');

  await search.focus();
  await search.press('ArrowDown');
  await page.waitForTimeout(600);
  await shot('07-long-text-student', 'Nathaniel: long guardian name flagged as printing very small');
  await page.getByRole('textbox', { name: /^Last name/ }).fill('Villanueva-Dela Cruz Santiago');
  await page.waitForTimeout(500);
  await shot('07b-overflow-warning', 'last name too long for the card: flagged on the field and in the strip');
  await strip(page).getByRole('button', { name: /Discard/ }).click();

  await search.focus();
  await search.press('ArrowUp');
  await search.press('ArrowUp');
  await page.waitForTimeout(500);
  await page.getByRole('textbox', { name: /^Phone/ }).fill('0917-222-3030');
  await page.waitForTimeout(300);
  await shot('08-unsaved-edit', 'phone edited: Unsaved pill, Edited mark, Save/Discard in the strip');
  await search.focus();
  await search.press('ArrowDown');
  await page.getByTestId('confirm-switch').waitFor();
  await shot('08b-unsaved-switch-guard', 'switching with unsaved edits: focus-trapped dialog');
  await page.getByRole('button', { name: /Save and switch/ }).click();
  await page.waitForTimeout(500);

  await page.reload();
  await settle(page);
  await assertSample(page);
  await search.fill('bamba');
  await page.waitForTimeout(700);
  await search.press('Enter');
  await page.waitForTimeout(300);
  await shot('09-focus-print-button', 'keyboard: Enter in search moves focus to Print ID (visible focus ring)');
  await page.getByRole('button', { name: /Printer settings/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await shot('09b-printer-popover-keyboard', 'printer settings opened from the keyboard; focus inside; Esc closes');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Replace photo/ }).click();
  await page.waitForTimeout(1200);
  await shot('10-photo-camera', 'photo editor with the fake camera feed');
  await page.locator('.photo-editor input[type=file]').setInputFiles({ name: 'sample.svg', mimeType: 'image/svg+xml', buffer: syntheticPhoto });
  await page.waitForTimeout(900);
  await shot('10b-photo-edit', 'synthetic photo chosen; Use this photo is the main action');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await shot('10c-photo-close-confirm', 'Esc with a framed photo asks before dropping it');
  await page.getByRole('button', { name: 'Close without saving' }).click();
  await page.waitForTimeout(300);

  await search.focus();
  await page.keyboard.press('Control+p');
  await page.waitForTimeout(600);
  await shot('11-printing', 'print in progress (Ctrl+P)');
  await page.waitForFunction(() => !document.querySelector('[data-testid="status-strip"].tone-working'), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot('12-print-and-next', 'printed: search cleared and focused for the next name; "Printed" mark in the list');

  await page.keyboard.type('villanueva');
  await page.waitForTimeout(700);
  await shot('12b-reprint-last-available', 'next student chosen; Reprint last shows "J. Bamba"; long guardian name switches the preview to the back');
  await search.fill('');
  await page.waitForTimeout(700);
  await page.getByLabel(/Hide printed/).check();
  await page.waitForTimeout(300);
  await shot('12d-hide-printed', 'Hide printed (1 today) hides students printed today');
  await page.getByLabel(/Hide printed/).uncheck();

  await search.fill('bamba');
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+p');
  await page.getByTestId('confirm-duplicate').waitFor();
  await shot('12c-duplicate-confirm', 'printing an already-printed student asks first; "Don’t print" is filled and focused');
  await page.getByRole('button', { name: 'Don’t print' }).click();

  await search.fill('villanueva');
  await page.waitForTimeout(700);
  await page.evaluate(() => (window.__stub.printFail = true));
  await page.keyboard.press('Control+p');
  await strip(page).filter({ hasText: /didn.t print/i }).waitFor();
  await page.waitForTimeout(300);
  await shot('13-print-error', 'print failed (sample error): Try again is the main action; Print ID outlined');
  await strip(page).getByRole('button', { name: 'Try again' }).click();
  await page.getByTestId('confirm-jam').waitFor();
  await shot('13b-jam-confirm', 'Try again after a printer error asks to check for a card first; safe answer focused');
  await page.getByRole('button', { name: 'Don’t print' }).click();
  await page.evaluate(() => (window.__stub.printFail = false));

  await page.getByRole('button', { name: /Save PDF/ }).click();
  await strip(page).filter({ hasText: /PDF saved/i }).waitFor();
  await shot('14-pdf-saved', 'PDF saved (sample path)');
  await context.close();

  {
    const { context, page } = await newPage(browser, size, { preset: { noPrinters: true } });
    await page.goto(`${ORIGIN}/`);
    await settle(page);
    await assertSample(page);
    await page.getByRole('button', { name: /Printer settings/ }).click();
    await page.waitForTimeout(300);
    await shooter(page, size)('15-printer-settings-no-printers', 'printer settings open, no printers found');
    await context.close();
  }
}

async function liveRun(browser, size, { checks = false } = {}) {
  const { context, page } = await newPage(browser, size, { preset: { ...LIVE, uploadDelayMs: 2500 }, signedIn: 'edit' });
  const shot = shooter(page, size);
  await page.goto(`${ORIGIN}/`);
  await settle(page);
  await page.getByTestId('mode-badge').filter({ hasText: 'Live' }).waitFor();
  await shot('20-live-app-open', 'SIMULATED live: stub portal, fake operator; nothing contacted');
  await page.keyboard.press('Control+p');
  await strip(page).filter({ hasText: /Filing the front and back/ }).waitFor();
  await shot('21-live-uploading', 'SIMULATED live: printed, filing the upright archive copy');
  await strip(page).filter({ hasText: /filed in the student/ }).waitFor();
  await shot('22-live-printed-filed', 'SIMULATED live: printed and filed');
  if (checks) {
    const result = await page.evaluate(() => ({
      print: window.__stub.jobs.at(-1)?.html || '',
      archive: window.__stub.archiveJobs.at(-1) || ''
    }));
    if (!result.print.includes('class="page-content rotate-180"')) throw new Error('Check failed: the print HTML no longer rotates the back');
    if (!result.archive.includes('data-side="back"') || result.archive.includes('class="page-content rotate-180"')) throw new Error('Check failed: the archive upload is not the upright renderArchiveHtml copy');
    checksPassed.push('Live upload sends the upright archive HTML; the print HTML still rotates the back');
  }
  await page.evaluate(() => {
    window.__stub.uploadFail = true;
    window.__stub.uploadDelayMs = 300;
  });
  await page.keyboard.type('villanueva');
  await page.waitForTimeout(800);
  await page.keyboard.press('Control+p');
  await strip(page).filter({ hasText: /didn.t upload/ }).waitFor();
  await shot('23-live-upload-failed', 'SIMULATED live: printed but upload failed; Try again uploads only');
  await page.evaluate(() => (window.__stub.uploadFail = false));
  await strip(page).getByRole('button', { name: 'Try again' }).click();
  await strip(page).filter({ hasText: /filed in the student/ }).waitFor();
  await shot('23b-live-upload-retried', 'SIMULATED live: upload retried and filed');
  await context.close();

  const ro = await newPage(browser, size, { preset: { ...LIVE, canEdit: false }, signedIn: 'view' });
  await ro.page.goto(`${ORIGIN}/`);
  await settle(ro.page);
  await shooter(ro.page, size)('24-live-read-only-operator', 'SIMULATED live: operator who can print but not edit');
  await ro.context.close();
}

// Executes the task benchmarks against the stub bridge and fails the run if any is wrong.
async function benchmarkChecks(browser, size) {
  const { context, page } = await newPage(browser, size);
  await page.goto(`${ORIGIN}/`);
  await settle(page);
  await assertSample(page);
  const stub = () => page.evaluate(() => ({ calls: window.__stub.printCalls, titles: window.__stub.jobs.map((job) => job.title) }));
  const lastHtml = () => page.evaluate(() => window.__stub.jobs.at(-1)?.html || '');
  const fail = (message) => {
    throw new Error(`Benchmark check failed: ${message}`);
  };
  const search = searchBox(page);
  const heading = () => page.locator('.editor-title h1').textContent().catch(() => '');
  const ctrlP = () => page.keyboard.press('Control+p');

  if (!(await search.evaluate((el) => el === document.activeElement))) fail('search is not focused on open');

  // (a) find and print: type, Ctrl+P. Then the search is cleared and focused for the next student.
  const t0 = Date.now();
  await page.keyboard.type('bamba');
  await page.waitForTimeout(600);
  await printAndWait(page, ctrlP);
  if (!(await stub()).titles.at(-1)?.includes('2026001')) fail('(a) did not print 2026001');
  if ((await search.inputValue()) !== '' || !(await search.evaluate((el) => el === document.activeElement))) fail('print and next: search not cleared and focused');
  checksPassed.push('(a) type + Ctrl+P prints the first match; search is cleared and focused after printing');

  // (b) fix the phone, then print: the edit is on the printed card without a separate save.
  await page.keyboard.type('villanueva');
  await page.waitForTimeout(700);
  if (!(await heading())?.includes('Nathaniel')) fail('(b) typing a new name did not select its first match');
  await page.getByRole('textbox', { name: /^Phone/ }).fill('0917-555-1212');
  await printAndWait(page, ctrlP);
  if (!(await lastHtml()).includes('0917-555-1212')) fail('(b) edited phone not in the printed card');
  const perCardMs = Math.round((Date.now() - t0) / 2);
  checksPassed.push('(b) edited phone is on the printed card; Print ID saved first');

  // Search shows only students in the results (wrong-card bug from round 1).
  await search.fill('santos');
  await page.waitForTimeout(700);
  if (!(await heading())?.includes('Arielle')) fail('search "santos" did not select Arielle');
  await search.fill('zzzz');
  await page.waitForTimeout(700);
  if (await page.locator('.editor-title h1').count()) fail('no-match search still shows a student');
  if (!(await page.getByRole('button', { name: /^Print ID/ }).isDisabled())) fail('Print ID enabled with no student');
  checksPassed.push('A new search selects its first match; no match clears the selection and disables Print ID');

  // Duplicate guard + double print guard: an already-printed student asks first; two Ctrl+P send one job.
  await search.fill('bamba');
  await page.waitForTimeout(700);
  const before = (await stub()).calls;
  await ctrlP();
  await ctrlP();
  await page.getByTestId('confirm-duplicate').waitFor();
  await printAndWait(page, () => page.getByRole('button', { name: 'Print another card' }).click());
  await page.waitForTimeout(2000);
  if ((await stub()).calls !== before + 1) fail(`duplicate confirm + double Ctrl+P sent ${(await stub()).calls - before} jobs`);
  checksPassed.push('Reprinting an already-printed student asks first; double Ctrl+P sends one job');

  // (d) reprint last with another student selected sends the previous student's card.
  await page.keyboard.type('villanueva');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Reprint last/ }).click();
  await page.getByTestId('confirm-reprint').waitFor();
  if (!(await page.evaluate(() => document.activeElement?.textContent?.includes('Don’t print')))) fail('Reprint last confirm does not focus "Don’t print"');
  await printAndWait(page, () => page.getByRole('button', { name: 'Print another card' }).click());
  if (!(await stub()).titles.at(-1)?.includes('2026001')) fail('(d) Reprint last did not send 2026001');
  checksPassed.push('(d) Reprint last asks first (safe button focused), then sends the previous student while another is selected');

  // Try again after a failed reprint asks about a jam, then repeats that reprint.
  await page.evaluate(() => (window.__stub.printFail = true));
  await page.getByRole('button', { name: /Reprint last/ }).click();
  await page.getByTestId('confirm-reprint').waitFor();
  await page.getByRole('button', { name: 'Print another card' }).click();
  await strip(page).filter({ hasText: /didn.t print/i }).waitFor();
  await page.evaluate(() => (window.__stub.printFail = false));
  await strip(page).getByRole('button', { name: 'Try again' }).click();
  await page.getByTestId('confirm-jam').waitFor();
  await printAndWait(page, () => page.getByRole('button', { name: 'Print another card' }).click());
  if (!(await stub()).titles.at(-1)?.includes('2026001')) fail('Try again after a failed reprint printed the wrong student');
  checksPassed.push('Try again after a printer error asks about a jam, then repeats the same reprint');

  // Preview shows the back upright; the print HTML still rotates it.
  if (!(await lastHtml()).includes('class="page-content rotate-180"')) fail('print HTML no longer rotates the back');
  if ((await page.locator('[data-testid="card-preview"] .card-content-rotated').count()) !== 0) fail('preview back is rotated');
  checksPassed.push('Preview back is upright; print HTML back still rotated');

  // A stray Enter in the duplicate or jam dialog never prints.
  await search.fill('bamba');
  await page.waitForTimeout(700);
  let calls = (await stub()).calls;
  await ctrlP();
  await page.getByTestId('confirm-duplicate').waitFor();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2200);
  if ((await stub()).calls !== calls || (await page.getByTestId('confirm-duplicate').count())) fail('Enter in the duplicate dialog printed or left it open');
  await page.evaluate(() => (window.__stub.printFail = true));
  await ctrlP();
  await page.getByTestId('confirm-duplicate').waitFor();
  await printAndWait(page, () => page.getByRole('button', { name: 'Print another card' }).click());
  await page.evaluate(() => (window.__stub.printFail = false));
  await strip(page).getByRole('button', { name: 'Try again' }).click();
  await page.getByTestId('confirm-jam').waitFor();
  calls = (await stub()).calls;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2200);
  if ((await stub()).calls !== calls) fail('Enter in the jam dialog printed');
  checksPassed.push('Duplicate and jam dialogs focus "Don’t print": a stray Enter never prints');

  checksPassed.push(`Print-and-next cost per card: 1 typed field + 1 key (Ctrl+P), +1 click if the Windows dialog is on; about ${perCardMs} ms per card with the stub's 1.8 s print`);
  await context.close();
}

// Race and persistence checks on a fresh station.
async function raceChecks(browser, size) {
  const { context, page } = await newPage(browser, size);
  await page.goto(`${ORIGIN}/`);
  await settle(page);
  await assertSample(page);
  const fail = (message) => {
    throw new Error(`Race check failed: ${message}`);
  };
  const titles = () => page.evaluate(() => window.__stub.jobs.map((job) => job.title));

  // Ctrl+P straight after typing waits for the search and prints its first match, not the old student.
  await page.keyboard.type('villanueva');
  await page.keyboard.press('Control+p');
  await page.waitForFunction(() => window.__stub.printCalls > 0, null, { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="status-strip"].tone-working'), null, { timeout: 15000 });
  const printed = await titles();
  if (printed.length !== 1 || !printed[0].includes('2026003')) fail(`Ctrl+P during a pending search printed ${printed.join(', ') || 'nothing'}`);
  const raceHtml = await page.evaluate(() => window.__stub.jobs[0].html);
  if (!raceHtml.includes('Villanueva') || raceHtml.includes('Jetto')) fail('the pending print used the previous student’s name');
  const records = await page.evaluate(() => [...document.querySelectorAll('.student-row strong')].map((el) => el.textContent));
  if (records.some((name) => /Jetto.*Dela Cruz|Jetto.*Villanueva/.test(name || ''))) fail(`a record was overwritten: ${records.join(' | ')}`);
  checksPassed.push('Ctrl+P right after typing waits for the search, then prints its first match');

  // Typing right after print-and-next is not swallowed by the kept selection.
  await page.keyboard.type('santos');
  await page.waitForTimeout(900);
  const heading = await page.locator('.editor-title h1').textContent();
  if (!heading?.includes('Arielle')) fail('typing straight after printing did not select the new match');
  checksPassed.push('Typing straight after a print selects the new match');

  // Enter straight after typing focuses Print ID on the new match.
  const search = searchBox(page);
  await search.fill('');
  await page.waitForTimeout(700);
  await search.focus();
  await page.keyboard.type('bamba');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const focusedIsPrint = await page.evaluate(() => document.activeElement?.textContent?.includes('Print ID'));
  const heading2 = await page.locator('.editor-title h1').textContent();
  if (!focusedIsPrint || !heading2?.includes('Bamba')) fail('Enter during a pending search did not open the new match');
  checksPassed.push('Enter right after typing waits for the search, then moves focus to Print ID');

  // Combobox wiring: aria-activedescendant points at the selected option.
  await search.focus();
  await search.press('ArrowDown');
  await page.waitForTimeout(400);
  const wiring = await page.evaluate(() => {
    const box = document.getElementById('student-search');
    const id = box?.getAttribute('aria-activedescendant');
    const option = id ? document.getElementById(id) : null;
    return {
      id,
      role: option?.getAttribute('role'),
      selected: option?.getAttribute('aria-selected'),
      expanded: box?.getAttribute('aria-expanded'),
      controls: box?.getAttribute('aria-controls'),
      listRole: document.getElementById(box?.getAttribute('aria-controls') || '')?.getAttribute('role')
    };
  });
  if (!wiring.id || wiring.role !== 'option' || wiring.selected !== 'true' || wiring.expanded !== 'true' || wiring.listRole !== 'listbox') {
    fail(`combobox wiring ${JSON.stringify(wiring)}`);
  }
  const tree = await page.locator('.list-zone').ariaSnapshot();
  writeFileSync(path.join(outDir, 'a11y-student-list.txt'), tree + '\n');
  checksPassed.push(`Combobox: aria-activedescendant → ${wiring.id} (role=option, aria-selected=true, listbox expanded); accessibility tree saved to a11y-student-list.txt`);

  // Printer choice and today's printed marks survive a restart.
  await page.getByRole('button', { name: /Printer settings/ }).click();
  await page.getByLabel(/Print without the Windows dialog/).check();
  await page.keyboard.press('Escape');
  await page.reload();
  await settle(page);
  await page.getByRole('button', { name: /Printer settings/ }).click();
  if (!(await page.getByLabel(/Print without the Windows dialog/).isChecked())) fail('silent print setting not kept');
  await page.keyboard.press('Escape');
  if (!(await page.getByText(/Printed \d/).count())) fail('printed mark not kept after restart');
  checksPassed.push('Printer setting and today’s printed marks are kept after a restart');
  await context.close();
}

// Final-batch bugs: unsaved edits + new search + Ctrl+P, failed search, invalid phone.
async function bugChecks(browser, size) {
  const fail = (message) => {
    throw new Error(`Bug check failed: ${message}`);
  };
  {
    const { context, page } = await newPage(browser, size);
    await page.goto(`${ORIGIN}/`);
    await settle(page);
    await assertSample(page);
    const calls = () => page.evaluate(() => window.__stub.printCalls);
    // Bug 1: Jetto has unsaved edits; type another name and press Ctrl+P at once.
    await page.getByRole('textbox', { name: /^Phone/ }).fill('0917-333-4444');
    await searchBox(page).fill('villanueva');
    await page.keyboard.press('Control+p');
    await page.getByTestId('confirm-switch').waitFor();
    await page.waitForTimeout(2500);
    if ((await calls()) !== 0) fail('Ctrl+P printed while the switch question was open');
    await page.getByRole('button', { name: 'Stay here' }).click();
    await page.waitForTimeout(2500);
    if ((await calls()) !== 0) fail('the dropped print ran after answering the switch question');
    if (!(await page.locator('.editor-title h1').textContent())?.includes('Bamba')) fail('Stay here did not keep the edited student');
    checksPassed.push('Unsaved edits + new search + Ctrl+P: asks to switch, prints nothing, saves nothing');

    // Bug 3: a phone with letters, or under 7 digits, blocks printing.
    await page.getByRole('textbox', { name: /^Phone/ }).fill('abc-xyz');
    await page.waitForTimeout(300);
    if (!(await page.getByRole('button', { name: /^Print ID/ }).isDisabled())) fail('Print ID enabled with phone "abc-xyz"');
    if (!(await strip(page).textContent())?.includes('phone number isn’t valid')) fail('strip does not explain the invalid phone');
    await page.keyboard.press('Control+p');
    await page.waitForTimeout(800);
    await page.getByRole('textbox', { name: /^Phone/ }).fill('12345');
    await page.waitForTimeout(300);
    if (!(await page.getByRole('button', { name: /^Print ID/ }).isDisabled())) fail('Print ID enabled with a 5-digit phone');
    if ((await calls()) !== 0) fail('an invalid phone was printed');
    checksPassed.push('A phone with letters or under 7 digits blocks printing, with the reason in the strip');
    await context.close();
  }
  {
    // Bug 2: a failed search drops the waiting print and says so.
    const { context, page } = await newPage(browser, size, { preset: LIVE, signedIn: 'edit' });
    await page.goto(`${ORIGIN}/`);
    await settle(page);
    await page.evaluate(() => (window.__stub.searchFail = true));
    await page.keyboard.type('bamba');
    await page.keyboard.press('Control+p');
    await strip(page).filter({ hasText: 'Search failed. Nothing was printed.' }).waitFor();
    await page.evaluate(() => (window.__stub.searchFail = false));
    await searchBox(page).fill('villanueva');
    await page.waitForTimeout(2500);
    if ((await page.evaluate(() => window.__stub.printCalls)) !== 0) fail('a later search printed after a failed one');
    checksPassed.push('A failed search shows "Search failed. Nothing was printed." and a later search prints nothing by itself');
    await context.close();
  }
}

// Pre-PR review: printed-today storage and waiting Ctrl+P with an unclear search.
async function prChecks(browser, size) {
  const fail = (message) => {
    throw new Error(`PR check failed: ${message}`);
  };
  const { context, page } = await newPage(browser, size);
  // A key from an earlier day, as an old build would have left it (with a name in it).
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('gtis-id-print-station.printed-2020-01-01', JSON.stringify({ at: { x: 1 }, names: { x: 'Old Name' } }));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto(`${ORIGIN}/`);
  await settle(page);
  await assertSample(page);
  const calls = () => page.evaluate(() => window.__stub.printCalls);
  const printedKeys = () =>
    page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('gtis-id-print-station.printed-')).map((key) => [key, localStorage.getItem(key)]));
  if ((await printedKeys()).some(([key]) => key.endsWith('2020-01-01'))) fail('an older day’s printed key was not deleted on startup');

  // P2-1: only id → time is stored.
  await page.keyboard.type('bamba');
  await printAndWait(page, () => page.keyboard.press('Control+p'));
  const stored = await printedKeys();
  if (stored.length !== 1) fail(`expected one printed key, found ${stored.length}`);
  const value = JSON.parse(stored[0][1] || '{}');
  if (!Object.values(value).every((v) => typeof v === 'number') || /Bamba|Jetto|names/.test(stored[0][1] || '')) {
    fail(`printed-today storage holds more than ids and times: ${stored[0][1]}`);
  }
  checksPassed.push('Printed-today storage holds only student id → time; older day keys are deleted on startup');

  // P2-2a: a waiting Ctrl+P with several matches does not print; it says so and focuses Print ID.
  let before = await calls();
  await page.keyboard.type('maria');
  await page.keyboard.press('Control+p');
  await strip(page).filter({ hasText: 'Several matches' }).waitFor();
  await page.waitForTimeout(2200);
  if ((await calls()) !== before) fail('Ctrl+P during a search with several matches printed');
  if (!(await page.evaluate(() => document.activeElement?.textContent?.includes('Print ID')))) fail('Print ID not focused after several matches');

  // P2-2b: an exact student number prints straight away.
  await searchBox(page).fill('');
  await page.waitForTimeout(700);
  await searchBox(page).focus();
  await page.keyboard.type('2026003');
  await printAndWait(page, () => page.keyboard.press('Control+p'));
  if (!(await page.evaluate(() => window.__stub.jobs.at(-1).title)).includes('2026003')) fail('exact student number did not print that student');

  // P2-2c: picking a student while a Ctrl+P waits cancels it.
  before = await calls();
  await searchBox(page).fill('');
  await page.waitForTimeout(700);
  await searchBox(page).focus();
  await page.keyboard.type('bamba');
  await page.keyboard.press('Control+p');
  await page.getByRole('option', { name: /Arielle/ }).click();
  await page.waitForTimeout(2500);
  if ((await calls()) !== before) fail('a waiting Ctrl+P printed after the operator picked another student');
  checksPassed.push('Waiting Ctrl+P: several matches → no print, "Several matches" + Print ID focused; exact number prints; picking a student cancels it');
  await context.close();
}

async function finalRun(browser, size) {
  const one = async (name, note, options, steps) => {
    const { context, page } = await newPage(browser, size, options);
    await page.goto(`${ORIGIN}/`);
    await settle(page);
    if (steps) await steps(page);
    await shooter(page, size)(name, note);
    await context.close();
  };
  const live = { preset: LIVE, signedIn: 'edit' };
  await one('01-sign-in', 'SIMULATED live lock screen', { preset: LIVE });
  await one('02-sign-in-error', 'SIMULATED live: wrong password', { preset: LIVE }, async (page) => {
    await page.getByLabel('Portal email').fill('registrar@example.invalid');
    await page.getByRole('textbox', { name: 'Password' }).fill('wrong');
    await page.keyboard.press('Enter');
    await page.getByRole('alert').waitFor();
  });
  await one('03b-live-app-open', 'SIMULATED live: signed in, Live badge with the portal host', live);
  await one('03-ready', 'Sample mode, ready to print', {});
  await one('04-blocked', 'blocked student: photo needed, emergency contact', {}, async (page) => {
    await searchBox(page).fill('santos');
    await page.waitForTimeout(800);
  });
  await one('05-invalid-phone', 'phone with letters blocks printing', {}, async (page) => {
    await page.getByRole('textbox', { name: /^Phone/ }).fill('abc-xyz');
    await page.waitForTimeout(400);
  });
  await one('06-printed-next', 'print and next (Ctrl+P), search cleared for the next name', {}, async (page) => {
    await page.keyboard.type('bamba');
    await printAndWait(page, () => page.keyboard.press('Control+p'));
  });
  await one('07-print-error', 'print failed: Try again is the main action', {}, async (page) => {
    await page.evaluate(() => (window.__stub.printFail = true));
    await page.keyboard.type('villanueva');
    await page.waitForTimeout(800);
    await page.keyboard.press('Control+p');
    await strip(page).filter({ hasText: /didn.t print/i }).waitFor();
  });
  await one('08-live-filed', 'SIMULATED live: printed and filed in the portal', live, async (page) => {
    await page.keyboard.press('Control+p');
    await strip(page).filter({ hasText: /filed in the student/ }).waitFor({ timeout: 15000 });
  });
  await one('09-live-upload-failed', 'SIMULATED live: printed, upload failed, Try again', { ...live, preset: { ...LIVE, uploadFail: true, uploadDelayMs: 300 } }, async (page) => {
    await page.keyboard.press('Control+p');
    await strip(page).filter({ hasText: /didn.t upload/ }).waitFor({ timeout: 15000 });
  });
  await one('10-search-failed', 'SIMULATED live: search failed while a print was waiting', live, async (page) => {
    await page.evaluate(() => (window.__stub.searchFail = true));
    await page.keyboard.type('bamba');
    await page.keyboard.press('Control+p');
    await strip(page).filter({ hasText: 'Search failed' }).waitFor();
  });
}

async function redesignRun(browser, size) {
  await lockRun(browser, size);
  await gallery(browser, size, 'list-states', 'gallery-03-list-states', 'student list: loading, error, empty');
  await gallery(browser, size, 'strip-states', 'gallery-04-status-strip-states', 'strip: fixture copies of the states App.tsx sets');
  await sampleRun(browser, size);
  await liveRun(browser, size, { checks: size.w === 1920 });
  if (size.w === 1920) {
    await benchmarkChecks(browser, size);
    await raceChecks(browser, size);
    await bugChecks(browser, size);
    await prChecks(browser, size);
  }
}

async function main() {
  const { chromium } = loadPlaywright();
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const vite = await startVite();
  let browser;
  try {
    const launchArgs = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
    try {
      browser = await chromium.launch({ channel: 'chrome', args: launchArgs });
    } catch {
      browser = await chromium.launch({ args: launchArgs });
    }
    if (args.includes('--final')) {
      for (const size of SIZES.slice(0, 2)) await finalRun(browser, size);
      await benchmarkChecks(browser, SIZES[0]);
      await raceChecks(browser, SIZES[0]);
      await bugChecks(browser, SIZES[0]);
      await prChecks(browser, SIZES[0]);
    } else if (args.includes('--checks')) {
      await benchmarkChecks(browser, SIZES[0]);
      await raceChecks(browser, SIZES[0]);
      await bugChecks(browser, SIZES[0]);
      await prChecks(browser, SIZES[0]);
    } else {
      for (const size of SIZES) {
        if (baseline) await baselineRun(browser, size);
        else await redesignRun(browser, size);
      }
    }
  } finally {
    await browser?.close();
    vite.kill();
  }

  const names = [...new Set(captured.map((item) => item.name))];
  const lines = [
    `# ${roundName} captures`,
    '',
    baseline ? 'Build: baseline (main before the redesign).' : `Build: this round's working tree.`,
    'Fake print/portal bridge (src/ui/harness/bridgeStub.js), synthetic students, outside network blocked.',
    'Notes marked SIMULATED live use the stub portal: the app is in Live mode, but no portal is contacted.',
    'Files prefixed `gallery-` are components rendered with fixture props on a dev-only page, not a live app flow.',
    '',
    ...(checksPassed.length ? ['Checks passed this run:', '', ...checksPassed.map((line) => `- ${line}`), ''] : []),
    '',
    '| State | Note | Files |',
    '| --- | --- | --- |',
    ...names.map((name) => {
      const items = captured.filter((item) => item.name === name);
      return `| ${name} | ${items[0].note} | ${items.map((item) => `[${item.size}](${item.file})`).join(' ')} |`;
    }),
    ''
  ];
  writeFileSync(path.join(outDir, 'index.md'), lines.join('\n'));

  if (blocked.length) {
    console.error(`FAIL: ${blocked.length} outside request(s) were attempted and blocked:`);
    for (const url of [...new Set(blocked)]) console.error('  ' + url);
    process.exit(1);
  }
  for (const line of checksPassed) console.log(`check ok: ${line}`);
  console.log(`OK: ${captured.length} captures in ${path.relative(repoRoot, outDir)}; no outside requests.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
