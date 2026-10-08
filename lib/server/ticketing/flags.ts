import 'server-only';

import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { ticketingEnabled } from '@/lib/server/ticketing/enabled';

export { ticketingEnabled };

export function requireTicketingEnabled(): NextResponse | null {
  if (ticketingEnabled()) return null;
  return apiError('Ticketing is not enabled', 403, 'ticketing_disabled');
}
