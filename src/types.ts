export interface GuardianContact {
  name: string;
  relation: string;
  address: string;
  phone: string;
}

export interface StudentIdDetails {
  lrn: string;
  esc: string;
}

export interface StudentNameDetails {
  firstName: string;
  lastName: string;
}

export interface StudentRecord {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  grade: string;
  section?: string;
  photoUrl?: string;
  guardian: GuardianContact;
  lrn?: string;
  esc?: string;
}

export interface PortalSettings {
  baseUrl: string;
  token: string;
  useMock: boolean;
}

export interface OperatorSession {
  token: string;
  name: string;
  email: string;
  role?: string;
  permissions?: {
    canView?: boolean;
    canEdit?: boolean;
  };
  expiresAt: string;
}

export interface StudentSearchResult {
  students: StudentRecord[];
  page: number;
  hasMore: boolean;
  source: 'mock' | 'portal';
  message?: string;
}

export interface PrinterInfo {
  name: string;
  displayName?: string;
  isDefault?: boolean;
  status?: number;
}

export interface PrintResult {
  ok: boolean;
  error?: string;
  canceled?: boolean;
  filePath?: string;
  mode?: 'dialog' | 'silent' | string;
  printerName?: string;
  failureReason?: string;
}

export interface PrintStationBridge {
  listPrinters: () => Promise<PrinterInfo[]>;
  printCard: (
    html: string,
    options: { deviceName?: string; silent?: boolean }
  ) => Promise<PrintResult>;
  saveCardPdf: (html: string) => Promise<PrintResult>;
  captureCardPngs?: (html: string) => Promise<{ front: string; back: string; dpi: number }>;
  fetchImageDataUrl?: (url: string) => Promise<string>;
  readAssetDataUrl?: (assetPath: string) => Promise<string | null>;
}

declare global {
  interface Window {
    gtPrint?: PrintStationBridge;
  }
}
