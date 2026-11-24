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

/**
 * Renderer view of the portal connection. Holds no secret.
 * live = real portal with staff sign-in; otherwise sample data.
 */
export interface PortalSettings {
  baseUrl: string;
  live: boolean;
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

export interface PortalInfo {
  /** Fixed portal: https://portal.gtis.edu.ph, or preportal when the station runs with GTIS_IDPRINT_PORTAL=preportal. */
  portalUrl: string;
  /** live by default; sample only when the station runs with GTIS_IDPRINT_SAMPLE=1. */
  mode: 'live' | 'sample';
}

export interface PortalBridgeRequest {
  method: 'GET' | 'POST';
  /** Must start with /idprintapi/. */
  path: string;
  body?: unknown;
  operatorToken?: string;
}

export interface PortalBridgeResponse {
  ok: boolean;
  /** HTTP status, or 0 when the portal could not be reached. */
  status: number;
  payload: unknown;
}

export interface PortalBridge {
  info: () => Promise<PortalInfo>;
  /** Sends only the operator header (when given); there is no device token. */
  request: (req: PortalBridgeRequest) => Promise<PortalBridgeResponse>;
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
  portal?: PortalBridge;
}

declare global {
  interface Window {
    gtPrint?: PrintStationBridge;
  }
}
