// Portal HTTP calls made on behalf of the renderer. The device token is added
// here, in the main process, so it never reaches the renderer or DevTools.
// This module has no Electron imports so it can be tested with plain Node.

export interface PortalConnection {
  baseUrl: string;
  token: string;
}

export interface PortalBridgeRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  operatorToken?: string;
}

export interface PortalBridgeResponse {
  ok: boolean;
  status: number;
  payload: unknown;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const PORTAL_PATH_PREFIX = '/idprintapi/';
/** The only portal hosts a packaged station may be set up against. */
export const PORTAL_HOST_ALLOWLIST: readonly string[] = ['portal.gtis.edu.ph', 'preportal.gtis.edu.ph'];
const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

export class PortalRequestError extends Error {}

function failure(message: string, status = 0): PortalBridgeResponse {
  return { ok: false, status, payload: { status: false, message } };
}

/**
 * Accepts only https portal origins on an allowlisted host (optionally with a
 * base path), with no port, credentials, query or fragment. Returns the
 * normalised base URL without a trailing slash.
 */
export function normalizePortalUrl(input: unknown, allowedHosts: readonly string[] = PORTAL_HOST_ALLOWLIST) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new PortalRequestError('Enter the portal address, for example https://portal.gtis.edu.ph.');
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new PortalRequestError('The portal address is not a valid web address.');
  }

  if (url.protocol !== 'https:') {
    throw new PortalRequestError('The portal address must start with https://.');
  }
  if (url.username || url.password || url.search || url.hash || url.port) {
    throw new PortalRequestError('The portal address must not contain a port, user name, password, query or #fragment.');
  }
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new PortalRequestError(`The portal address must be one of: ${allowedHosts.map((host) => `https://${host}`).join(', ')}.`);
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** Validates the renderer's request shape. Throws PortalRequestError. */
export function validateBridgeRequest(input: unknown): PortalBridgeRequest {
  if (!input || typeof input !== 'object') {
    throw new PortalRequestError('Invalid portal request.');
  }
  const request = input as Record<string, unknown>;
  const method = request.method;
  if (method !== 'GET' && method !== 'POST') {
    throw new PortalRequestError('Portal requests must use GET or POST.');
  }
  const path = request.path;
  if (
    typeof path !== 'string' ||
    path.length > 2048 ||
    !path.startsWith(PORTAL_PATH_PREFIX) ||
    path.includes('\\') ||
    path.includes('//') ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new PortalRequestError('Portal requests may only call /idprintapi/ routes.');
  }
  if (method === 'GET' && request.body !== undefined) {
    throw new PortalRequestError('GET portal requests cannot have a body.');
  }
  const operatorToken = request.operatorToken;
  if (
    operatorToken !== undefined &&
    operatorToken !== null &&
    operatorToken !== '' &&
    (typeof operatorToken !== 'string' || operatorToken.length > 1024 || !/^[\x21-\x7e]+$/.test(operatorToken))
  ) {
    throw new PortalRequestError('Invalid operator session.');
  }

  return {
    method,
    path,
    body: request.body,
    operatorToken: typeof operatorToken === 'string' && operatorToken !== '' ? operatorToken : undefined
  };
}

/**
 * Builds the absolute URL and re-checks it after WHATWG normalisation, so
 * dot segments (including %2e%2e) cannot escape /idprintapi/ or the origin.
 */
export function resolvePortalUrl(baseUrl: string, path: string) {
  const base = new URL(`${baseUrl.replace(/\/+$/, '')}/`);
  const url = new URL(path.replace(/^\/+/, ''), base);
  const requiredPrefix = `${base.pathname.replace(/\/+$/, '')}${PORTAL_PATH_PREFIX}`;
  if (url.origin !== base.origin || !url.pathname.startsWith(requiredPrefix) || url.username || url.password) {
    throw new PortalRequestError('Portal requests may only call /idprintapi/ routes.');
  }
  return url;
}

export async function portalRequest(
  connection: PortalConnection,
  rawRequest: unknown,
  fetchImpl: FetchLike,
  options: { timeoutMs?: number } = {}
): Promise<PortalBridgeResponse> {
  let request: PortalBridgeRequest;
  let url: URL;
  try {
    request = validateBridgeRequest(rawRequest);
    url = resolvePortalUrl(connection.baseUrl, request.path);
  } catch (error) {
    return failure(error instanceof PortalRequestError ? error.message : 'Invalid portal request.');
  }

  const isUpload = /\/(id-card-documents|photo)$/.test(url.pathname);
  const timeoutMs = options.timeoutMs ?? (isUpload ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${connection.token}`,
    // The live host drops Authorization before PHP sees it; this header is
    // the one that actually authenticates the device.
    'X-GTIS-IDPRINT-TOKEN': connection.token
  };
  if (request.method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }
  if (request.operatorToken) {
    headers['X-GTIS-IDPRINT-OPERATOR'] = request.operatorToken;
  }

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: request.method,
      headers,
      body: request.method === 'POST' ? JSON.stringify(request.body ?? {}) : undefined,
      // Never forward the device token to another host via a redirect.
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return failure('The portal did not respond in time. Check the internet connection and try again.');
    }
    return failure('Could not reach the portal. Check the internet connection and try again.');
  }

  const text = await response.text().catch(() => '');
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  return { ok: response.ok, status: response.status, payload };
}

export type TokenCheck = 'accepted' | 'rejected' | 'unreachable';

/**
 * Checks a device token without operator credentials. The portal answers 422
 * "Email and password are required." only after it accepted the device
 * token, and 401 when it rejects the token.
 */
export async function checkDeviceToken(connection: PortalConnection, fetchImpl: FetchLike): Promise<{ check: TokenCheck; status: number }> {
  const result = await portalRequest(
    connection,
    { method: 'POST', path: '/idprintapi/login', body: { username: '', password: '' } },
    fetchImpl,
    { timeoutMs: 15_000 }
  );
  if (result.status === 422) {
    return { check: 'accepted', status: result.status };
  }
  if (result.status === 401 || result.status === 403) {
    return { check: 'rejected', status: result.status };
  }
  return { check: 'unreachable', status: result.status };
}
