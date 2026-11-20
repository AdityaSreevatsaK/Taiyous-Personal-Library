import { describe, expect, it, vi } from 'vitest';
import { createRequestLimiter, mapWithConcurrency, retryTransientRead } from './network-pool';

describe('bounded private cloud refresh', () => {
  it('preserves results and never exceeds the configured in-flight limit for 1,000 novels', async () => {
    let active = 0, maximum = 0;
    const entries = Array.from({ length: 1000 }, (_, i) => i);
    const output = await mapWithConcurrency(entries, 5, async value => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      await Promise.resolve();
      active--;
      return value * 2;
    });
    expect(maximum).toBeLessThanOrEqual(5);
    expect(maximum).toBe(5);
    expect(active).toBe(0);
    expect(output).toEqual(entries.map(value => value * 2));
  });
  it('does not issue any request on an empty library', async () => {
    const fn = vi.fn(async (_item: number) => 'ok');
    expect(await mapWithConcurrency([], 5, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
  it('retries 429 and 503 reads but never an authorization or malformed-data error', async () => {
    const errors = [new Error('Cloud HTTP 429'), new Error('Cloud HTTP 503')];
    const read = vi.fn(async () => { if (errors.length) throw errors.shift(); return 'restored'; });
    const sleep = vi.fn(async (_delay: number) => {});
    expect(await retryTransientRead(read, 3, sleep)).toBe('restored');
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    const unauthorized = vi.fn(async () => { throw new Error('HTTP 403 forbidden'); });
    await expect(retryTransientRead(unauthorized, 3, sleep)).rejects.toThrow('403');
    expect(unauthorized).toHaveBeenCalledOnce();
  });
  it('stops after the bounded retry budget', async () => {
    const offline = vi.fn(async () => { throw new Error('fetch failed'); });
    await expect(retryTransientRead(offline, 2, async () => {})).rejects.toThrow('fetch failed');
    expect(offline).toHaveBeenCalledTimes(2);
  });
});

describe('lazy private cover request limiter', () => {
  it('runs no more than four cover fetches at once and retains FIFO results', async () => {
    const limited = createRequestLimiter(4);
    let active = 0, peak = 0;
    const pending = Array.from({ length: 40 }, (_, i) => limited(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      await Promise.resolve();
      active--;
      return i;
    }));
    expect(await Promise.all(pending)).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(peak).toBe(4);
    expect(active).toBe(0);
  });
  it('does not strand the queue when a cover download rejects', async () => {
    const limited = createRequestLimiter(1);
    const bad = limited(async () => { throw new Error('cover 503'); });
    const next = limited(async () => 'cached');
    await expect(bad).rejects.toThrow('cover 503');
    await expect(next).resolves.toBe('cached');
  });
  it('rejects unsafe concurrency limits', () => {
    expect(() => createRequestLimiter(0)).toThrow();
    expect(() => createRequestLimiter(33)).toThrow();
  });
});
