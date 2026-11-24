// Decides whether a URL is the app's own page. Used to keep the main window
// (which has the privileged preload bridge) from navigating anywhere else,
// and to accept IPC only from that page. No Electron imports, so it can be
// tested with plain Node.

export interface AppLocation {
  /** Vite dev server URL in development, otherwise undefined. */
  devUrl?: string;
  /** file:// URL of dist/index.html in production. */
  indexFileUrl: string;
}

export function isAppUrl(candidate: string, location: AppLocation) {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  if (location.devUrl) {
    const dev = new URL(location.devUrl);
    return url.origin === dev.origin && (url.protocol === 'http:' || url.protocol === 'https:');
  }

  const index = new URL(location.indexFileUrl);
  return url.protocol === 'file:' && url.host === index.host && url.pathname === index.pathname;
}
