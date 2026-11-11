/** Browser-managed cached EPUBs are usable offline but not always eviction-proof. */
export async function requestOfflineRetention(): Promise<'persistent' | 'best-effort'> {
  try {
    if (!navigator.storage?.persist) return 'best-effort';
    return await navigator.storage.persist() ? 'persistent' : 'best-effort';
  } catch { return 'best-effort'; }
}

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
