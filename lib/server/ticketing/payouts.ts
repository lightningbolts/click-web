import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadOrganizerAccount } from '@/lib/server/ticketing/connect';

/**
 * The event creator's payout account when it can take transfers, else null. Paid sales always
 * pay out to the creator, never to the co-host or Place manager who opened them.
 */
export async function readyPayoutAccount(admin: SupabaseClient, creatorId: string): Promise<string | null> {
  const account = await loadOrganizerAccount(admin, creatorId);
  return account && account.onboarding_state === 'ready' && account.transfers_enabled ? account.id : null;
}

/**
 * A paid ticket going on sale on an event that's already selling: attach the creator's payout
 * account (checkout needs it), or say payouts aren't set up. Returns false to refuse.
 */
export async function attachPayoutAccount(admin: SupabaseClient, beaconId: string, creatorId: string): Promise<boolean> {
  const accountId = await readyPayoutAccount(admin, creatorId);
  if (!accountId) return false;
  const { error } = await admin.from('map_beacons').update({ organizer_payment_account_id: accountId }).eq('id', beaconId);
  if (error) throw new Error(`payout account attach failed: ${error.message}`);
  return true;
}
