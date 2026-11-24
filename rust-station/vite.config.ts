import { defineConfig } from 'vite';
import tauriConfig from './src-tauri/tauri.conf.json' with { type: 'json' };

export default defineConfig({
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    headers: { 'Content-Security-Policy': tauriConfig.app.security.devCsp },
  },
});
