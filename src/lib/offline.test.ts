import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestOfflineRetention } from './offline';

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
