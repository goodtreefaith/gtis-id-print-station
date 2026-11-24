// Tests the main-process portal bridge against a local fake portal.
// Never contacts a real portal. Run with `npm run test:bridge`.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isAppUrl } from '../electron/appUrl';
import { fetchImageDataUrl, MAX_IMAGE_BYTES } from '../electron/imageFetch';
import {
  checkDeviceToken,
  normalizePortalUrl,
  PORTAL_HOST_ALLOWLIST,
  portalRequest,
  PortalRequestError
} from '../electron/portalRequest';

// Deliberately low-entropy so it cannot be mistaken for a real token.
const FAKE_TOKEN = 'test-device-token-' + 'x'.repeat(30);
let failures = 0;
function check(name: string, condition: boolean) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`);
  if (!condition) failures += 1;
}

interface Seen { url: string; method: string; headers: Record<string, string | string[] | undefined>; body: string }
const seen: Seen[] = [];
const otherHostHits: Seen[] = [];

const other = createServer((req, res) => {
  otherHostHits.push({ url: req.url || '', method: req.method || '', headers: req.headers, body: '' });
  res.end('{}');
});

const portal = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    seen.push({ url: req.url || '', method: req.method || '', headers: req.headers, body });
    const token = req.headers['x-gtis-idprint-token'];
    res.setHeader('content-type', 'application/json');
    if (req.url === '/idprintapi/redirect') {
      res.statusCode = 302;
      res.setHeader('location', `http://127.0.0.1:${(other.address() as AddressInfo).port}/steal`);
      res.end();
      return;
    }
    if (req.url?.startsWith('/uploads/')) {
      const png = Buffer.from('89504e470d0a1a0a', 'hex');
      if (req.url === '/uploads/photo.jpg') {
        res.setHeader('content-type', 'image/jpeg');
        res.end(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1000, 7)]));
      } else if (req.url === '/uploads/same-host-redirect.jpg') {
        res.statusCode = 302;
        res.setHeader('location', '/uploads/photo.jpg');
        res.end();
      } else if (req.url === '/uploads/other-host-redirect.jpg') {
        res.statusCode = 302;
        res.setHeader('location', `http://127.0.0.1:${(other.address() as AddressInfo).port}/steal.jpg`);
        res.end();
      } else if (req.url === '/uploads/page.svg') {
        res.setHeader('content-type', 'image/svg+xml');
        res.end('<svg/>');
      } else if (req.url === '/uploads/fake.png') {
        res.setHeader('content-type', 'image/png; charset=binary');
        res.end(png);
      } else if (req.url === '/uploads/huge.png') {
        res.setHeader('content-type', 'image/png');
        res.end(Buffer.alloc(2048, 1));
      } else {
        res.setHeader('content-type', 'text/html');
        res.end('<html></html>');
      }
      return;
    }
    if (req.url === '/idprintapi/slow') {
      setTimeout(() => res.end('{"status":true}'), 2000);
      return;
    }
    if (token !== FAKE_TOKEN) {
      res.statusCode = 401;
      res.end(JSON.stringify({ status: false, message: 'Invalid ID print token.' }));
      return;
    }
    if (req.url === '/idprintapi/login') {
      const parsed = JSON.parse(body || '{}');
      if (!parsed.username || !parsed.password) {
        res.statusCode = 422;
        res.end(JSON.stringify({ status: false, message: 'Email and password are required.' }));
        return;
      }
    }
    res.end(JSON.stringify({ status: true, students: [], echo: req.url }));
  });
});

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
}

async function main() {
  await listen(other);
  const port = await listen(portal);
  const baseUrl = `http://127.0.0.1:${port}`;
  const connection = { baseUrl, token: FAKE_TOKEN };
  // Under Electron, use net.fetch / net.request exactly as electron/main.ts does.
  let fetchImpl = (input: string, init: RequestInit) => fetch(input, init);
  let photoFetch = fetchImpl;
  if (process.versions.electron) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app, net } = require('electron') as typeof import('electron');
    await app.whenReady();
    fetchImpl = (input: string, init: RequestInit) => net.fetch(input, init);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    photoFetch = (require('../electron/netManualFetch') as typeof import('../electron/netManualFetch')).netFetchManualRedirect;
    console.log('Using Electron net.fetch');
  }

  // Headers: both token headers plus operator header.
  const ok = await portalRequest(connection, { method: 'GET', path: '/idprintapi/students?q=a&page=1', operatorToken: 'op-123' }, fetchImpl);
  const last = seen[seen.length - 1];
  check('GET succeeds and returns payload', ok.ok && ok.status === 200 && (ok.payload as { status: boolean }).status === true);
  check('sends Authorization: Bearer', last.headers.authorization === `Bearer ${FAKE_TOKEN}`);
  check('sends X-GTIS-IDPRINT-TOKEN', last.headers['x-gtis-idprint-token'] === FAKE_TOKEN);
  check('sends X-GTIS-IDPRINT-OPERATOR', last.headers['x-gtis-idprint-operator'] === 'op-123');
  check('keeps the query string', last.url === '/idprintapi/students?q=a&page=1');

  const post = await portalRequest(connection, { method: 'POST', path: '/idprintapi/students/7/guardian', body: { guardian_name: 'X' } }, fetchImpl);
  check('POST sends JSON body', post.ok && seen[seen.length - 1].body === '{"guardian_name":"X"}');

  // Path restrictions.
  const before = seen.length;
  for (const path of [
    '/idprintapi/../admin',
    '/idprintapi/%2e%2e/admin',
    '/idprintapi/%2E%2E/%2e%2e/x',
    '/admin/idprintapi/x',
    '//evil.example/idprintapi/x',
    'https://evil.example/idprintapi/x',
    '/idprintapi\\..\\admin',
    '/idprintapi/x\r\nX-Evil: 1'
  ]) {
    const result = await portalRequest(connection, { method: 'GET', path }, fetchImpl);
    check(`rejects path ${JSON.stringify(path)}`, !result.ok && result.status === 0);
  }
  check('rejected paths never reached the server', seen.length === before);
  check('rejects other methods', !(await portalRequest(connection, { method: 'DELETE', path: '/idprintapi/x' }, fetchImpl)).ok);
  check('rejects GET with body', !(await portalRequest(connection, { method: 'GET', path: '/idprintapi/x', body: {} }, fetchImpl)).ok);

  // Redirects are not followed, so the token never goes to another host.
  const redirected = await portalRequest(connection, { method: 'GET', path: '/idprintapi/redirect' }, fetchImpl);
  check('redirect is refused', !redirected.ok && redirected.status === 0);
  check('redirect target never contacted', otherHostHits.length === 0);

  // Timeout and unreachable.
  const slow = await portalRequest(connection, { method: 'GET', path: '/idprintapi/slow' }, fetchImpl, { timeoutMs: 300 });
  check('timeout returns status 0 with message', !slow.ok && slow.status === 0 && /in time/.test(String((slow.payload as { message: string }).message)));
  const down = await portalRequest({ baseUrl: 'http://127.0.0.1:1', token: FAKE_TOKEN }, { method: 'GET', path: '/idprintapi/x' }, fetchImpl);
  check('unreachable returns status 0', !down.ok && down.status === 0);
  check('error payload never contains the token', !JSON.stringify([slow, down, redirected]).includes(FAKE_TOKEN));

  // Device token check used by device setup.
  check('token check: accepted on 422', (await checkDeviceToken(connection, fetchImpl)).check === 'accepted');
  check('token check: rejected on 401', (await checkDeviceToken({ baseUrl, token: 'wrong-token-wrong-token-wrong-token-00' }, fetchImpl)).check === 'rejected');
  check('token check: unreachable when down', (await checkDeviceToken({ baseUrl: 'http://127.0.0.1:1', token: FAKE_TOKEN }, fetchImpl)).check === 'unreachable');

  // Photo downloads for the card.
  const host = `127.0.0.1:${port}`;
  const photo = (path: string, opts: { maxBytes?: number } = {}) =>
    fetchImageDataUrl(`${baseUrl}${path}`, host, photoFetch, { requireHttps: false, ...opts }).then(
      (value) => value,
      (error: Error) => `ERR ${error.message}`
    );
  check('photo: jpeg downloads as data URL', (await photo('/uploads/photo.jpg')).startsWith('data:image/jpeg;base64,'));
  check('photo: same-host redirect followed', (await photo('/uploads/same-host-redirect.jpg')).startsWith('data:image/jpeg;base64,'));
  const otherBefore = otherHostHits.length;
  check('photo: other-host redirect refused', (await photo('/uploads/other-host-redirect.jpg')).startsWith('ERR'));
  check('photo: other host never contacted', otherHostHits.length === otherBefore);
  check('photo: svg refused', (await photo('/uploads/page.svg')).startsWith('ERR'));
  check('photo: html refused', (await photo('/uploads/x.html')).startsWith('ERR'));
  check('photo: content-type parameters tolerated', (await photo('/uploads/fake.png')).startsWith('data:image/png;base64,'));
  check('photo: size cap enforced', (await photo('/uploads/huge.png', { maxBytes: 1024 })).includes('15 MB'));
  check('photo: default cap is 15 MB', MAX_IMAGE_BYTES === 15 * 1024 * 1024);
  check('photo: other host refused', (await fetchImageDataUrl('http://127.0.0.2:1/x.jpg', host, photoFetch, { requireHttps: false }).then(() => 'ok', () => 'ERR')) === 'ERR');
  check('photo: http refused by default', (await fetchImageDataUrl(`${baseUrl}/uploads/photo.jpg`, host, photoFetch).then(() => 'ok', () => 'ERR')) === 'ERR');
  check('photo: refused before device setup', (await fetchImageDataUrl(`${baseUrl}/uploads/photo.jpg`, null, photoFetch, { requireHttps: false }).then(() => 'ok', () => 'ERR')) === 'ERR');

  // Main-window navigation and IPC sender guard (electron/appUrl.ts).
  const prod = { indexFileUrl: 'file:///C:/Program%20Files/GTIS%20ID%20Print%20Station/resources/app.asar/dist/index.html' };
  const dev = { devUrl: 'http://127.0.0.1:5173', indexFileUrl: prod.indexFileUrl };
  check('guard: app page allowed', isAppUrl(prod.indexFileUrl, prod));
  check('guard: app page with #hash allowed', isAppUrl(`${prod.indexFileUrl}#x`, prod));
  check('guard: other local file refused', !isAppUrl('file:///C:/Users/staff/Downloads/evil.html', prod));
  check('guard: UNC file refused', !isAppUrl('file://evil-host/C:/Program%20Files/GTIS%20ID%20Print%20Station/resources/app.asar/dist/index.html', prod));
  check('guard: web page refused', !isAppUrl('https://portal.gtis.edu.ph/', prod));
  check('guard: card document scheme refused', !isAppUrl('gtis-print://job-1/card.html', prod));
  check('guard: data URL refused', !isAppUrl('data:text/html,<script>1</script>', prod));
  check('guard: dev server allowed in dev', isAppUrl('http://127.0.0.1:5173/src/main.tsx', dev));
  check('guard: other origin refused in dev', !isAppUrl('http://127.0.0.1:5174/', dev));
  check('guard: file refused in dev', !isAppUrl(prod.indexFileUrl, dev));

  // Portal URL validation used by device setup.
  const throws = (value: unknown) => {
    try {
      normalizePortalUrl(value);
      return false;
    } catch (error) {
      return error instanceof PortalRequestError;
    }
  };
  check('portal URL: https accepted and normalised', normalizePortalUrl(' https://portal.gtis.edu.ph/ ') === 'https://portal.gtis.edu.ph');
  check('portal URL: preportal accepted', normalizePortalUrl('https://preportal.gtis.edu.ph') === 'https://preportal.gtis.edu.ph');
  check('portal URL: allowlist is exactly the two GTIS hosts', PORTAL_HOST_ALLOWLIST.join(',') === 'portal.gtis.edu.ph,preportal.gtis.edu.ph');
  check('portal URL: other host refused', throws('https://evil.example'));
  check('portal URL: look-alike host refused', throws('https://portal.gtis.edu.ph.evil.example'));
  check('portal URL: port refused', throws('https://portal.gtis.edu.ph:8443'));
  check('portal URL: http rejected', throws('http://portal.gtis.edu.ph'));
  check('portal URL: credentials rejected', throws('https://user:pw@portal.gtis.edu.ph'));
  check('portal URL: query rejected', throws('https://portal.gtis.edu.ph/?x=1'));
  check('portal URL: garbage rejected', throws('portal'));

  portal.close();
  other.close();
  console.log(failures === 0 ? 'Portal bridge tests passed.' : `${failures} portal bridge test(s) failed.`);
  if (process.versions.electron) {
    const { app } = require('electron') as typeof import('electron');
    app.exit(failures === 0 ? 0 : 1);
    return;
  }
  process.exit(failures === 0 ? 0 : 1);
}

void main();
