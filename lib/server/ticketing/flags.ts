import 'server-only';

import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';

/**
 * Rollout gate for ticketed events. Off by default: routes exist and can be
 * exercised in staging/test mode with TICKETING_ENABLED=true while the
 * production launch prerequisites (bank account, live Connect settings,
 * webhook secrets) are completed.
 */
export function ticketingEnabled(): boolean {
  return (process.env.TICKETING_ENABLED?.trim() || '').toLowerCase() === 'true';
}

export function requireTicketingEnabled(): NextResponse | null {
  if (ticketingEnabled()) return null;
  return apiError('Ticketing is not enabled', 403, 'ticketing_disabled');
}
