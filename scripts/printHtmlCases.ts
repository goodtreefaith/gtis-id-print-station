import { mockStudents } from '../src/data/mockStudents';
import type { StudentRecord } from '../src/types';

// Fixed inputs for the print HTML regression test. Changing these cases
// requires regenerating scripts/fixtures/print-html-*.html from a known-good
// print path, because the printer depends on that exact markup.
export const PRINT_HTML_ASSETS = {
  front: 'data:image/svg+xml;base64,RlJPTlQ=',
  back: 'data:image/svg+xml;base64,QkFDSw==',
  idCardFontFaceCss: '@font-face { font-family: "GTIS Avenir Bold"; src: url("data:font/woff2;base64,Rk9OVA==") format("woff2"); font-style: normal; font-weight: 700; }'
};
export const PRINT_HTML_QR = 'data:image/png;base64,UVI=';

const noPhotoNoIds: StudentRecord = {
  ...mockStudents[1],
  photoUrl: '',
  lrn: '',
  esc: '',
  guardian: { name: 'A & B <Guardian>', relation: 'Aunt', address: "12 O'Neil St., Tanza", phone: '0917 000 0000' }
};

export const PRINT_HTML_CASES: Array<{ name: string; student: StudentRecord }> = [
  { name: 'with-photo-and-ids', student: mockStudents[0] },
  { name: 'no-photo-no-ids', student: noPhotoNoIds }
];
