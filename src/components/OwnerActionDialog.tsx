import { useEffect, useState, type FormEvent } from 'react';
import { LockKeyhole, ShieldCheck, ShieldAlert, X } from 'lucide-react';
import { getOwnerStatus, ownerPost, type OwnerStatus } from '../lib/owner';
import type { ReaderTheme } from '../types';

export interface OwnerRemovalRequest {
  kind: 'local-novel' | 'collection';
  id: string;
  title: string;
}

interface Props {
  theme: ReaderTheme;
  request: OwnerRemovalRequest;
  onCancel: () => void;
  onConfirm: (request: OwnerRemovalRequest) => Promise<void>;
}

const messages: Record<OwnerRemovalRequest['kind'], { title: string; description: string; button: string }> = {
  'local-novel': {
    title: 'Remove local novel',
    description: 'Permanently removes this novel, its EPUB, cover and saved local reading position from this device. This operation cannot be undone here.',
    button: 'Delete local novel',
  },
  'collection': {
    title: 'Delete collection',
    description: 'Removes this collection from your synced library. The novels themselves, their progress and ratings remain.',
    button: 'Delete collection',
  },
};

export default function OwnerActionDialog({ theme, request, onCancel, onConfirm }: Props) {
  const [status, setStatus] = useState<OwnerStatus | null>(null);
  const [error, setError] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [titleEntry, setTitleEntry] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setStatus(null); setError(''); setPassphrase(''); setTitleEntry('');
    void getOwnerStatus().then(value => {
      if (active) setStatus(value);
    }).catch(reason => { if (active) setError(String(reason instanceof Error ? reason.message : reason)); });
    return () => { active = false; };
  }, [request.id, request.kind]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onCancel, busy]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy || passphrase.length < 16) return;
    setBusy(true); setError('');
    try {
      const result = await ownerPost('unlock', passphrase);
      setStatus(result);
      setPassphrase('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (busy || !status?.unlocked || titleEntry !== request.title) return;
    setBusy(true); setError('');
    try {
      // A fresh server check is required even when React remembers Owner mode.
      await ownerPost('verify');
      await onConfirm(request);
      onCancel();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      if (/expired|locked|owner mode/i.test(message)) setStatus(previous => previous ? { ...previous, unlocked: false } : null);
    } finally { setBusy(false); }
  }

  const content = messages[request.kind];
  return <div className={`owner-dialog-shade theme-${theme}`}>
    <section className="owner-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-dialog-title">
      <button type="button" className="owner-close icon-button" aria-label="Cancel owner action" disabled={busy} onClick={onCancel}><X size={19} /></button>
      <div className="owner-dialog-icon"><LockKeyhole size={22} /></div>
      <span className="section-overline">PROTECTED OWNER OPERATION</span>
      <h2 id="owner-dialog-title">{content.title}</h2>
      <p className="owner-target">{request.title}</p>
      <p className="owner-description">{content.description}</p>
      {!status && !error && <p role="status">Checking owner access…</p>}
      {status && !status.configured && <div className="owner-warning">
        <ShieldAlert size={17} /><span>Owner mode is not configured. Add a strong <code>TAIYOU_OWNER_PASSPHRASE</code> as a <strong>Secret</strong> under Cloudflare Pages → Settings → Variables and Secrets → Production. Removal stays locked until then.</span>
      </div>}
      {status?.configured && !status.unlocked && <form className="owner-unlock-form" onSubmit={event => void unlock(event)}>
        <p>Sign in to Owner mode using the separate private passphrase configured in Cloudflare. Your Hugging Face owner session is also required.</p>
        <label htmlFor="taiyou-owner-passphrase">Owner passphrase</label>
        <input id="taiyou-owner-passphrase" type="password" value={passphrase} autoComplete="off"
          maxLength={256} onChange={event => setPassphrase(event.target.value)} placeholder="Enter your Owner mode passphrase" />
        <button className="primary-button" type="submit" disabled={busy || passphrase.length < 16}>
          <ShieldCheck size={17} /> {busy ? 'Unlocking…' : 'Unlock Owner mode'}
        </button>
      </form>}
      {status?.unlocked && <form className="owner-confirm-form" onSubmit={event => void confirm(event)}>
        <p><ShieldCheck size={16} /> Owner mode unlocked temporarily. To approve this specific operation, type the exact title below.</p>
        <label htmlFor="taiyou-owner-title">Confirm title</label>
        <input id="taiyou-owner-title" type="text" value={titleEntry} autoComplete="off"
          onChange={event => setTitleEntry(event.target.value)} placeholder={request.title} />
        <div className="owner-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="owner-danger-button" type="submit" disabled={busy || titleEntry !== request.title}>
            {busy ? 'Verifying…' : content.button}
          </button>
        </div>
      </form>}
      {error && <p className="owner-error" role="alert">{error}</p>}
      {!status?.unlocked && <button type="button" className="owner-cancel-text" disabled={busy} onClick={onCancel}>Cancel, keep everything</button>}
    </section>
  </div>;
}
