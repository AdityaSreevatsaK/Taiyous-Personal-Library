/** A fixed-size async worker pool keeps private HF requests bounded during refresh. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[], requestedLimit: number, operation: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 32) {
    throw new Error('Invalid cloud concurrency limit');
  }
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(requestedLimit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await operation(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Retry only read-type operations on transient network or server failures. */
export async function retryTransientRead<T>(
  read: () => Promise<T>,
  attempts = 3,
  sleep: (delayMs: number) => Promise<void> =
    ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<T> {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 4) throw Error('Invalid retry budget');
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { return await read(); } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      const transient = /\b(?:408|429|500|502|503|504)\b|network error|failed to fetch|fetch failed|timeout|network request failed/i.test(message);
      if (!transient || attempt === attempts - 1) throw reason;
      await sleep(300 * 2 ** attempt);
    }
  }
  throw new Error('Retry exhausted');
}
