import type { StudentRecord } from '../types';

export function studentFullName(student: StudentRecord) {
  return [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function studentGradeLine(student: StudentRecord) {
  return [student.grade, student.section].filter(Boolean).join(' - ');
}

export function readinessFor(student: StudentRecord, qrReady: boolean) {
  return {
    enrolled: true,
    photo: Boolean(student.photoUrl),
    guardian: Boolean(student.guardian.phone.trim()),
    qr: qrReady,
    cr80: true
  };
}
