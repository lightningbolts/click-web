/**
 * Rollout gate for ticketed events. Off by default: routes exist and can be
 * exercised in staging/test mode with TICKETING_ENABLED=true while the
 * production launch prerequisites (bank account, live Connect settings,
 * webhook secrets) are completed.
 *
 * Dependency-free so shared loaders (the event payload) can read it in any runtime.
 */
export function ticketingEnabled(): boolean {
  return (process.env.TICKETING_ENABLED?.trim() || '').toLowerCase() === 'true';
}
