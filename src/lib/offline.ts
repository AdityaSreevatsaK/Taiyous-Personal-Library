/** Register the generated same-origin static app shell for offline navigation. */
export function registerOfflineApp(): void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
      .then(() => {
        window.dispatchEvent(new Event('taiyou-offline-shell-updated'));
      })
      .catch(() => {
        // Private iframe sandbox settings can prevent SW registration.
        // EPUBs held in IndexedDB remain available to already-open sessions.
      });
  }, { once: true });
}
