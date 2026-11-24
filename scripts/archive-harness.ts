// Electron main-process harness for `npm run test:archive`.
// It renders a mock student through the production archive capture
// (electron/cardCapture.ts) and checks the resulting PNGs. No network, no
// portal, no device token.
import { app, nativeImage, screen } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import {
  ARCHIVE_SIZE,
  captureArchivePngs,
  handleCardDocumentProtocol,
  registerCardDocumentScheme
} from '../electron/cardCapture';
import { renderArchiveHtml, renderPrintHtml } from '../src/lib/printHtml';
import { mockStudents } from '../src/data/mockStudents';
import { PRINT_HTML_ASSETS, PRINT_HTML_CASES, PRINT_HTML_QR } from './printHtmlCases';

const repoRoot = process.env.ARCHIVE_REPO_ROOT || process.cwd();
const outDir = process.env.ARCHIVE_OUT_DIR || path.join(repoRoot, 'archive-test-output');
const label = process.env.ARCHIVE_LABEL || 'default';
const MIN_BYTES = 300 * 1024;

registerCardDocumentScheme();

function dataUrl(filePath: string, mime: string) {
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
}

function optionalFontCss() {
  const fonts: Array<[string, string, string]> = [
    ['Avenir-Bold.woff2', 'font/woff2', 'woff2'],
    ['Avenir-Bold.otf', 'font/otf', 'opentype'],
    ['Avenir-Bold.ttf', 'font/ttf', 'truetype']
  ];
  for (const [file, mime, format] of fonts) {
    const fontPath = path.join(repoRoot, 'public/fonts', file);
    if (existsSync(fontPath)) {
      return `@font-face { font-family: "GTIS Avenir Bold"; src: url("${dataUrl(fontPath, mime)}") format("${format}"); font-style: normal; font-weight: 700; }`;
    }
  }
  return '';
}

// A photo-like 860x996 JPEG, the size the app's photo editor saves. Seeded
// noise over a gradient so the archive PNG size resembles a real photo.
function photoFixture() {
  const width = 860;
  const height = 996;
  const bitmap = Buffer.alloc(width * height * 4);
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const dx = (x - width / 2) / (width / 2);
      const dy = (y - height * 0.4) / (height / 2);
      const face = dx * dx + dy * dy < 0.35 ? 1 : 0;
      const noise = (rand() - 0.5) * 60;
      bitmap[i] = Math.max(0, Math.min(255, (face ? 150 : 90 + y / 8) + noise)); // B
      bitmap[i + 1] = Math.max(0, Math.min(255, (face ? 180 : 120 + x / 10) + noise)); // G
      bitmap[i + 2] = Math.max(0, Math.min(255, (face ? 225 : 140) + noise)); // R
      bitmap[i + 3] = 255;
    }
  }
  const jpeg = nativeImage.createFromBitmap(bitmap, { width, height }).toJPEG(94);
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

function luminance(bitmap: Buffer, width: number, x0: number, y0: number, x1: number, y1: number) {
  let total = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4; // BGRA
      total += 0.0722 * bitmap[i] + 0.7152 * bitmap[i + 1] + 0.2126 * bitmap[i + 2];
      count += 1;
    }
  }
  return total / count;
}

function nonWhiteShare(bitmap: Buffer, width: number, points: Array<[number, number]>) {
  let nonWhite = 0;
  for (const [x, y] of points) {
    const i = (y * width + x) * 4;
    if (bitmap[i] < 240 || bitmap[i + 1] < 240 || bitmap[i + 2] < 240) {
      nonWhite += 1;
    }
  }
  return nonWhite / points.length;
}

// "No white margin": the back's green artwork must reach the card edges.
// The Canva back template itself has a white hairline (measured by
// rasterising back.canva.svg alone at 1275x2022: 6 px at the top, 3 px at
// the right, 0-1 px at the left), so the samples sit just past it. Any extra
// margin from a mis-sized capture fails.
const ART_HAIRLINE = { top: 6, left: 1, right: 3 };
function edgeReport(bitmap: Buffer, width: number, height: number) {
  const rowPoints = (y: number) => Array.from({ length: width }, (_, x) => [x, y] as [number, number]);
  const colPoints = (x: number, y0: number, y1: number) =>
    Array.from({ length: y1 - y0 }, (_, i) => [x, y0 + i] as [number, number]);
  return {
    top: nonWhiteShare(bitmap, width, rowPoints(ART_HAIRLINE.top + 1)),
    left: nonWhiteShare(bitmap, width, colPoints(ART_HAIRLINE.left + 1, Math.round(height * 0.05), Math.round(height * 0.8))),
    right: nonWhiteShare(bitmap, width, colPoints(width - 1 - (ART_HAIRLINE.right + 1), Math.round(height * 0.05), Math.round(height * 0.8))),
    // Bottom band is white by design except the green "Expires" box (right).
    bottomRight: nonWhiteShare(bitmap, width, colPoints(width - 1 - (ART_HAIRLINE.right + 1), Math.round(height * 0.88), Math.round(height * 0.95)))
  };
}

async function run() {
  const failures: string[] = [];
  const work = screen.getPrimaryDisplay().workAreaSize;
  const report: Record<string, unknown> = {
    label,
    screen: `${work.width}x${work.height}`,
    // The capture is 2022 device px tall; record whether that exceeds the screen.
    taller: Math.ceil(ARCHIVE_SIZE.height / (screen.getPrimaryDisplay().scaleFactor || 1)) > work.height
  };

  // 1. The print HTML must stay byte-identical to the recorded fixtures.
  for (const testCase of PRINT_HTML_CASES) {
    const expected = readFileSync(path.join(repoRoot, `scripts/fixtures/print-html-${testCase.name}.html`), 'utf8');
    const actual = renderPrintHtml(testCase.student, PRINT_HTML_QR, PRINT_HTML_ASSETS);
    if (actual !== expected) {
      failures.push(`Print HTML changed for case "${testCase.name}". The printer needs the original markup.`);
    }
  }
  const printSample = renderPrintHtml(PRINT_HTML_CASES[0].student, PRINT_HTML_QR, PRINT_HTML_ASSETS);
  if (!printSample.includes('<div class="page-content rotate-180">')) {
    failures.push('Print HTML no longer rotates the back 180 degrees.');
  }
  const archiveSample = renderArchiveHtml(PRINT_HTML_CASES[0].student, PRINT_HTML_QR, PRINT_HTML_ASSETS);
  if (archiveSample.includes('rotate-180"')) {
    failures.push('Archive HTML rotates a side.');
  }

  // 2. Capture the archive through the production code path.
  const student = { ...mockStudents[0], photoUrl: photoFixture() };
  const qr = await QRCode.toDataURL(student.admissionNo, { errorCorrectionLevel: 'M', margin: 1, scale: 10 });
  const templates = path.join(repoRoot, 'public/templates/2026-2027');
  const html = renderArchiveHtml(student, qr, {
    front: dataUrl(path.join(templates, 'front.clean-2026.svg'), 'image/svg+xml'),
    back: dataUrl(path.join(templates, 'back.canva.svg'), 'image/svg+xml'),
    idCardFontFaceCss: optionalFontCss()
  });

  const capture = await captureArchivePngs(html, (message, details) =>
    console.error(`[harness ${label}] ${message} ${details ? JSON.stringify(details) : ''}`)
  );

  mkdirSync(outDir, { recursive: true });
  const sides: Record<string, { width: number; height: number; bytes: number; bitmap: Buffer }> = {};
  for (const side of ['front', 'back'] as const) {
    const image = nativeImage.createFromDataURL(capture[side]);
    const png = Buffer.from(capture[side].split(',')[1], 'base64');
    writeFileSync(path.join(outDir, `${label}-${side}.png`), png);
    const { width, height } = image.getSize();
    sides[side] = { width, height, bytes: png.length, bitmap: image.toBitmap() };
    report[side] = { width, height, kb: Math.round(png.length / 1024) };

    if (width !== ARCHIVE_SIZE.width || height !== ARCHIVE_SIZE.height) {
      failures.push(`${side} is ${width}x${height}, expected ${ARCHIVE_SIZE.width}x${ARCHIVE_SIZE.height}.`);
    }
    if (png.length < MIN_BYTES) {
      failures.push(`${side} is only ${Math.round(png.length / 1024)} KB (expected over 300 KB).`);
    }
    if (png.subarray(1, 4).toString('ascii') !== 'PNG') {
      failures.push(`${side} is not a PNG.`);
    }
  }

  const backEdges = edgeReport(sides.back.bitmap, sides.back.width, sides.back.height);
  report.backEdges = backEdges;
  for (const [edge, share] of Object.entries(backEdges)) {
    if (share < 0.9) {
      failures.push(`Back artwork does not reach the ${edge} edge (white margin).`);
    }
  }

  if (sides.front.bitmap.equals(sides.back.bitmap)) {
    failures.push('Front and back images are identical.');
  }

  // 3. The back must be upright: green header at the top, the white
  // signature band at the bottom (see public/templates/2026-2027/back.reference.png).
  const back = sides.back;
  const w = back.width;
  const h = back.height;
  const top = luminance(back.bitmap, w, Math.round(w * 0.05), Math.round(h * 0.02), Math.round(w * 0.45), Math.round(h * 0.08));
  const bottom = luminance(back.bitmap, w, Math.round(w * 0.05), Math.round(h * 0.9), Math.round(w * 0.45), Math.round(h * 0.97));
  report.backTopLuminance = Math.round(top);
  report.backBottomLuminance = Math.round(bottom);
  if (!(bottom > 200 && top < 140)) {
    failures.push(`Back does not look upright (top luminance ${Math.round(top)}, bottom ${Math.round(bottom)}).`);
  }

  report.failures = failures;
  console.log(`ARCHIVE_REPORT ${JSON.stringify(report)}`);
  return failures.length === 0;
}

app.whenReady().then(async () => {
  handleCardDocumentProtocol();
  let ok = false;
  try {
    ok = await run();
  } catch (error) {
    console.log(`ARCHIVE_REPORT ${JSON.stringify({ label, screen: 'n/a', failures: [error instanceof Error ? error.message : String(error)] })}`);
  }
  app.exit(ok ? 0 : 1);
});
