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
import { studentFirstNameLine, studentGradeLine, studentLastNameLine } from './student';
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

export function renderPrintHtml(
  student: StudentRecord,
  qrDataUrl: string,
  assets: { front: string; back: string; idCardFontFaceCss?: string }
) {
  const lastName = studentLastNameLine(student);
  const firstName = studentFirstNameLine(student);
  const gradeLine = studentGradeLine(student);
  const idLines = [student.lrn ? `LRN: ${student.lrn}` : '', student.esc ? `ESC: ${student.esc}` : '']
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GTIS ID Card ${escapeHtml(student.admissionNo)}</title>
  <style>
    ${assets.idCardFontFaceCss || ''}
    @page { size: 53.98mm 85.60mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
    .page { width: 53.98mm; height: 85.60mm; position: relative; overflow: hidden; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .layer { position: absolute; z-index: 2; }
    .photo { object-fit: cover; border-radius: 2.05mm; }
    .qr { background: #fff; }
    .student-no, .last-name, .first-name, .grade, .ids, .emergency { font-family: ${ID_CARD_FONT_STACK}; font-weight: 700; }
    .student-no, .last-name, .first-name, .ids { color: #00692e; }
    .student-no, .last-name, .first-name, .grade { text-align: center; }
    .student-no { font-size: 2.5mm; line-height: 1; white-space: nowrap; }
    .last-name { font-size: ${lastNameFontMm(lastName)}; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .first-name { font-size: ${firstNameFontMm(firstName)}; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .grade { color: #fff; font-size: ${gradeFontMm(gradeLine)}; line-height: 1.05; white-space: nowrap; display: flex; align-items: center; justify-content: center; padding: 0 .7mm; overflow: hidden; }
    .ids { font-size: 2.2mm; line-height: 1.04; white-space: nowrap; overflow: hidden; }
    .emergency { color: #063f23; display: grid; grid-template-rows: auto auto auto; gap: 1mm; align-content: center; justify-items: center; text-align: center; padding: 0 1.7mm; }
    .emergency-name { font-size: ${emergencyNameFontMm(student.guardian.name)}; line-height: 1; max-width: 100%; display: -webkit-box; overflow: hidden; overflow-wrap: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
    .emergency-address { font-size: ${emergencyAddressFontMm(student.guardian.address)}; line-height: 1.02; max-width: 100%; display: -webkit-box; overflow: hidden; overflow-wrap: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .emergency-phone { font-size: ${emergencyPhoneFontMm(student.guardian.phone)}; line-height: 1; }
  </style>
</head>
<body>
  <section class="page">
    <img class="bg" src="${assets.front}" />
    ${student.photoUrl ? `<img class="layer photo" style="${pos(cardLayers.photo)}" src="${student.photoUrl}" />` : ''}
    <img class="layer qr" style="${pos(cardLayers.qr)}" src="${qrDataUrl}" />
    <div class="layer student-no" style="${pos(cardLayers.studentNo)}">${escapeHtml(student.admissionNo)}</div>
    <div class="layer last-name" style="${pos(cardLayers.lastName)}">${escapeHtml(lastName)}</div>
    <div class="layer first-name" style="${pos(cardLayers.firstName)}">${escapeHtml(firstName)}</div>
    <div class="layer grade" style="${pos(cardLayers.grade)}">${escapeHtml(gradeLine)}</div>
    ${idLines ? `<div class="layer ids" style="${pos(cardLayers.ids)}">${idLines}</div>` : ''}
  </section>
  <section class="page">
    <img class="bg" src="${assets.back}" />
    <div class="layer emergency" style="${pos(cardLayers.emergency)}">
      <div class="emergency-name">${escapeHtml(student.guardian.name)}</div>
      <div class="emergency-address">${escapeHtml(student.guardian.address)}</div>
      <div class="emergency-phone">${escapeHtml(student.guardian.phone)}</div>
    </div>
  </section>
</body>
</html>`;
}
