// Field checks for the card editor. "error" blocks printing, "warning" does not.

export type FieldKey =
  | 'firstName'
  | 'lastName'
  | 'guardianName'
  | 'guardianAddress'
  | 'guardianPhone'
  | 'lrn'
  | 'esc';

export interface FieldIssue {
  level: 'error' | 'warning';
  message: string;
}

export type FieldIssues = Partial<Record<FieldKey, FieldIssue>>;

/** Which card text runs past its space on the preview (and therefore on the printed card). */
export interface FitReport {
  lastName: boolean;
  firstName: boolean;
  grade: boolean;
  ids: boolean;
  guardianName: boolean;
  guardianAddress: boolean;
  guardianPhone: boolean;
  /** The emergency contact name prints below the smallest comfortable size. */
  guardianNameSmall: boolean;
}

export const emptyFit: FitReport = {
  lastName: false,
  firstName: false,
  grade: false,
  ids: false,
  guardianName: false,
  guardianAddress: false,
  guardianPhone: false,
  guardianNameSmall: false
};

export const fitLabels: Record<keyof FitReport, string> = {
  lastName: 'Last name',
  firstName: 'First name',
  grade: 'Grade and section',
  ids: 'LRN / ESC line',
  guardianName: 'Emergency contact name',
  guardianAddress: 'Emergency contact address',
  guardianPhone: 'Emergency contact phone',
  guardianNameSmall: 'Emergency contact name (prints very small)'
};

function digits(value: string) {
  return value.replace(/\D/g, '');
}

export function checkFields(
  values: {
    firstName: string;
    lastName: string;
    guardianName: string;
    guardianAddress: string;
    guardianPhone: string;
    lrn: string;
    esc: string;
  },
  fit: FitReport
): FieldIssues {
  const issues: FieldIssues = {};
  const tooLong = (label: string): FieldIssue => ({
    level: 'warning',
    message: `Too long for the card: the end of the ${label} will be cut off. Shorten it if you can.`
  });

  if (!values.firstName.trim()) issues.firstName = { level: 'error', message: 'Needed on the card.' };
  else if (fit.firstName) issues.firstName = tooLong('first name');

  if (!values.lastName.trim()) issues.lastName = { level: 'error', message: 'Needed on the card.' };
  else if (fit.lastName) issues.lastName = tooLong('last name');

  if (!values.guardianName.trim()) issues.guardianName = { level: 'error', message: 'Needed on the back of the card.' };
  else if (fit.guardianName) issues.guardianName = tooLong('name');
  else if (fit.guardianNameSmall) {
    issues.guardianName = {
      level: 'warning',
      message: 'Prints very small on the card. Shorten it if you can.'
    };
  }

  if (!values.guardianAddress.trim()) issues.guardianAddress = { level: 'error', message: 'Needed on the back of the card.' };
  else if (fit.guardianAddress) issues.guardianAddress = tooLong('address (2 lines fit)');

  const phoneDigits = digits(values.guardianPhone);
  if (!values.guardianPhone.trim()) issues.guardianPhone = { level: 'error', message: 'Needed on the back of the card.' };
  else if (/[^0-9+\-() ]/.test(values.guardianPhone.trim())) {
    issues.guardianPhone = { level: 'error', message: 'Use digits only. Spaces, +, - and brackets are fine.' };
  } else if (phoneDigits.length < 7) issues.guardianPhone = { level: 'error', message: 'Too short for a phone number: at least 7 digits.' };
  else if (phoneDigits.length > 13) issues.guardianPhone = { level: 'warning', message: 'This number looks too long. Check it.' };
  else if (fit.guardianPhone) issues.guardianPhone = tooLong('phone number');

  const lrnDigits = digits(values.lrn);
  if (values.lrn.trim() && (lrnDigits.length !== 12 || lrnDigits.length !== values.lrn.trim().length)) {
    issues.lrn = { level: 'warning', message: 'An LRN is usually 12 digits.' };
  } else if (fit.ids && values.lrn.trim()) {
    issues.lrn = tooLong('LRN line');
  }

  if (values.esc.trim() && digits(values.esc).length !== values.esc.trim().length) {
    issues.esc = { level: 'warning', message: 'An ESC number is usually digits only.' };
  } else if (fit.ids && values.esc.trim()) {
    issues.esc = tooLong('ESC line');
  }

  return issues;
}
