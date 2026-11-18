import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerOfflineApp, requestOfflineRetention } from './offline';

afterEach(() => vi.unstubAllGlobals());

describe('offline storage retention', () => {
  it('reports persistent only when browser persistence is granted', async () => {
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(true) } });
    expect(await requestOfflineRetention()).toBe('persistent');
  });
  it('never claims persistent storage if denied, rejected, or unsupported', async () => {
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockResolvedValue(false) } });
    expect(await requestOfflineRetention()).toBe('best-effort');
    vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockRejectedValue(new Error('denied')) } });
    expect(await requestOfflineRetention()).toBe('best-effort');
    vi.stubGlobal('navigator', {});
    expect(await requestOfflineRetention()).toBe('best-effort');
  });
});

describe('offline app shell registration', () => {
  function browser(readyState: 'loading' | 'complete') {
    const register = vi.fn().mockResolvedValue({});
    const win = Object.assign(new EventTarget(), { isSecureContext: true });
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', { readyState });
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    return { win, register };
  }

  it('registers after load once when the entry point starts early', async () => {
    const { win, register } = browser('loading');
    const updated = vi.fn();
    win.addEventListener('taiyou-offline-shell-updated', updated);
    registerOfflineApp();
    expect(register).not.toHaveBeenCalled();
    win.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(updated).toHaveBeenCalledOnce());
    expect(register).toHaveBeenCalledWith('/sw.js');
    win.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledOnce();
  });

  it('registers immediately if window.load already happened', async () => {
    const { win, register } = browser('complete');
    const updated = vi.fn();
    win.addEventListener('taiyou-offline-shell-updated', updated);
    registerOfflineApp();
    expect(register).toHaveBeenCalledWith('/sw.js');
    await vi.waitFor(() => expect(updated).toHaveBeenCalledOnce());
  });

  it('does not claim an installed shell when registration fails', async () => {
    const { win, register } = browser('complete');
    register.mockRejectedValueOnce(new Error('registration denied'));
    const updated = vi.fn();
    win.addEventListener('taiyou-offline-shell-updated', updated);
    registerOfflineApp();
    await vi.waitFor(() => expect(register).toHaveBeenCalledOnce());
    // Flush the rejection handler without surfacing an unhandled rejection.
    await Promise.resolve();
    await Promise.resolve();
    expect(updated).not.toHaveBeenCalled();
  });

  it('skips service-worker registration in an insecure context', () => {
    const { win, register } = browser('complete');
    win.isSecureContext = false;
    registerOfflineApp();
    expect(register).not.toHaveBeenCalled();
  });
});
