import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { publicOrigin } from '@/lib/events/eventUrls';

export type CheckInAnchor = { id: string; name: string; check_in_url: string };

/**
 * Active check-in QR anchors for the printable poster (spec §9.5). The token appears only in the
 * check-in URL the poster encodes; never in share links. Empty until the Place has a slug.
 */
export async function loadCheckInAnchors(admin: SupabaseClient, place: { id: string; slug: string | null }): Promise<CheckInAnchor[]> {
  if (!place.slug) return [];
  const { data, error } = await admin
    .from('nfc_anchors')
    .select('id, name, qr_token')
    .eq('venue_id', place.id)
    .eq('purpose', 'check_in')
    .eq('active', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`anchors: ${error.message}`);
  const base = publicOrigin();
  return ((data ?? []) as Array<{ id: string; name: string | null; qr_token: string }>).map((a) => ({
    id: a.id,
    name: a.name ?? 'Check-in code',
    check_in_url: `${base}/p/${place.slug}?t=${encodeURIComponent(a.qr_token)}`,
  }));
}
