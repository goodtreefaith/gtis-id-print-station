// A fetch-like wrapper over Electron net.request that reports redirects
// instead of following them. net.fetch throws on redirect: 'manual', but the
// photo download must inspect every hop (same host only) while still using
// Chromium's network stack (system proxy and Windows certificate store).
import { net } from 'electron';
import type { FetchLike } from './portalRequest.js';

export const netFetchManualRedirect: FetchLike = (input, init) =>
  new Promise<Response>((resolve, reject) => {
    const request = net.request({
      url: input,
      method: init.method || 'GET',
      redirect: 'manual',
      credentials: 'omit',
      useSessionCookies: false
    });
    const headers = (init.headers || {}) as Record<string, string>;
    for (const [name, value] of Object.entries(headers)) {
      request.setHeader(name, value);
    }

    let settled = false;
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const signal = init.signal;
    if (signal) {
      if (signal.aborted) {
        fail(signal.reason);
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          request.abort();
          fail(signal.reason);
        },
        { once: true }
      );
    }

    request.on('redirect', (statusCode, _method, redirectUrl) => {
      settled = true;
      request.abort();
      resolve(new Response(null, { status: statusCode, headers: { location: redirectUrl } }));
    });
    request.on('response', (response) => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          response.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          response.on('end', () => controller.close());
          response.on('error', (error: Error) => controller.error(error));
        },
        cancel() {
          request.abort();
        }
      });
      settled = true;
      resolve(new Response(body, { status: response.statusCode, headers: responseHeaders }));
    });
    request.on('error', fail);
    request.end();
  });
