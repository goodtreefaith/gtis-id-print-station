import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

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

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

async function createPrintWindow(html: string) {
  const printWindow = new BrowserWindow({
    show: false,
    width: 640,
    height: 1024,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  await printWindow.webContents.executeJavaScript(
    'document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()'
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  return printWindow;
}

ipcMain.handle('printers:list', async () => {
  if (!mainWindow) {
    return [];
  }
  return mainWindow.webContents.getPrintersAsync();
});

ipcMain.handle(
  'card:print',
  async (_event, html: string, options: { deviceName?: string; silent?: boolean }) => {
    const printWindow = await createPrintWindow(html);

    try {
      return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        printWindow.webContents.print(
          {
            silent: Boolean(options.silent),
            deviceName: options.deviceName || undefined,
            printBackground: true,
            margins: { marginType: 'none' },
            pageSize: { width: 53980, height: 85600 }
          },
          (success, failureReason) => {
            if (success) {
              resolve({ ok: true });
            } else {
              resolve({ ok: false, error: failureReason || 'Print failed.' });
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
  const printWindow = await createPrintWindow(html);

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
      pageSize: { width: 53980, height: 85600 }
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
