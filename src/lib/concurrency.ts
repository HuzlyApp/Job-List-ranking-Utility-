/**
 * Run async work over items with a hard concurrency ceiling.
 * Releases the permit in `finally` so failures cannot leak slots.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (err) {
        // Re-throw after releasing the logical slot (loop continues for others via other workers).
        // For per-item error isolation, the worker itself should catch.
        throw err;
      }
    }
  }

  const runners = Array.from({ length: limit }, () => runWorker());
  await Promise.all(runners);
  return results;
}

/**
 * Like mapWithConcurrency, but never rejects the overall run:
 * each item returns `{ ok, value }` or `{ ok: false, error }`.
 */
export async function mapWithConcurrencySettled<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<Array<{ index: number; ok: true; value: R } | { index: number; ok: false; error: unknown }>> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<
    { index: number; ok: true; value: R } | { index: number; ok: false; error: unknown }
  >(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        const value = await worker(items[index], index);
        results[index] = { index, ok: true, value };
      } catch (error) {
        results[index] = { index, ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with full jitter. Honors Retry-After seconds when provided. */
export function computeBackoffMs(
  attempt: number,
  opts?: { baseMs?: number; maxMs?: number; retryAfterSeconds?: number | null }
): number {
  if (opts?.retryAfterSeconds != null && opts.retryAfterSeconds > 0) {
    return Math.min(opts.retryAfterSeconds * 1000, opts.maxMs ?? 60_000);
  }
  const base = opts?.baseMs ?? 1000;
  const max = opts?.maxMs ?? 30_000;
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt));
  return Math.floor(Math.random() * exp);
}
