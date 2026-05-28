import { mockStudents } from '../data/mockStudents';
import type {
  GuardianContact,
  OperatorSession,
  PortalSettings,
  StudentIdDetails,
  StudentNameDetails,
  StudentRecord,
  StudentSearchResult
} from '../types';
import { studentFullName } from './student';

let students = [...mockStudents];
const STORAGE_KEY = 'gtis-id-print-station.portal-settings';
const OPERATOR_STORAGE_KEY = 'gtis-id-print-station.operator-session';
const DEFAULT_PORTAL_URL = 'https://portal.gtis.edu.ph';
const DEFAULT_LIMIT = 20;

interface ViteImportMeta extends ImportMeta {
  env?: Record<string, string | undefined>;
}

function envPortalSettings(): PortalSettings {
  const env = ((import.meta as ViteImportMeta).env || {});
  const token = (env.VITE_GTIS_IDPRINT_API_TOKEN || '').trim();
  const useMockValue = (env.VITE_GTIS_IDPRINT_USE_MOCK || '').trim().toLowerCase();

  return {
    baseUrl: (env.VITE_GTIS_PORTAL_URL || DEFAULT_PORTAL_URL).trim(),
    token,
    useMock: useMockValue ? ['1', 'true', 'yes'].includes(useMockValue) : token === ''
  };
}

export function loadPortalSettings(): PortalSettings {
  const fallback = envPortalSettings();

  if (fallback.token) {
    return fallback;
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return fallback;
    }

    const parsed = { ...fallback, ...JSON.parse(saved) };
    return parsed.token ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function hasPortalConfig(settings: PortalSettings) {
  return Boolean(settings.baseUrl.trim() && settings.token.trim() && !settings.useMock);
}

export function loadOperatorSession(): OperatorSession | null {
  try {
    const saved = window.localStorage.getItem(OPERATOR_STORAGE_KEY);
    if (!saved) {
      return null;
    }

    const session = JSON.parse(saved) as OperatorSession;
    return hasValidOperatorSession(session) ? session : null;
  } catch {
    return null;
  }
}

export function saveOperatorSession(session: OperatorSession) {
  window.localStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(session));
}

export function clearOperatorSession() {
  window.localStorage.removeItem(OPERATOR_STORAGE_KEY);
}

export function hasValidOperatorSession(session: OperatorSession | null) {
  return Boolean(session?.token && session.expiresAt && Date.parse(session.expiresAt) > Date.now());
}

export async function loginOperator(
  settings: PortalSettings,
  credentials: { username: string; password: string }
): Promise<OperatorSession> {
  if (!hasPortalConfig(settings)) {
    const session = {
      token: 'sample',
      name: credentials.username.trim() || 'Sample Operator',
      email: credentials.username.trim(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    };
    saveOperatorSession(session);
    return session;
  }

  const response = await portalFetch<{
    operator_token: string;
    operator: {
      name?: string;
      email?: string;
      role?: string;
      permissions?: {
        can_view?: boolean;
        can_edit?: boolean;
      };
    };
    expires_at: string;
  }>(settings, '/idprintapi/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });

  const session = {
    token: response.operator_token,
    name: response.operator.name || response.operator.email || 'Portal Operator',
    email: response.operator.email || credentials.username,
    role: response.operator.role || '',
    permissions: {
      canView: response.operator.permissions?.can_view !== false,
      canEdit: response.operator.permissions?.can_edit !== false
    },
    expiresAt: response.expires_at
  };
  saveOperatorSession(session);
  return session;
}

export async function searchStudents(
  query: string,
  options: { page?: number; limit?: number; settings: PortalSettings; operatorToken?: string }
): Promise<StudentSearchResult> {
  if (hasPortalConfig(options.settings)) {
    return searchPortalStudents(query, options);
  }

  return searchMockStudents(query, options.page || 1, options.limit || DEFAULT_LIMIT);
}

export async function updateGuardian(
  studentId: string,
  guardian: GuardianContact,
  settings: PortalSettings,
  operatorToken?: string
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
          guardian_address: guardian.address,
          guardian_phone: guardian.phone
        })
      },
      operatorToken
    );

    return mapPortalStudent(response.student);
  }

  students = students.map((student) =>
    student.id === studentId ? { ...student, guardian: { ...guardian } } : student
  );
  return requireStudent(studentId);
}

export async function updateStudentName(
  studentId: string,
  name: StudentNameDetails,
  settings: PortalSettings,
  operatorToken?: string
): Promise<StudentRecord> {
  if (hasPortalConfig(settings)) {
    const response = await portalFetch<{ student: PortalStudent }>(
      settings,
      `/idprintapi/students/${encodeURIComponent(studentId)}/name`,
      {
        method: 'POST',
        body: JSON.stringify({
          firstname: name.firstName,
          lastname: name.lastName
        })
      },
      operatorToken
    );

    return mapPortalStudent(response.student);
  }

  students = students.map((student) =>
    student.id === studentId ? { ...student, firstName: name.firstName, lastName: name.lastName } : student
  );
  return requireStudent(studentId);
}

export async function updateIdDetails(
  studentId: string,
  idDetails: StudentIdDetails,
  settings: PortalSettings,
  operatorToken?: string
): Promise<StudentRecord> {
  if (hasPortalConfig(settings)) {
    const response = await portalFetch<{ student: PortalStudent }>(
      settings,
      `/idprintapi/students/${encodeURIComponent(studentId)}/id-details`,
      {
        method: 'POST',
        body: JSON.stringify({
          lrn: idDetails.lrn,
          esc: idDetails.esc
        })
      },
      operatorToken
    );

    return mapPortalStudent(response.student);
  }

  students = students.map((student) =>
    student.id === studentId ? { ...student, lrn: idDetails.lrn, esc: idDetails.esc } : student
  );
  return requireStudent(studentId);
}

export async function updatePhoto(
  studentId: string,
  photoUrl: string,
  settings: PortalSettings,
  operatorToken?: string
): Promise<StudentRecord> {
  if (hasPortalConfig(settings)) {
    const response = await portalFetch<{ student: PortalStudent }>(
      settings,
      `/idprintapi/students/${encodeURIComponent(studentId)}/photo`,
      {
        method: 'POST',
        body: JSON.stringify({ photo_data_url: photoUrl })
      },
      operatorToken
    );

    return mapPortalStudent(response.student);
  }

  students = students.map((student) =>
    student.id === studentId ? { ...student, photoUrl } : student
  );
  return requireStudent(studentId);
}

export async function uploadIdCardDocuments(
  studentId: string,
  images: { front: string; back: string },
  settings: PortalSettings,
  operatorToken?: string
) {
  if (!hasPortalConfig(settings)) {
    return { documents: [] };
  }

  return portalFetch<{ documents: Array<Record<string, unknown>> }>(
    settings,
    `/idprintapi/students/${encodeURIComponent(studentId)}/id-card-documents`,
    {
      method: 'POST',
      body: JSON.stringify({
        front_png_data_url: images.front,
        back_png_data_url: images.back
      })
    },
    operatorToken
  );
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
        student.guardian.address,
        student.guardian.phone,
        student.lrn,
        student.esc
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
    message: 'Sample data loaded for local testing.'
  };
}

async function searchPortalStudents(
  query: string,
  options: { page?: number; limit?: number; settings: PortalSettings; operatorToken?: string }
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
  }>(options.settings, `/idprintapi/students?${params.toString()}`, {}, options.operatorToken);

  return {
    students: response.students.map(mapPortalStudent),
    page: response.page || page,
    hasMore: Boolean(response.has_more),
    source: 'portal',
    message: 'Student records loaded.'
  };
}

async function portalFetch<T>(
  settings: PortalSettings,
  path: string,
  init: RequestInit = {},
  operatorToken?: string
) {
  const base = settings.baseUrl.trim().replace(/\/+$/, '') + '/';
  const url = new URL(path.replace(/^\/+/, ''), base);
  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.token.trim()}`,
      ...(operatorToken ? { 'X-GTIS-IDPRINT-OPERATOR': operatorToken } : {}),
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
  guardian_address?: string;
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
      address: student.guardian_address || '',
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
