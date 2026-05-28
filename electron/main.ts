import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { WebContentsPrintOptions } from 'electron';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
const CR80_PAGE_SIZE = { width: 53980, height: 85600 };

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

async function waitForPrintAssets(printWindow: BrowserWindow) {
  return printWindow.webContents.executeJavaScript(`
    (async () => {
      const images = Array.from(document.images || []);
      await Promise.all(images.map((image) => {
        if (image.complete && image.naturalWidth > 0) {
          return Promise.resolve();
        }
        if (image.complete) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }));

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      return {
        imageCount: images.length,
        failedImages: images
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.currentSrc || image.src || '')
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

  await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  const assets = await waitForPrintAssets(printWindow);
  await delay(250);

  if (visible) {
    printWindow.show();
    printWindow.focus();
    if (process.platform === 'darwin') {
      app.focus({ steal: true });
    }
    await delay(300);
  }

  return { printWindow, assets };
}

ipcMain.handle('asset:readDataUrl', async (_event, assetPath: string) => {
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
  ipcMain.handle('printers:list', async () => {
    if (!mainWindow) {
      return [];
    }
    return mainWindow.webContents.getPrintersAsync();
  });
}

registerPrinterHandlers();

ipcMain.handle(
  'card:print',
  async (_event, html: string, options: { deviceName?: string; silent?: boolean }) => {
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

    const { printWindow, assets } = await createPrintWindow(html, { visible: !silent });
    logDiagnostic('Print attempt started.', {
      mode,
      printerName,
      pageSize: silent ? CR80_PAGE_SIZE : 'driver-default',
      margins: silent ? 'none' : 'driver-default',
      assets
    });

    try {
      return await new Promise<{
        ok: boolean;
        error?: string;
        canceled?: boolean;
        mode: string;
        printerName: string;
        failureReason?: string;
      }>((resolve) => {
        printWindow.webContents.print(
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
    } finally {
      printWindow.destroy();
    }
  }
);

ipcMain.handle('card:savePdf', async (_event, html: string) => {
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

ipcMain.handle('image:fetchDataUrl', async (_event, url: string) => {
  const image = await downloadImage(url);
  if (!image.ok) {
    throw new Error(`Image fetch failed: ${image.status}`);
  }

  const contentType = image.contentType.split(';')[0] || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    throw new Error('Fetched file is not an image.');
  }

  return `data:${contentType};base64,${image.buffer.toString('base64')}`;
});

interface ImageDownload {
  ok: boolean;
  status: number;
  contentType: string;
  buffer: Buffer;
}

function downloadImage(url: string, redirectCount = 0): Promise<ImageDownload> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = parsed.protocol === 'http:' ? httpRequest : httpsRequest;
    const req = request(
      parsed,
      {
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': 'GTIS-ID-Print-Station'
        }
      },
      (response) => {
        const status = response.statusCode || 0;
        const location = response.headers.location;

        if (status >= 300 && status < 400 && location && redirectCount < 5) {
          response.resume();
          resolve(downloadImage(new URL(location, url).toString(), redirectCount + 1));
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          resolve({
            ok: false,
            status,
            contentType: String(response.headers['content-type'] || ''),
            buffer: Buffer.alloc(0)
          });
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () => {
          resolve({
            ok: true,
            status,
            contentType: String(response.headers['content-type'] || 'image/jpeg'),
            buffer: Buffer.concat(chunks)
          });
        });
      }
    );

    req.setTimeout(15000, () => {
      req.destroy(new Error('Image fetch timed out.'));
    });
    req.on('error', reject);
    req.end();
  });
}

app.whenReady().then(createMainWindow);

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
