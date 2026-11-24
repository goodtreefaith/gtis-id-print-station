import { BrowserWindow, protocol, screen } from 'electron';
import type { NativeImage } from 'electron';

// Card documents (print and archive) are served from a private scheme so the
// card HTML never has to be written to disk or loaded as a data: URL.
const CARD_SCHEME = 'gtis-print';
const pendingCardDocuments = new Map<string, string>();
let cardDocumentCounter = 0;

export const ARCHIVE_DPI = 600;
/** Must match ID_CARD_FONT_FACE in src/lib/fonts.ts. */
export const ID_CARD_FONT_FACE = 'GTIS Avenir Bold';
// ISO CR80 portrait card: 53.98 mm x 85.60 mm.
export const ARCHIVE_SIZE = {
  width: Math.round((53.98 / 25.4) * ARCHIVE_DPI),
  height: Math.round((85.6 / 25.4) * ARCHIVE_DPI)
};
// The portal accepts up to 8 MB per side. Stay clearly under it and fail
// loudly instead of silently downscaling the archive.
export const ARCHIVE_MAX_PNG_BYTES = 7.5 * 1024 * 1024;

/** Must run before app ready. */
export function registerCardDocumentScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: CARD_SCHEME, privileges: { standard: true, secure: true } }
  ]);
}

/** Must run after app ready. */
export function handleCardDocumentProtocol() {
  protocol.handle(CARD_SCHEME, (request) => {
    const url = new URL(request.url);
    const html = pendingCardDocuments.get(url.hostname);
    if (!html) {
      return new Response('Print job not found.', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
}

export async function loadCardDocument(window: BrowserWindow, html: string) {
  const jobId = `job-${++cardDocumentCounter}-${Date.now()}`;
  pendingCardDocuments.set(jobId, html);
  try {
    await window.loadURL(`${CARD_SCHEME}://${jobId}/card.html`);
  } finally {
    pendingCardDocuments.delete(jobId);
  }
}

export async function waitForCardAssets(window: BrowserWindow) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const images = Array.from(document.images || []);
      await Promise.all(images.map((image) => {
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ArchiveCapture {
  front: string;
  back: string;
  dpi: number;
  width: number;
  height: number;
  frontBytes: number;
  backBytes: number;
}

/**
 * Renders the upright archive document (see renderArchiveHtml) one side at a
 * time in an offscreen window whose content is exactly one CR80 card at 600
 * DPI. An offscreen window has no native window for the OS to clamp to the
 * screen (checked by test:archive on macOS and windows-latest).
 *
 * Scaling uses CSS zoom on the card, not browser zoom: Chromium caps browser
 * zoom at 5x, and 600 DPI needs 6.25x at 100% display scale. The device pixel
 * ratio is read from the page (browser zoom 1) rather than assumed from the
 * display, and the rendered card must measure 1275x2022 device pixels.
 */
export async function captureArchivePngs(
  html: string,
  log: (message: string, details?: unknown) => void = () => undefined
): Promise<ArchiveCapture> {
  const displayScaleFactor = screen.getPrimaryDisplay().scaleFactor || 1;
  const window = new BrowserWindow({
    show: false,
    width: Math.ceil(ARCHIVE_SIZE.width / displayScaleFactor),
    height: Math.ceil(ARCHIVE_SIZE.height / displayScaleFactor),
    useContentSize: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      offscreen: true,
      zoomFactor: 1,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: true
    }
  });

  try {
    window.webContents.setFrameRate(30);
    await loadCardDocument(window, html);
    window.webContents.setZoomFactor(1);
    const scaleFactor = Number(await window.webContents.executeJavaScript('window.devicePixelRatio')) || displayScaleFactor;
    const cssZoom = ARCHIVE_DPI / (96 * scaleFactor);
    window.setContentSize(Math.ceil(ARCHIVE_SIZE.width / scaleFactor), Math.ceil(ARCHIVE_SIZE.height / scaleFactor));
    await window.webContents.insertCSS(`.archive-page { zoom: ${cssZoom}; }`);
    log('Archive capture: scale.', { displayScaleFactor, scaleFactor, cssZoom });
    const assets = await waitForCardAssets(window);
    if (assets.failedImages.length > 0) {
      log('Archive capture: some card images failed to load.', { failed: assets.failedImages.length });
      throw new Error('An ID card image did not load, so the archive copy was not captured. Nothing was uploaded.');
    }

    // The ID card font (src/lib/fonts.ts, ID_CARD_FONT_FACE) is optional: the
    // repo ships no font file, and then the archive uses the fallback stack
    // like the printed card. If the font WAS supplied and fails to load, the
    // archive would not match the printed card, so stop.
    const fontState = await window.webContents.executeJavaScript(`
      (async () => {
        const family = ${JSON.stringify(ID_CARD_FONT_FACE)};
        const faces = Array.from(document.fonts || []).filter((face) => face.family.replace(/["']/g, '') === family);
        if (faces.length === 0) {
          return 'absent';
        }
        try {
          await document.fonts.load('700 12px "' + family + '"');
        } catch (error) {
          // status checked below
        }
        return faces.every((face) => face.status === 'loaded') ? 'loaded' : 'failed';
      })()
    `);
    if (fontState === 'failed') {
      log('Archive capture: ID card font failed to load.');
      throw new Error('The ID card font did not load, so the archive copy was not captured. Nothing was uploaded.');
    }
    if (fontState === 'absent') {
      log('Archive capture: optional ID card font not installed; using the fallback font like the printed card.');
    }

    const sides = await window.webContents.executeJavaScript(`
      Array.from(document.querySelectorAll('.archive-page')).map((page) => page.getAttribute('data-side'))
    `);
    if (!Array.isArray(sides) || sides.join(',') !== 'front,back') {
      throw new Error('The archive copy needs the upright archive layout. Nothing was uploaded.');
    }

    const result: Partial<ArchiveCapture> = { dpi: ARCHIVE_DPI };
    const bitmaps: NativeImage[] = [];
    for (const side of ['front', 'back'] as const) {
      // Show one side, wait for two animation frames (layout and paint), then
      // force a fresh offscreen frame so the capture cannot be the old side.
      await window.webContents.executeJavaScript(`
        new Promise((resolve) => {
          document.body.setAttribute('data-show', ${JSON.stringify(side)});
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
        })
      `);
      window.webContents.invalidate();
      await delay(250);
      const check = await window.webContents.executeJavaScript(`
        (() => {
          const page = document.querySelector('.archive-page[data-side=${JSON.stringify(side)}]');
          const rect = page ? page.getBoundingClientRect() : null;
          const ratio = window.devicePixelRatio;
          return {
            x: rect ? rect.x : -1,
            y: rect ? rect.y : -1,
            deviceWidth: rect ? rect.width * ratio : 0,
            deviceHeight: rect ? rect.height * ratio : 0,
            viewportWidth: window.innerWidth * ratio,
            viewportHeight: window.innerHeight * ratio,
            ratio
          };
        })()
      `);
      const fits =
        check.x === 0 &&
        check.y === 0 &&
        Math.abs(check.deviceWidth - ARCHIVE_SIZE.width) <= 1 &&
        Math.abs(check.deviceHeight - ARCHIVE_SIZE.height) <= 1 &&
        check.viewportWidth >= ARCHIVE_SIZE.width - 1 &&
        check.viewportHeight >= ARCHIVE_SIZE.height - 1;
      if (!fits) {
        log('Archive capture: card side is not one 600 DPI card filling the window.', { side, check });
        throw new Error('The ID card archive could not be rendered at 600 DPI. Nothing was uploaded.');
      }

      let image = await window.webContents.capturePage();
      let size = image.getSize();
      log('Archive capture: raw side size.', { side, size });
      if (
        size.width < ARCHIVE_SIZE.width ||
        size.height < ARCHIVE_SIZE.height ||
        size.width > ARCHIVE_SIZE.width + 2 ||
        size.height > ARCHIVE_SIZE.height + 2
      ) {
        throw new Error(
          `The ID card archive was captured at ${size.width}x${size.height} instead of ${ARCHIVE_SIZE.width}x${ARCHIVE_SIZE.height}. Nothing was uploaded.`
        );
      }
      if (size.width !== ARCHIVE_SIZE.width || size.height !== ARCHIVE_SIZE.height) {
        // Rounding a fractional window size can add one device pixel of the
        // same full-bleed page; trim it rather than rescale.
        image = image.crop({ x: 0, y: 0, width: ARCHIVE_SIZE.width, height: ARCHIVE_SIZE.height });
        size = image.getSize();
      }

      bitmaps.push(image);
      const png = image.toPNG();
      if (png.length > ARCHIVE_MAX_PNG_BYTES) {
        throw new Error(
          `The ${side} ID card image is ${(png.length / 1024 / 1024).toFixed(1)} MB, over the 7.5 MB upload limit. Nothing was uploaded.`
        );
      }

      result[side] = `data:image/png;base64,${png.toString('base64')}`;
      result[side === 'front' ? 'frontBytes' : 'backBytes'] = png.length;
      result.width = size.width;
      result.height = size.height;
    }

    if (bitmaps.length === 2 && bitmaps[0].toBitmap().equals(bitmaps[1].toBitmap())) {
      throw new Error('The ID card archive front and back came out identical. Nothing was uploaded.');
    }

    return result as ArchiveCapture;
  } finally {
    window.destroy();
  }
}
