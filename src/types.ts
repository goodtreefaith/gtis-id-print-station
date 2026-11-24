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
 * Renderer view of the portal connection. Holds no secret: the device token
 * lives only in the Electron main process (see window.gtPrint.device).
 * live = this station has completed device setup.
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

/** Device setup status. Contains nothing derived from the token. */
export interface DeviceStatus {
  /** A token is saved, readable, and for an allowed portal host (live mode). */
  configured: boolean;
  portalUrl: string;
  /** The saved token can be decrypted on this computer and Windows account. */
  tokenReadable: boolean;
  encryptionAvailable: boolean;
  /** Plain-language note when setup needs attention (e.g. re-enter the token), else ''. */
  message: string;
}

export type DeviceTokenCheck = 'accepted' | 'rejected' | 'unreachable';

export interface DeviceConfigureResult extends DeviceStatus {
  /** Only 'accepted' saves the token. 'rejected' (portal refused it) and
   * 'unreachable' (no confirmation) save nothing and keep the old setup. */
  check: DeviceTokenCheck;
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

export interface DeviceBridge {
  status: () => Promise<DeviceStatus>;
  /** Rejects with a readable message for invalid input or unavailable encryption. */
  configure: (input: { portalUrl: string; token: string }) => Promise<DeviceConfigureResult>;
  clear: () => Promise<DeviceStatus>;
}

export interface PortalBridge {
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
  device?: DeviceBridge;
  portal?: PortalBridge;
}

declare global {
  interface Window {
    gtPrint?: PrintStationBridge;
  }
}
