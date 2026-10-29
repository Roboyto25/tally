/** Renders the service worker from the template with the build's file list. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export function renderServiceWorker(files, buildId) {
  const template = readFileSync(join(here, 'sw-template.js'), 'utf8');
  const list = ['./', './index.html', ...files.map((f) => './' + f.replace(/^\.?\//, ''))];
  return template.replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify([...new Set(list)], null, 2));
}

/** Vite plugin: emits sw.js listing every emitted asset plus public files. */
export function tallyServiceWorker(publicFiles = []) {
  return {
    name: 'tally-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      const source = renderServiceWorker([...files, ...publicFiles], `${Date.now().toString(36)}`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
