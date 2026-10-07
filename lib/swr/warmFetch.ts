/**
 * Read-ahead for SWR keys: start a fetch on intent (hover, touch, focus) and let the screen that
 * opens next use it. Unlike SWR's `preload`, a warmed read expires, so a link hovered long ago
 * never stands in for a fresh read.
 */

/** A warmed read must be this fresh to stand in for opening the screen. */
export const WARM_TTL_MS = 10_000;

const warmed = new Map<string, { at: number; read: Promise<unknown> }>();

/** Starts `fetcher(key)` unless a fresh read of `key` is already under way. */
export function warmFetch<T>(key: string, fetcher: (key: string) => Promise<T>, nowMs = Date.now()): void {
  const existing = warmed.get(key);
  if (existing && nowMs - existing.at < WARM_TTL_MS) return;
  const read = fetcher(key);
  read.catch(() => {
    if (warmed.get(key)?.read === read) warmed.delete(key);
  });
  warmed.set(key, { at: nowMs, read });
}

/** `fetcher`, answered by a fresh warmed read when there is one (each read is used once). */
export function withWarmFetch<T>(fetcher: (key: string) => Promise<T>): (key: string) => Promise<T> {
  return (key) => {
    const entry = warmed.get(key);
    warmed.delete(key);
    return entry && Date.now() - entry.at < WARM_TTL_MS ? (entry.read as Promise<T>) : fetcher(key);
  };
}
