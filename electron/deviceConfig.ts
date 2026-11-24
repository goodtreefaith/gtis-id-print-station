// One-time device setup. The device token is encrypted with Electron
// safeStorage (DPAPI on Windows, Keychain on macOS) and stored in userData.
// It is never written in plaintext and never returned to the renderer.
import { app, safeStorage } from 'electron';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_PORTAL_URL = 'https://portal.gtis.edu.ph';
export const MIN_TOKEN_LENGTH = 32;

export interface DeviceStatus {
  /** A token is saved, readable, and for an allowed portal host. */
  configured: boolean;
  portalUrl: string;
  /** The saved token can be decrypted on this computer and Windows account. */
  tokenReadable: boolean;
  encryptionAvailable: boolean;
  /** Plain-language note when setup needs attention, otherwise ''. */
  message: string;
}

interface StoredDeviceConfig {
  version: 1;
  portalUrl: string;
  tokenCiphertext: string;
  savedAt: string;
}

function configPath() {
  return path.join(app.getPath('userData'), 'device-config.json');
}

export function encryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    return false;
  }
  // On Linux without a keyring, safeStorage falls back to a hard-coded key.
  // That is not real protection, so treat it as unavailable.
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    return false;
  }
  return true;
}

async function readStoredConfig(): Promise<StoredDeviceConfig | null> {
  try {
    const parsed = JSON.parse(await readFile(configPath(), 'utf8')) as StoredDeviceConfig;
    if (parsed?.version !== 1 || typeof parsed.tokenCiphertext !== 'string' || typeof parsed.portalUrl !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function decryptStored(stored: StoredDeviceConfig) {
  if (!encryptionAvailable()) {
    return null;
  }
  try {
    const token = safeStorage.decryptString(Buffer.from(stored.tokenCiphertext, 'base64'));
    return token || null;
  } catch {
    return null;
  }
}

function hostAllowed(portalUrl: string, allowedHosts: readonly string[]) {
  try {
    return allowedHosts.includes(new URL(portalUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function deviceStatus(allowedHosts: readonly string[]): Promise<DeviceStatus> {
  const stored = await readStoredConfig();
  const tokenReadable = Boolean(stored && decryptStored(stored));
  const allowed = Boolean(stored && hostAllowed(stored.portalUrl, allowedHosts));
  let message = '';
  if (stored && !tokenReadable) {
    message = 'The saved device token can no longer be read on this computer. Re-enter the device token.';
  } else if (stored && !allowed) {
    message = 'The saved portal address is no longer allowed. Re-enter the device setup.';
  }
  return {
    configured: tokenReadable && allowed,
    portalUrl: stored?.portalUrl || DEFAULT_PORTAL_URL,
    tokenReadable,
    encryptionAvailable: encryptionAvailable(),
    message
  };
}

/** Main-process only. Returns null when not configured, unreadable or not allowed. */
export async function loadDeviceConnection(allowedHosts: readonly string[], log: (message: string) => void) {
  const stored = await readStoredConfig();
  if (!stored) {
    return null;
  }
  if (!hostAllowed(stored.portalUrl, allowedHosts)) {
    log('Saved portal host is not allowed. Run device setup again.');
    return null;
  }
  const token = decryptStored(stored);
  if (!token) {
    log('Device token could not be decrypted. Run device setup again.');
    return null;
  }
  return { baseUrl: stored.portalUrl, token };
}

export async function saveDeviceConfig(portalUrl: string, token: string) {
  if (!encryptionAvailable()) {
    throw new Error(
      'This computer cannot encrypt the device token (Windows data protection or the system keychain is unavailable). The token was not saved.'
    );
  }
  const stored: StoredDeviceConfig = {
    version: 1,
    portalUrl,
    tokenCiphertext: safeStorage.encryptString(token).toString('base64'),
    savedAt: new Date().toISOString()
  };
  const target = configPath();
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temp, target);
}

export async function clearDeviceConfig() {
  await rm(configPath(), { force: true });
}
