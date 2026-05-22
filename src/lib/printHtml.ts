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
  const lines = splitNameLines(name);
  const longestLine = Math.max(...lines.map((line) => line.length));

  if (lines.length > 1) {
    if (longestLine > 28) {
      return '2.15mm';
    }
    if (longestLine > 24) {
      return '2.35mm';
    }
    if (longestLine > 20) {
      return '2.55mm';
    }
    return '2.75mm';
  }

  if (longestLine > 30) {
    return '2.2mm';
  }
  if (longestLine > 26) {
    return '2.7mm';
  }
  if (longestLine > 22) {
    return '3mm';
  }
  return '3.55mm';
}

function gradeFontMm(grade: string) {
  const length = grade.length;
  if (length > 28) {
    return '2.05mm';
  }
  if (length > 23) {
    return '2.25mm';
  }
  if (length > 18) {
    return '2.55mm';
  }
  return '2.9mm';
}

function splitNameLines(name: string) {
  const words = name.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (name.length <= 26 || words.length <= 1) {
    return [name];
  }

  let bestIndex = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(' ');
    const second = words.slice(index).join(' ');
    const score = Math.abs(first.length - second.length);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return [words.slice(0, bestIndex).join(' '), words.slice(bestIndex).join(' ')];
}

function emergencyNameFontMm(name: string) {
  const length = name.length;
  if (length > 42) {
    return '2.1mm';
  }
  if (length > 34) {
    return '2.35mm';
  }
  if (length > 26) {
    return '2.65mm';
  }
  return '3mm';
}

function emergencyAddressFontMm(address: string) {
  const length = address.length;
  if (length > 82) {
    return '1.5mm';
  }
  if (length > 62) {
    return '1.7mm';
  }
  if (length > 42) {
    return '1.85mm';
  }
  return '2.05mm';
}

export function renderPrintHtml(
  student: StudentRecord,
  qrDataUrl: string,
  assets: { front: string; back: string }
) {
  const name = studentFullName(student);
  const nameLines = splitNameLines(name).map((line) => `<span>${escapeHtml(line)}</span>`).join('');
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
    @page { size: 53.98mm 85.60mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
    .page { width: 53.98mm; height: 85.60mm; position: relative; overflow: hidden; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .layer { position: absolute; z-index: 2; }
    .photo { object-fit: cover; border-radius: 2.2mm; }
    .qr { background: #fff; padding: .8mm; }
    .student-no { color: #fff; font-weight: 900; font-size: 3.6mm; line-height: .98; white-space: nowrap; }
    .name { color: #fff; font-weight: 900; font-size: ${nameFontMm(name)}; line-height: .9; white-space: normal; overflow: visible; text-wrap: balance; }
    .name span { display: block; }
    .grade { color: #fff; font-weight: 900; font-size: ${gradeFontMm(gradeLine)}; white-space: nowrap; }
    .ids { color: #fff; font-weight: 900; font-size: 2.05mm; line-height: 1.12; }
    .emergency { color: #063f23; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
    .emergency-name { font-size: ${emergencyNameFontMm(student.guardian.name)}; line-height: 1.05; font-weight: 900; max-width: 100%; display: -webkit-box; overflow: hidden; overflow-wrap: break-word; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .emergency-address { font-size: ${emergencyAddressFontMm(student.guardian.address)}; line-height: 1.08; margin-top: .9mm; font-weight: 700; max-width: 90%; display: -webkit-box; overflow: hidden; overflow-wrap: break-word; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
    .emergency-phone { font-size: 3mm; margin-top: 1.2mm; font-weight: 900; }
  </style>
</head>
<body>
  <section class="page">
    <img class="bg" src="${assets.front}" />
    ${student.photoUrl ? `<img class="layer photo" style="${pos(cardLayers.photo)}" src="${student.photoUrl}" />` : ''}
    <img class="layer qr" style="${pos(cardLayers.qr)}" src="${qrDataUrl}" />
    <div class="layer student-no" style="${pos(cardLayers.studentNo)}">${escapeHtml(student.admissionNo)}</div>
    <div class="layer name" style="${pos(cardLayers.name)}">${nameLines}</div>
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
