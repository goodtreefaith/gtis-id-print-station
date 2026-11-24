import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Strict Content Security Policy for the packaged app. Added at build time
// only, because the Vite dev server injects an inline React refresh script.
// - images: bundled assets, data:/blob: (QR codes, templates, captured
//   photos) and the allowed portal hosts (student thumbnails);
// - fonts: the optional ID card font is loaded as a data: URL;
// - media: the webcam stream;
// - connect: only the app itself (portal calls go through the main process).
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://portal.gtis.edu.ph https://preportal.gtis.edu.ph",
  "font-src 'self' data:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'gtis-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend'
      }
    ]
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
