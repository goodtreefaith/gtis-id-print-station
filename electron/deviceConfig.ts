// One-time device setup. The device token is encrypted with Electron
// safeStorage (DPAPI on Windows, Keychain on macOS) and stored in userData.
// It is never written in plaintext and never returned to the renderer.
import { app, safeStorage } from 'electron';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_PORTAL_URL = 'https://portal.gtis.edu.ph';
export const MIN_TOKEN_LENGTH = 32;

export interface DeviceStatus {
  configured: boolean;
  portalUrl: string;
  tokenHint: string;
  encryptionAvailable: boolean;
}

interface StoredDeviceConfig {
  version: 1;
  portalUrl: string;
  tokenCiphertext: string;
  tokenHint: string;
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

function tokenHint(token: string) {
  return token.length >= 8 ? token.slice(-4) : '';
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

export async function deviceStatus(): Promise<DeviceStatus> {
  const stored = await readStoredConfig();
  return {
    configured: Boolean(stored),
    portalUrl: stored?.portalUrl || DEFAULT_PORTAL_URL,
    tokenHint: stored?.tokenHint || '',
    encryptionAvailable: encryptionAvailable()
  };
}

/** Main-process only. Returns null when not configured or not decryptable. */
export async function loadDeviceConnection(log: (message: string) => void) {
  const stored = await readStoredConfig();
  if (!stored) {
    return null;
  }
  if (!encryptionAvailable()) {
    log('Device token could not be read: OS encryption is unavailable.');
    return null;
  }
  try {
    const token = safeStorage.decryptString(Buffer.from(stored.tokenCiphertext, 'base64'));
    return token ? { baseUrl: stored.portalUrl, token } : null;
  } catch {
    log('Device token could not be decrypted. Run device setup again.');
    return null;
  }
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
    tokenHint: tokenHint(token),
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
