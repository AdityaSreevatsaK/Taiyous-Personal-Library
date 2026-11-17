import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './app-dialogs.css';

type DialogOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  initialValue?: string;
  placeholder?: string;
  requiredText?: string;
  maxLength?: number;
};
type DialogValue = boolean | string | null;
type DialogRequest = {
  id: number;
  kind: 'confirm' | 'prompt';
  options: DialogOptions;
  resolve: (value: DialogValue) => void;
};
type DialogApi = {
  confirm: (options: DialogOptions) => Promise<boolean>;
  prompt: (options: DialogOptions) => Promise<string | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useAppDialogs(): DialogApi {
  const dialogs = useContext(DialogContext);
  if (!dialogs) throw new Error('App dialogs must be used inside AppDialogProvider');
  return dialogs;
}

/** One accessible, no-dependency dialog queue for every app-controlled confirmation. */
export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [inputValue, setInputValue] = useState('');
  const active = useRef<DialogRequest | null>(null);
  const queue = useRef<DialogRequest[]>([]);
  const nextId = useRef(1);
  const lastFocus = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const enqueue = useCallback((request: DialogRequest) => {
    if (active.current) {
      queue.current.push(request);
    } else {
      active.current = request;
      setDialog(request);
    }
  }, []);

  const api = useMemo<DialogApi>(() => ({
    confirm: options => new Promise<boolean>(resolve => {
      enqueue({ id: nextId.current++, kind: 'confirm', options,
        resolve: value => resolve(value === true) });
    }),
    prompt: options => new Promise<string | null>(resolve => {
      enqueue({ id: nextId.current++, kind: 'prompt', options,
        resolve: value => resolve(typeof value === 'string' ? value : null) });
    }),
  }), [enqueue]);

  const finish = useCallback((value: DialogValue) => {
    const current = active.current;
    if (!current) return;
    const next = queue.current.shift() || null;
    active.current = next;
    setDialog(next);
    current.resolve(value);
  }, []);

  useEffect(() => {
    if (!dialog) return;
    setInputValue(dialog.options.initialValue || '');
    lastFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Default focus stays on Cancel, never on the potentially destructive action.
    panelRef.current?.querySelector<HTMLElement>('[data-dialog-cancel]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(dialog.kind === 'confirm' ? false : null);
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'
      ));
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault(); nodes[nodes.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) {
        event.preventDefault(); nodes[0].focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocus.current?.focus();
    };
  }, [dialog?.id, finish]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dialog) return;
    if (dialog.kind === 'confirm') {
      finish(true);
    } else if (dialog.options.requiredText && inputValue !== dialog.options.requiredText) {
      return;
    } else {
      finish(inputValue);
    }
  };

  const theme = typeof document === 'undefined' ? 'theme-sepia'
    : (document.querySelector('.details-shell, .reader-shell, .app-shell')
      ?.className.match(/theme-[a-z-]+/)?.[0] || 'theme-sepia');

  return <DialogContext.Provider value={api}>
    {children}
    {dialog && createPortal(
      <div className={'app-dialog-overlay ' + theme}
        onMouseDown={event => {
          if (event.target === event.currentTarget) finish(dialog.kind === 'confirm' ? false : null);
        }}>
        <section className="app-dialog" role="dialog" aria-modal="true"
          aria-labelledby="app-dialog-title" aria-describedby={dialog.options.message ? 'app-dialog-message' : undefined}
          ref={panelRef}>
          <button className="app-dialog-close" type="button" aria-label="Close dialog"
            onClick={() => finish(dialog.kind === 'confirm' ? false : null)}><X size={18}/></button>
          <h2 id="app-dialog-title">{dialog.options.title}</h2>
          {dialog.options.message && <p id="app-dialog-message">{dialog.options.message}</p>}
          <form onSubmit={submit}>
            {dialog.kind === 'prompt' && <>
              <label htmlFor="app-dialog-input">{dialog.options.requiredText
                ? 'Type ' + dialog.options.requiredText + ' to confirm'
                : 'New value'}</label>
              <input id="app-dialog-input" value={inputValue} autoComplete="off"
                maxLength={dialog.options.maxLength || 255} placeholder={dialog.options.placeholder}
                onChange={event => setInputValue(event.target.value)}/>
            </>}
            <div className="app-dialog-actions">
              <button type="button" data-dialog-cancel className="app-dialog-cancel"
                onClick={() => finish(dialog.kind === 'confirm' ? false : null)}>
                {dialog.options.cancelLabel || 'Cancel'}
              </button>
              <button type="submit" className={dialog.options.destructive ? 'app-dialog-confirm destructive' : 'app-dialog-confirm'}
                disabled={dialog.kind === 'prompt' &&
                  (dialog.options.requiredText ? inputValue !== dialog.options.requiredText : !inputValue.trim())}>
                {dialog.options.confirmLabel || (dialog.kind === 'confirm' ? 'Confirm' : 'Save')}
              </button>
            </div>
          </form>
        </section>
      </div>, document.body
    )}
  </DialogContext.Provider>;
}
