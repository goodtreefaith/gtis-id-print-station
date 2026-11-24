import { app, BrowserWindow, dialog, ipcMain, net } from 'electron';
import type { IpcMainInvokeEvent, WebContentsPrintOptions } from 'electron';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAppUrl } from './appUrl.js';
import { fetchImageDataUrl } from './imageFetch.js';
import { netFetchManualRedirect } from './netManualFetch.js';
import {
  captureArchivePngs,
  handleCardDocumentProtocol,
  loadCardDocument,
  registerCardDocumentScheme,
  waitForCardAssets
} from './cardCapture.js';
import {
  clearDeviceConfig,
  deviceStatus,
  loadDeviceConnection,
  MIN_TOKEN_LENGTH,
  saveDeviceConfig
} from './deviceConfig.js';
import type { FetchLike } from './portalRequest.js';
import {
  checkDeviceToken,
  normalizePortalUrl,
  PORTAL_HOST_ALLOWLIST,
  portalRequest,
  PortalRequestError
} from './portalRequest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const CR80_PAGE_SIZE = { width: 53980, height: 85600 };
// Portal calls use Chromium's network stack (system proxy and Windows
// certificate store), like the renderer's fetch did before.
const netFetch: FetchLike = (input, init) => net.fetch(input, init);

registerCardDocumentScheme();

/**
 * Allowed portal hosts. GTIS_IDPRINT_DEV_PORTAL_HOSTS (comma-separated) is
 * read at runtime and only honoured in an unpackaged dev run, so it cannot
 * widen a release build.
 */
function allowedPortalHosts(): readonly string[] {
  const extra = app.isPackaged ? '' : process.env.GTIS_IDPRINT_DEV_PORTAL_HOSTS || '';
  const hosts = extra
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return [...PORTAL_HOST_ALLOWLIST, ...hosts];
}

function appLocation() {
  return {
    devUrl: process.env.VITE_DEV_SERVER_URL || undefined,
    indexFileUrl: pathToFileURL(path.join(__dirname, '../dist/index.html')).toString()
  };
}

function logDiagnostic(message: string, details?: unknown) {
  const detailText = details === undefined ? '' : ` ${JSON.stringify(details)}`;
  const line = `[${new Date().toISOString()}] ${message}${detailText}`;
  console.error(line);

  if (app.isReady()) {
    void appendFile(path.join(app.getPath('userData'), 'diagnostics.log'), `${line}\n`).catch(() => undefined);
  }
}

function publicAssetRoot() {
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(app.getAppPath(), 'public');
  }

  return path.join(__dirname, '../dist');
}

function resolvePublicAsset(assetPath: string) {
  if (typeof assetPath !== 'string' || assetPath.trim() === '') {
    throw new Error('Asset path is required.');
  }

  const normalizedPath = assetPath.replace(/^[/\\]+/, '');
  const root = path.resolve(publicAssetRoot());
  const resolved = path.resolve(root, normalizedPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Asset path is outside the bundled app assets.');
  }

  return resolved;
}

function mimeTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.css': 'text/css',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    title: 'GTIS ID Print Station',
    backgroundColor: '#f6f6f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // The main window holds the privileged bridge: never let it leave the app.
  const blockForeignNavigation = (event: Electron.Event, url: string) => {
    if (!isAppUrl(url, appLocation())) {
      event.preventDefault();
      logDiagnostic('Blocked main window navigation.', { url: url.slice(0, 200) });
    }
  };
  mainWindow.webContents.on('will-navigate', blockForeignNavigation);
  mainWindow.webContents.on('will-redirect', blockForeignNavigation);
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logDiagnostic('Renderer load failed.', { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logDiagnostic('Renderer process ended.', details);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      logDiagnostic('Renderer console message.', { level, message, line, sourceId });
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const loadPromise = devUrl
    ? mainWindow.loadURL(devUrl)
    : mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  void loadPromise.catch((error) => {
    logDiagnostic('Main window failed to load.', { message: error instanceof Error ? error.message : String(error) });
  });

  if (process.env.GTIS_ID_PRINT_DEBUG === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

async function verifyPrintRender(printWindow: BrowserWindow) {
  return printWindow.webContents.executeJavaScript(`
    (() => {
      const pages = Array.from(document.querySelectorAll('.page'));
      const firstPage = pages[0];
      const bodyText = (document.body?.innerText || '').trim();
      const bodyStart = bodyText.slice(0, 160);
      const styleSheetCount = document.styleSheets ? document.styleSheets.length : 0;
      const pagePosition = firstPage ? window.getComputedStyle(firstPage).position : '';
      const pageWidth = firstPage ? window.getComputedStyle(firstPage).width : '';
      const rawCssVisible = /^(GTIS ID Card\\s+\\S+\\s+)?(@page|\\*\\s*\\{|html\\s*,\\s*body\\s*\\{|\\.page\\s*\\{)/i.test(bodyStart);
      const ok = pages.length === 2 && styleSheetCount > 0 && pagePosition === 'relative' && !rawCssVisible;

      return {
        ok,
        pages: pages.length,
        styleSheetCount,
        pagePosition,
        pageWidth,
        rawCssVisible,
        bodyStart
      };
    })()
  `);
}

async function createPrintWindow(html: string, options: { visible?: boolean } = {}) {
  const visible = Boolean(options.visible);
  const printWindow = new BrowserWindow({
    show: false,
    width: visible ? 520 : 640,
    height: visible ? 820 : 1024,
    title: visible ? 'GTIS ID Print Station - Print Preview' : 'GTIS ID Print Station',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  try {
    await loadCardDocument(printWindow, html);
    const assets = await waitForCardAssets(printWindow);
    const renderCheck = await verifyPrintRender(printWindow);
    if (!renderCheck.ok) {
      logDiagnostic('Print render sanity check failed.', renderCheck);
      throw new Error('Print preview did not render as a styled ID card. Nothing was sent to the printer.');
    }
    await delay(250);

    if (visible) {
      printWindow.show();
      printWindow.focus();
      if (process.platform === 'darwin') {
        app.focus({ steal: true });
      }
      await delay(300);
    }

    return { printWindow, assets, renderCheck };
  } catch (error) {
    printWindow.destroy();
    throw error;
  }
}

async function captureCardPngs(html: string) {
  if (typeof html !== 'string' || html === '') {
    throw new Error('Archive HTML is required.');
  }
  const capture = await captureArchivePngs(html, logDiagnostic);
  logDiagnostic('ID card archive captured.', {
    width: capture.width,
    height: capture.height,
    frontBytes: capture.frontBytes,
    backBytes: capture.backBytes
  });
  return { front: capture.front, back: capture.back, dpi: capture.dpi };
}

/**
 * IPC is accepted only from the main window's top frame while it shows the
 * app's own page. Print and capture windows have no preload, and a page the
 * window was somehow navigated to would fail the URL check.
 */
function assertMainWindowSender(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame;
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    !frame ||
    frame !== mainWindow.webContents.mainFrame ||
    !isAppUrl(frame.url, appLocation())
  ) {
    throw new Error('This request is only allowed from the ID print station window.');
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

ipcMain.handle('device:status', async (event) => {
  assertMainWindowSender(event);
  return deviceStatus(allowedPortalHosts());
});

ipcMain.handle('device:configure', async (event, input: unknown) => {
  assertMainWindowSender(event);
  const raw = (input && typeof input === 'object' ? input : {}) as { portalUrl?: unknown; token?: unknown };
  let portalUrl: string;
  try {
    portalUrl = normalizePortalUrl(raw.portalUrl, allowedPortalHosts());
  } catch (error) {
    throw new Error(error instanceof PortalRequestError ? error.message : 'The portal address is not valid.');
  }
  const token = typeof raw.token === 'string' ? raw.token.trim() : '';
  if (token.length < MIN_TOKEN_LENGTH || /\s/.test(token) || !/^[\x21-\x7e]+$/.test(token)) {
    throw new Error(`The device token must be at least ${MIN_TOKEN_LENGTH} characters with no spaces.`);
  }

  const current = await deviceStatus(allowedPortalHosts());
  if (!current.encryptionAvailable) {
    throw new Error(
      'This computer cannot encrypt the device token (Windows data protection or the system keychain is unavailable). The token was not saved.'
    );
  }

  const { check, status } = await checkDeviceToken({ baseUrl: portalUrl, token }, netFetch);
  logDiagnostic('Device setup token check.', { portalUrl, check, status });
  if (check !== 'accepted') {
    // Only a token the portal accepted is ever saved; keep the old setup.
    return { ...current, check };
  }

  await saveDeviceConfig(portalUrl, token);
  logDiagnostic('Device setup saved.', { portalUrl, check });
  return { ...(await deviceStatus(allowedPortalHosts())), check };
});

ipcMain.handle('device:clear', async (event) => {
  assertMainWindowSender(event);
  await clearDeviceConfig();
  logDiagnostic('Device setup cleared.');
  return deviceStatus(allowedPortalHosts());
});

ipcMain.handle('portal:request', async (event, request: unknown) => {
  assertMainWindowSender(event);
  const connection = await loadDeviceConnection(allowedPortalHosts(), (message) => logDiagnostic(message));
  if (!connection) {
    return {
      ok: false,
      status: 0,
      payload: { status: false, message: 'This station is not set up for the portal yet. Run device setup first.' }
    };
  }
  try {
    const result = await portalRequest(connection, request, netFetch);
    if (!result.ok) {
      const path = request && typeof request === 'object' ? String((request as { path?: unknown }).path || '').split('?')[0] : '';
      logDiagnostic('Portal request failed.', { path, status: result.status });
    }
    return result;
  } catch (error) {
    return { ok: false, status: 0, payload: { status: false, message: errorMessage(error, 'Portal request failed.') } };
  }
});

ipcMain.handle('asset:readDataUrl', async (event, assetPath: string) => {
  assertMainWindowSender(event);
  const filePath = resolvePublicAsset(assetPath);
  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  return `data:${mimeTypeFor(filePath)};base64,${buffer.toString('base64')}`;
});

function registerPrinterHandlers() {
  ipcMain.handle('printers:list', async (event) => {
    assertMainWindowSender(event);
    if (!mainWindow) {
      return [];
    }
    return mainWindow.webContents.getPrintersAsync();
  });
}

registerPrinterHandlers();

ipcMain.handle(
  'card:print',
  async (event, html: string, options: { deviceName?: string; silent?: boolean }) => {
    assertMainWindowSender(event);
    const silent = Boolean(options.silent);
    const mode = silent ? 'silent' : 'dialog';
    const printerName = options.deviceName || 'System default';
    const printOptions: WebContentsPrintOptions = {
      silent,
      printBackground: true
    };

    if (options.deviceName) {
      printOptions.deviceName = options.deviceName;
    }

    if (silent) {
      printOptions.margins = { marginType: 'none' };
      printOptions.pageSize = CR80_PAGE_SIZE;
    }

    let printWindow: BrowserWindow | null = null;

    try {
      const printContext = await createPrintWindow(html, { visible: !silent });
      printWindow = printContext.printWindow;
      const readyPrintWindow = printContext.printWindow;
      logDiagnostic('Print attempt started.', {
        mode,
        printerName,
        pageSize: silent ? CR80_PAGE_SIZE : 'driver-default',
        margins: silent ? 'none' : 'driver-default',
        assets: printContext.assets,
        renderCheck: printContext.renderCheck
      });

      return await new Promise<{
        ok: boolean;
        error?: string;
        canceled?: boolean;
        mode: string;
        printerName: string;
        failureReason?: string;
      }>((resolve) => {
        readyPrintWindow.webContents.print(
          printOptions,
          (success, failureReason) => {
            const canceled = /cancel/i.test(failureReason || '');
            logDiagnostic('Print attempt finished.', {
              mode,
              printerName,
              success,
              failureReason: failureReason || ''
            });

            if (success) {
              resolve({ ok: true, mode, printerName });
            } else {
              resolve({
                ok: false,
                canceled,
                mode,
                printerName,
                failureReason: failureReason || '',
                error: canceled ? 'Print canceled.' : failureReason || 'Print failed.'
              });
            }
          }
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logDiagnostic('Print attempt stopped before printer handoff.', {
        mode,
        printerName,
        error: message
      });
      return { ok: false, mode, printerName, error: message || 'Print failed before the printer dialog opened.' };
    } finally {
      printWindow?.destroy();
    }
  }
);

ipcMain.handle('card:savePdf', async (event, html: string) => {
  assertMainWindowSender(event);
  const { printWindow } = await createPrintWindow(html);

  try {
    const result = await dialog.showSaveDialog({
      title: 'Save CR80 ID Card PDF',
      defaultPath: 'gtis-student-id-card.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }

    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize: CR80_PAGE_SIZE
    });

    await writeFile(result.filePath, pdf);
    return { ok: true, filePath: result.filePath };
  } finally {
    printWindow.destroy();
  }
});

ipcMain.handle('card:capturePngs', async (event, html: string) => {
  assertMainWindowSender(event);
  return captureCardPngs(html);
});

ipcMain.handle('image:fetchDataUrl', async (event, url: string) => {
  assertMainWindowSender(event);
  // Photos come from the configured portal's own host (the portal builds
  // photo_url from its base URL and returns the original upload, not a
  // thumbnail). The bytes are embedded as-is so the 600 DPI archive keeps
  // full detail.
  const status = await deviceStatus(allowedPortalHosts());
  const allowedHost = status.configured ? new URL(status.portalUrl).host : null;
  return fetchImageDataUrl(url, allowedHost, netFetchManualRedirect);
});

app.whenReady().then(() => {
  handleCardDocumentProtocol();

  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
