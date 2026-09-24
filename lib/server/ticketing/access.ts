import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { memberIsInvited } from '@/lib/events/eventRsvpPolicy';
export async function mayViewTicketing(admin: SupabaseClient, beaconId: string, userId?: string) {
  const { data, error } = await admin
    .from('map_beacons')
    .select('id, creator_id, event_visibility, beacon_type')
    .eq('id', beaconId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.beacon_type !== 'event') return false;
  return (
    data.event_visibility !== 'invite_only' ||
    (!!userId && (data.creator_id === userId || (await memberIsInvited(admin, beaconId, userId))))
  );
}
