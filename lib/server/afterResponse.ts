import { after } from 'next/server';

/**
 * Runs work after the response is sent without letting the runtime drop it. On Cloudflare
 * (OpenNext) `after` is backed by `waitUntil`; a bare `void promise` can be cancelled once the
 * response returns, which silently loses encounter enrichment (geocode, weather, altitude).
 * Outside a request scope (tests, scripts) `after` throws, so the task runs fire-and-forget.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  const run = () =>
    task().catch((error: unknown) => {
      console.warn(`[${label}] background task failed:`, error);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}
