import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker: caches the app shell for offline use. It never touches IndexedDB,
// so updating the app can't remove saved records.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const announce = (w: ServiceWorker | null) => {
        if (w && navigator.serviceWorker.controller) window.dispatchEvent(new CustomEvent('tally:update', { detail: w }));
      };
      announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed') announce(w);
        });
      });
      // Reload only when the user asked for the update. On a first visit the new worker
      // also takes control, and reloading then would discard whatever is being typed.
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !(window as unknown as { __tallyUpdateRequested?: boolean }).__tallyUpdateRequested) return;
        reloading = true;
        location.reload();
      });
      // check for a new version when the app comes back to the foreground
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
      });
    } catch {
      /* offline support unavailable; the app still works online */
    }
  });
}
