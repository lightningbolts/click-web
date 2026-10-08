import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { EVENT_BEACON_UUID_RE } from '@/lib/events/eventMetadata';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { revalidatePublicEvents } from '@/lib/server/events/revalidatePublicEvents';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { updateTierBodySchema } from '@/lib/api/schemas/ticketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ beaconId: string; tierId: string }> };

const EDIT_REFUSALS: Record<string, string> = {
  capacity_below_sold: "Capacity can't go below tickets already sold",
  price_kind_locked: "This ticket has sales, so it can't switch between free and paid",
  invalid_window: 'Sales must end after they start',
};

/** The tier when it belongs to this event and isn't archived. */
async function loadOwnTier(admin: SupabaseClient, beaconId: string, tierId: string): Promise<boolean> {
  if (!EVENT_BEACON_UUID_RE.test(tierId)) return false;
  const { data, error } = await admin
    .from('ticket_tiers')
    .select('id, beacon_id, archived_at')
    .eq('id', tierId)
    .maybeSingle();
  if (error) throw new Error(`ticket tier load failed: ${error.message}`);
  const tier = data as { beacon_id: string; archived_at: string | null } | null;
  return tier != null && tier.beacon_id === beaconId && tier.archived_at == null;
}

/** Organizer edits a tier; the database refuses edits that would break sold tickets. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId, tierId } = await params;
  const manager = await requireEventManager(request, beaconId);
  if (!manager.ok) return manager.response;

  const parsed = await parseBody(request, updateTierBodySchema);
  if (!parsed.ok) return parsed.response;

  if (!(await loadOwnTier(manager.admin, beaconId, tierId))) return apiError('Ticket not found', 404);

  const { data, error } = await manager.admin.rpc('ticketing_update_tier', { p_tier: tierId, p_patch: parsed.data });
  if (error) {
    console.error('ticketing_update_tier failed:', error.message);
    return apiError('Failed to update ticket', 500);
  }
  const result = data as { ok: boolean; code?: string; sold?: number };
  if (!result.ok) {
    const code = result.code ?? 'update_rejected';
    if (code === 'tier_not_found') return apiError('Ticket not found', 404);
    return NextResponse.json(
      { error: EDIT_REFUSALS[code] ?? 'Ticket could not be updated', code, ...(result.sold != null ? { sold: result.sold } : {}) },
      { status: 409 },
    );
  }

  revalidatePublicEvents(beaconId);
  return NextResponse.json({ ok: true });
}

/** Removes a tier nobody has ordered; a tier with order history is archived so receipts keep it. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId, tierId } = await params;
  const manager = await requireEventManager(request, beaconId);
  if (!manager.ok) return manager.response;
  const admin = manager.admin;

  if (!(await loadOwnTier(admin, beaconId, tierId))) return apiError('Ticket not found', 404);

  const { count, error: countError } = await admin
    .from('ticket_order_items')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_tier_id', tierId);
  if (countError) {
    console.error('ticket tier order check failed:', countError.message);
    return apiError('Failed to delete ticket', 500);
  }

  const deleted = count ? 'archived' : 'removed';
  const { error } = count
    ? await admin.from('ticket_tiers').update({ archived_at: new Date().toISOString(), is_active: false }).eq('id', tierId)
    : await admin.from('ticket_tiers').delete().eq('id', tierId);
  if (error) {
    console.error('ticket tier delete failed:', error.message);
    return apiError('Failed to delete ticket', 500);
  }

  revalidatePublicEvents(beaconId);
  return NextResponse.json({ deleted });
}
