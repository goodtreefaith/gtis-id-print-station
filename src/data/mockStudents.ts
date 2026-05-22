import type { StudentRecord } from '../types';

function avatarSvg(name: string, bg: string) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 560">
      <rect width="420" height="560" fill="${bg}"/>
      <circle cx="210" cy="174" r="86" fill="#f7d6bd"/>
      <path d="M105 560c10-138 200-138 210 0z" fill="#064f2b"/>
      <circle cx="178" cy="170" r="8" fill="#222"/>
      <circle cx="242" cy="170" r="8" fill="#222"/>
      <path d="M172 228c22 19 54 19 76 0" fill="none" stroke="#8a4b35" stroke-width="8" stroke-linecap="round"/>
      <text x="210" y="432" font-family="Arial" font-size="52" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text>
    </svg>
  `)}`;
}

export const mockStudents: StudentRecord[] = [
  {
    id: 'stu-2026001',
    admissionNo: '2026001',
    firstName: 'Jetto Morris',
    middleName: 'R.',
    lastName: 'Bamba',
    grade: 'Grade 12',
    section: 'Faith',
    photoUrl: avatarSvg('Jetto Bamba', '#ead6bf'),
    guardian: {
      name: 'Maria Bamba',
      relation: 'Mother',
      phone: '0917-111-2026'
    },
    lrn: '123456789101',
    esc: 'ESC-2026-001'
  },
  {
    id: 'stu-2026002',
    admissionNo: '2026002',
    firstName: 'Arielle',
    lastName: 'Santos',
    grade: 'Grade 8',
    section: 'Hope',
    guardian: {
      name: 'Ramon Santos',
      relation: 'Father',
      phone: ''
    },
    lrn: '987654321012'
  },
  {
    id: 'stu-2026003',
    admissionNo: '2026003',
    firstName: 'Nathaniel Christopher',
    middleName: 'Dela Cruz',
    lastName: 'Villanueva',
    grade: 'Grade 5',
    section: 'Love',
    photoUrl: avatarSvg('Nathaniel Villanueva', '#c9d7c4'),
    guardian: {
      name: 'Ana Villanueva',
      relation: 'Guardian',
      phone: '0998-555-0144'
    }
  }
];
