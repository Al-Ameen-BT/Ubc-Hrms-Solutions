import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Live-mode tooling injects a `<script src="http://localhost:8400/live.js">`
 * into index.html between these markers. It must never reach a production
 * bundle, so strip it at build time while leaving dev untouched.
 */
const stripImpeccableLive = {
  name: 'strip-impeccable-live',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    return html.replace(
      /\s*<!--\s*impeccable-live-start\s*-->[\s\S]*?<!--\s*impeccable-live-end\s*-->/g,
      '',
    );
  },
};

export default defineConfig({
  plugins: [react(), stripImpeccableLive],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
