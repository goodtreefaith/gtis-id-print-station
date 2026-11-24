// Downloads a student photo for embedding in the card. Only exact image
// types from the configured portal host, over https, at most 15 MB, with
// redirects followed only within that host. No Electron imports.
import type { FetchLike } from './portalRequest.js';

export const IMAGE_CONTENT_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function checkImageUrl(url: URL, allowedHost: string, requireHttps: boolean) {
  if (requireHttps ? url.protocol !== 'https:' : url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Photos can only be downloaded over https.');
  }
  if (url.username || url.password || url.host.toLowerCase() !== allowedHost.toLowerCase()) {
    throw new Error('Photos can only be downloaded from the configured portal.');
  }
}

export async function fetchImageDataUrl(
  rawUrl: unknown,
  allowedHost: string | null,
  fetchImpl: FetchLike,
  options: { requireHttps?: boolean; timeoutMs?: number; maxBytes?: number } = {}
) {
  const requireHttps = options.requireHttps ?? true;
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  if (!allowedHost) {
    throw new Error('Photos can only be downloaded after device setup.');
  }
  let url: URL;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new Error('Photo address is not valid.');
  }
  checkImageUrl(url, allowedHost, requireHttps);

  const signal = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  let response: Response | null = null;
  for (let redirects = 0; ; redirects += 1) {
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: IMAGE_CONTENT_TYPES.join(',') },
      redirect: 'manual',
      credentials: 'omit',
      signal
    });
    if (response.status < 300 || response.status >= 400) {
      break;
    }
    const location = response.headers.get('location');
    if (!location || redirects >= MAX_REDIRECTS) {
      throw new Error('Photo download was redirected too many times.');
    }
    url = new URL(location, url);
    checkImageUrl(url, allowedHost, requireHttps);
  }

  if (!response.ok) {
    throw new Error(`Photo download failed (HTTP ${response.status}).`);
  }
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_CONTENT_TYPES.includes(contentType)) {
    throw new Error('The photo is not a JPEG, PNG, WebP or GIF image.');
  }
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    throw new Error('The photo is larger than 15 MB.');
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('The photo is larger than 15 MB.');
      }
      chunks.push(value);
    }
  }
  return `data:${contentType};base64,${Buffer.concat(chunks).toString('base64')}`;
}
