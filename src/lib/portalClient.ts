import { mockStudents } from '../data/mockStudents';
import type { GuardianContact, PortalSettings, StudentRecord, StudentSearchResult } from '../types';
import { studentFullName } from './student';

let students = [...mockStudents];
const STORAGE_KEY = 'gtis-id-print-station.portal-settings';
const DEFAULT_PORTAL_URL = 'https://portal.gtis.edu.ph';
const DEFAULT_LIMIT = 20;

export function loadPortalSettings(): PortalSettings {
  const fallback: PortalSettings = {
    baseUrl: DEFAULT_PORTAL_URL,
    token: '',
    useMock: true
  };

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return fallback;
    }

    return { ...fallback, ...JSON.parse(saved) };
  } catch {
    return fallback;
  }
}

export function savePortalSettings(settings: PortalSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function hasPortalConfig(settings: PortalSettings) {
  return Boolean(settings.baseUrl.trim() && settings.token.trim() && !settings.useMock);
}

export async function searchStudents(
  query: string,
  options: { page?: number; limit?: number; settings: PortalSettings }
): Promise<StudentSearchResult> {
  if (hasPortalConfig(options.settings)) {
    return searchPortalStudents(query, options);
  }

  return searchMockStudents(query, options.page || 1, options.limit || DEFAULT_LIMIT);
}

export async function updateGuardian(
  studentId: string,
  guardian: GuardianContact,
  settings: PortalSettings
): Promise<StudentRecord> {
  if (hasPortalConfig(settings)) {
    const response = await portalFetch<{ student: PortalStudent }>(
      settings,
      `/idprintapi/students/${encodeURIComponent(studentId)}/guardian`,
      {
        method: 'POST',
        body: JSON.stringify({
          guardian_name: guardian.name,
          guardian_relation: guardian.relation,
          guardian_phone: guardian.phone
        })
      }
    );

    return mapPortalStudent(response.student);
  }

  students = students.map((student) =>
    student.id === studentId ? { ...student, guardian: { ...guardian } } : student
  );
  return requireStudent(studentId);
}

export async function updatePhoto(
  studentId: string,
  photoUrl: string,
  settings: PortalSettings
): Promise<StudentRecord> {
  if (hasPortalConfig(settings)) {
    const response = await portalFetch<{ student: PortalStudent }>(
      settings,
      `/idprintapi/students/${encodeURIComponent(studentId)}/photo`,
      {
        method: 'POST',
        body: JSON.stringify({ photo_data_url: photoUrl })
      }
    );

    return mapPortalStudent(response.student);
  }

  students = students.map((student) =>
    student.id === studentId ? { ...student, photoUrl } : student
  );
  return requireStudent(studentId);
}

async function searchMockStudents(query: string, page: number, limit: number): Promise<StudentSearchResult> {
  const needle = query.trim().toLowerCase();
  let result = students;

  if (!needle) {
    result = students;
  } else {
    result = students.filter((student) => {
      const haystack = [
        student.admissionNo,
        studentFullName(student),
        student.grade,
        student.section,
        student.guardian.name,
        student.guardian.phone
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }

  const start = (Math.max(page, 1) - 1) * limit;
  const pageItems = result.slice(start, start + limit);

  return {
    students: pageItems,
    page,
    hasMore: start + limit < result.length,
    source: 'mock',
    message: 'Mock portal mode is active. Add the portal URL and API token to fetch live data.'
  };
}

async function searchPortalStudents(
  query: string,
  options: { page?: number; limit?: number; settings: PortalSettings }
): Promise<StudentSearchResult> {
  const page = options.page || 1;
  const limit = options.limit || DEFAULT_LIMIT;
  const params = new URLSearchParams({
    q: query.trim(),
    page: String(page),
    limit: String(limit)
  });
  const response = await portalFetch<{
    students: PortalStudent[];
    page: number;
    has_more: boolean;
  }>(options.settings, `/idprintapi/students?${params.toString()}`);

  return {
    students: response.students.map(mapPortalStudent),
    page: response.page || page,
    hasMore: Boolean(response.has_more),
    source: 'portal',
    message: 'Live portal data loaded.'
  };
}

async function portalFetch<T>(settings: PortalSettings, path: string, init: RequestInit = {}) {
  const base = settings.baseUrl.trim().replace(/\/+$/, '') + '/';
  const url = new URL(path.replace(/^\/+/, ''), base);
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.token.trim()}`,
      ...(init.headers || {})
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || `Portal request failed with HTTP ${response.status}.`);
  }

  return payload as T & { status: boolean };
}

interface PortalStudent {
  id: string | number;
  admission_no: string;
  firstname: string;
  middlename?: string;
  lastname: string;
  class?: string;
  section?: string;
  photo_url?: string;
  guardian_name?: string;
  guardian_relation?: string;
  guardian_phone?: string;
  lrn?: string;
  esc?: string;
}

function mapPortalStudent(student: PortalStudent): StudentRecord {
  return {
    id: String(student.id),
    admissionNo: student.admission_no || '',
    firstName: student.firstname || '',
    middleName: student.middlename || '',
    lastName: student.lastname || '',
    grade: student.class || '',
    section: student.section || '',
    photoUrl: student.photo_url || '',
    guardian: {
      name: student.guardian_name || '',
      relation: student.guardian_relation || '',
      phone: student.guardian_phone || ''
    },
    lrn: student.lrn || '',
    esc: student.esc || ''
  };
}

function requireStudent(studentId: string) {
  const student = students.find((item) => item.id === studentId);
  if (!student) {
    throw new Error('Student was not found.');
  }
  return student;
}
