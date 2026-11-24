import type { StudentRecord } from '../types';
import {
  emergencyAddressFontPx,
  emergencyNameFontPx,
  emergencyPhoneFontPx,
  frontFirstNameFontPx,
  frontGradeFontPx,
  frontLastNameFontPx,
  previewPxToPrintMm
} from './cardText';
import { ID_CARD_FONT_STACK } from './fonts';
import { cardLayers } from './layout';
import { studentFirstNameLine, studentGradeLine, studentIdentifierLines, studentLastNameLine } from './student';
import type { CSSProperties } from 'react';

function pos(style: CSSProperties) {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${value}`)
    .join(';');
}

function escapeHtml(value: string | undefined) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function lastNameFontMm(lastName: string) {
  return previewPxToPrintMm(frontLastNameFontPx(lastName));
}

function firstNameFontMm(firstName: string) {
  return previewPxToPrintMm(frontFirstNameFontPx(firstName));
}

function gradeFontMm(grade: string) {
  return previewPxToPrintMm(frontGradeFontPx(grade));
}

function emergencyNameFontMm(name: string) {
  return previewPxToPrintMm(emergencyNameFontPx(name));
}

function emergencyAddressFontMm(address: string) {
  return previewPxToPrintMm(emergencyAddressFontPx(address));
}

function emergencyPhoneFontMm(phone: string) {
  return previewPxToPrintMm(emergencyPhoneFontPx(phone));
}

type CardAssets = { front: string; back: string; idCardFontFaceCss?: string };

function cardParts(student: StudentRecord, qrDataUrl: string, assets: CardAssets) {
  const lastName = studentLastNameLine(student);
  const firstName = studentFirstNameLine(student);
  const gradeLine = studentGradeLine(student);
  const idLines = studentIdentifierLines(student)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('');

  const title = `<title>GTIS ID Card ${escapeHtml(student.admissionNo)}</title>`;
  const styles = `    ${assets.idCardFontFaceCss || ''}
    @page { size: 53.98mm 85.60mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
    .page { width: 53.98mm; height: 85.60mm; position: relative; overflow: hidden; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .page-content { position: absolute; inset: 0; width: 100%; height: 100%; }
    .rotate-180 { transform: rotate(180deg); transform-origin: center; }
    .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .layer { position: absolute; z-index: 2; }
    .photo { object-fit: cover; border-radius: 2.05mm; }
    .qr { background: #fff; }
    .last-name, .first-name, .grade, .ids, .emergency { font-family: ${ID_CARD_FONT_STACK}; font-weight: 700; }
    .last-name, .first-name, .ids { color: #00692e; }
    .last-name, .first-name, .grade { text-align: center; }
    .last-name { font-size: ${lastNameFontMm(lastName)}; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .first-name { font-size: ${firstNameFontMm(firstName)}; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .grade { color: #fff; font-size: ${gradeFontMm(gradeLine)}; line-height: 1.05; white-space: nowrap; display: flex; align-items: center; justify-content: center; padding: 0 .7mm; overflow: hidden; }
    .ids { font-size: 2.14mm; line-height: 1.04; white-space: nowrap; overflow: hidden; }
    .emergency { color: #063f23; display: grid; grid-template-rows: auto auto auto; gap: 1mm; align-content: center; justify-items: center; text-align: center; padding: 0 1.7mm; }
    .emergency-name { font-size: ${emergencyNameFontMm(student.guardian.name)}; line-height: 1; max-width: 100%; display: -webkit-box; overflow: hidden; overflow-wrap: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
    .emergency-address { font-size: ${emergencyAddressFontMm(student.guardian.address)}; line-height: 1.02; max-width: 100%; display: -webkit-box; overflow: hidden; overflow-wrap: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .emergency-phone { font-size: ${emergencyPhoneFontMm(student.guardian.phone)}; line-height: 1; }`;
  const front = `      <img class="bg" src="${assets.front}" />
      ${student.photoUrl ? `<img class="layer photo" style="${pos(cardLayers.photo)}" src="${student.photoUrl}" />` : ''}
      <img class="layer qr" style="${pos(cardLayers.qr)}" src="${qrDataUrl}" />
      <div class="layer last-name" style="${pos(cardLayers.lastName)}">${escapeHtml(lastName)}</div>
      <div class="layer first-name" style="${pos(cardLayers.firstName)}">${escapeHtml(firstName)}</div>
      <div class="layer grade" style="${pos(cardLayers.grade)}">${escapeHtml(gradeLine)}</div>
      ${idLines ? `<div class="layer ids" style="${pos(cardLayers.ids)}">${idLines}</div>` : ''}`;
  const back = `      <img class="bg" src="${assets.back}" />
      <div class="layer emergency" style="${pos(cardLayers.emergency)}">
        <div class="emergency-name">${escapeHtml(student.guardian.name)}</div>
        <div class="emergency-address">${escapeHtml(student.guardian.address)}</div>
        <div class="emergency-phone">${escapeHtml(student.guardian.phone)}</div>
      </div>`;

  return { title, styles, front, back };
}

/**
 * Print document for the card printer. The back is rotated 180 degrees on
 * purpose: the printer flips the card. This output must stay byte-identical
 * (see scripts/fixtures/print-html-*.html and npm run test:archive).
 */
export function renderPrintHtml(student: StudentRecord, qrDataUrl: string, assets: CardAssets) {
  const { title, styles, front, back } = cardParts(student, qrDataUrl, assets);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  ${title}
  <style>
${styles}
  </style>
</head>
<body>
  <section class="page">
    <div class="page-content">
${front}
    </div>
  </section>
  <section class="page">
    <div class="page-content rotate-180">
${back}
    </div>
  </section>
</body>
</html>`;
}

/**
 * Archive document for the portal's Documents upload. Both sides are upright
 * CR80 pages; the desktop app shows one side at a time (body[data-show]),
 * scales it with CSS zoom and captures it at 600 DPI. Never send this to the
 * printer.
 */
export function renderArchiveHtml(student: StudentRecord, qrDataUrl: string, assets: CardAssets) {
  const { title, styles, front, back } = cardParts(student, qrDataUrl, assets);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  ${title}
  <style>
${styles}
    html, body { overflow: hidden; }
    .archive-page { page-break-after: auto; }
    body[data-show="front"] .archive-page[data-side="back"],
    body[data-show="back"] .archive-page[data-side="front"] { display: none; }
  </style>
</head>
<body data-show="front">
  <section class="page archive-page" data-side="front">
    <div class="page-content">
${front}
    </div>
  </section>
  <section class="page archive-page" data-side="back">
    <div class="page-content">
${back}
    </div>
  </section>
</body>
</html>`;
}
