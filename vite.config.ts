import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync } from 'node:fs';
// @ts-expect-error plain ESM helper without type declarations
import { tallyServiceWorker } from './scripts/sw.mjs';

// Files copied from /public that the service worker should cache for offline use.
const publicFiles = ['manifest.webmanifest', ...readdirSync('public/icons').map((f) => `icons/${f}`)];

export default defineConfig({
  // Relative base: works for https://<user>.github.io/<repo>/ and for a custom domain,
  // with no repository name hard-coded. Navigation uses #hash routes, so no 404 fallback is needed.
  base: './',
  plugins: [react(), tallyServiceWorker(publicFiles)],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
