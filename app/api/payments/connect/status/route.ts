import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/withAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import {
  loadOrganizerAccount,
  syncOrganizerAccount,
  type OrganizerAccountRow,
} from '@/lib/server/ticketing/connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYNC_STALENESS_MS = 60_000;

function projection(row: OrganizerAccountRow) {
  return {
    onboarding_state: row.onboarding_state,
    charges_enabled: row.charges_enabled,
    payouts_enabled: row.payouts_enabled,
    transfers_enabled: row.transfers_enabled,
    requirements_currently_due_count: row.requirements_currently_due_count,
    can_sell:
      row.onboarding_state === 'ready' &&
      row.transfers_enabled &&
      row.charges_enabled &&
      row.payouts_enabled,
  };
}

/**
 * Normalized payout readiness for the signed-in organizer. Refreshes from
 * Stripe when local state is stale (e.g. right after the browser return);
 * account.updated webhooks keep it fresh otherwise.
 */
export async function GET(request: NextRequest) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabaseClient();
  let row = await loadOrganizerAccount(admin, auth.user.id);
  if (!row) {
    return NextResponse.json({ onboarding_state: 'not_started', can_sell: false });
  }

  const syncedAt = row.last_stripe_sync_at ? Date.parse(row.last_stripe_sync_at) : 0;
  const stale = Date.now() - syncedAt > SYNC_STALENESS_MS;
  const forceSync = request.nextUrl.searchParams.get('sync') === '1';
  if (stale || forceSync) {
    try {
      row = await syncOrganizerAccount(admin, row);
    } catch (e) {
      console.error('Connect status sync failed:', e);
      return NextResponse.json(
        { error: 'Could not refresh payout readiness', can_sell: false },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(projection(row));
}
