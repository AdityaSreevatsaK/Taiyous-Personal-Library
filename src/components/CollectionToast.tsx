import { useEffect, useRef } from 'react';

export interface CollectionToastNotice {
  id: number;
  title: string;
  detail: string;
}

export default function CollectionToast({
  toast, onDismiss,
}: { toast: CollectionToastNotice; onDismiss: () => void }) {
  // The callback changes when the stack is reordered. Preserve each toast's
  // original expiry instead of restarting its timer on every sibling update.
  const latestDismiss = useRef(onDismiss);
  latestDismiss.current = onDismiss;
  useEffect(() => {
    const handle = window.setTimeout(() => latestDismiss.current(), 4500);
    return () => window.clearTimeout(handle);
  }, [toast.id]);
  return <div className="collection-change-toast" role="status"
      aria-live="polite" aria-label="Collection update">
    <span className="collection-toast-symbol" aria-hidden="true">✓</span>
    <span className="collection-toast-copy">
      <strong>{toast.title}</strong><small>{toast.detail}</small>
    </span>
    <button type="button" onClick={onDismiss} aria-label="Dismiss collection notification">×</button>
  </div>;
}
