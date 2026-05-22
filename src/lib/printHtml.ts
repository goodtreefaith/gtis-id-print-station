import type { StudentRecord } from '../types';
import { cardLayers } from './layout';
import { studentFullName, studentGradeLine } from './student';
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

function nameFontMm(name: string) {
  const length = name.length;
  if (length > 42) {
    return '2.25mm';
  }
  if (length > 34) {
    return '2.6mm';
  }
  if (length > 28) {
    return '2.9mm';
  }
  if (length > 22) {
    return '3.25mm';
  }
  return '3.6mm';
}

export function renderPrintHtml(
  student: StudentRecord,
  qrDataUrl: string,
  assets: { front: string; back: string }
) {
  const name = studentFullName(student);
  const nameClass = name.length > 28 ? 'name is-long' : 'name';
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
    @page { size: 53.98mm 85.60mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
    .page { width: 53.98mm; height: 85.60mm; position: relative; overflow: hidden; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .layer { position: absolute; z-index: 2; }
    .photo { object-fit: cover; border-radius: 2.2mm; }
    .qr { background: #fff; padding: .8mm; }
    .admission { color: #fff; font-weight: 900; line-height: 1; display: flex; flex-direction: column; justify-content: center; }
    .admission-label { font-size: 2.9mm; }
    .admission-value { font-size: 3.4mm; }
    .name { color: #fff; font-weight: 900; font-size: ${nameFontMm(name)}; line-height: .98; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name.is-long { display: -webkit-box; line-height: 1.05; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .grade { color: #fff; font-weight: 900; font-size: 2.9mm; white-space: nowrap; }
    .ids { color: #fff; font-weight: 900; font-size: 2.2mm; line-height: 1.12; }
    .year { color: #fff; font-weight: 900; line-height: .98; display: flex; flex-direction: column; justify-content: center; }
    .year-label { font-size: 2mm; }
    .year-value { font-size: 3.4mm; }
    .emergency { color: #063f23; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
    .emergency-name { font-size: 4mm; line-height: 1.05; font-weight: 900; }
    .emergency-relation { font-size: 2.8mm; margin-top: 1.4mm; font-weight: 700; }
    .emergency-phone { font-size: 4.4mm; margin-top: 1.6mm; font-weight: 900; }
  </style>
</head>
<body>
  <section class="page">
    <img class="bg" src="${assets.front}" />
    ${student.photoUrl ? `<img class="layer photo" style="${pos(cardLayers.photo)}" src="${student.photoUrl}" />` : ''}
    <img class="layer qr" style="${pos(cardLayers.qr)}" src="${qrDataUrl}" />
    <div class="layer admission" style="${pos(cardLayers.admission)}"><span class="admission-label">Student No</span><span class="admission-value">${escapeHtml(student.admissionNo)}</span></div>
    <div class="layer ${nameClass}" style="${pos(cardLayers.name)}">${escapeHtml(name)}</div>
    <div class="layer grade" style="${pos(cardLayers.grade)}">${escapeHtml(studentGradeLine(student))}</div>
    ${idLines ? `<div class="layer ids" style="${pos(cardLayers.ids)}">${idLines}</div>` : ''}
    <div class="layer year" style="${pos(cardLayers.schoolYear)}"><span class="year-label">School Year</span><span class="year-value">2026-2027</span></div>
  </section>
  <section class="page">
    <img class="bg" src="${assets.back}" />
    <div class="layer emergency" style="${pos(cardLayers.emergency)}">
      <div class="emergency-name">${escapeHtml(student.guardian.name)}</div>
      <div class="emergency-relation">${escapeHtml(student.guardian.relation)}</div>
      <div class="emergency-phone">${escapeHtml(student.guardian.phone)}</div>
    </div>
  </section>
</body>
</html>`;
}
