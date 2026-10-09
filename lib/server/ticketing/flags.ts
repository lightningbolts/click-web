import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { ticketingEnabled } from '@/lib/server/ticketing/enabled';

export { ticketingEnabled };

function ticketingDisabled(): NextResponse {
  return apiError('Ticketing is not enabled', 403, 'ticketing_disabled');
}

/** Selling, organizing and refunding: only while ticketing is on. */
export function requireTicketingEnabled(): NextResponse | null {
  return ticketingEnabled() ? null : ticketingDisabled();
}

/** The user holds at least one ticket (any state), so their wallet has something to show. */
export async function holdsTickets(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.from('tickets').select('id').eq('owner_user_id', userId).limit(1);
  if (error) throw new Error(`tickets lookup failed: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * The wallet (reading your own tickets and their passes) stays open to anyone who holds tickets,
 * so turning sales off never strands a ticket someone already has. For everyone else it's as dark
 * as the rest of ticketing.
 */
export async function hasTicketWallet(admin: SupabaseClient, userId: string): Promise<boolean> {
  return ticketingEnabled() || (await holdsTickets(admin, userId));
}

export async function requireTicketWallet(admin: SupabaseClient, userId: string): Promise<NextResponse | null> {
  return (await hasTicketWallet(admin, userId)) ? null : ticketingDisabled();
}
