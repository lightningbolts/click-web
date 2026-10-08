import type { SupabaseClient } from '@supabase/supabase-js';
import { insertEngagementEvent, minutesAfterStart } from '@/lib/server/eventEngagement';
import { grantEventHubOnCheckIn } from '@/lib/server/eventHubLifecycle';

export type DoorCheckInSource = 'pass_scan' | 'ticket_scan';

/**
 * Checks a guest in at the door: the same check-in as on-site, minus the geofence (the host
 * scanning is the proof of presence). Records the engagement event, opens the event chat to
 * them, and returns how many people are here now. `priorCount` skips a re-read when the caller
 * already loaded the guest's check-in row.
 */
export async function recordDoorCheckIn(
  admin: SupabaseClient,
  args: {
    beaconId: string;
    userId: string;
    venueId: string | null;
    scannedBy: string;
    source: DoorCheckInSource;
    priorCount?: number;
  },
): Promise<{ checkedInAt: string; hereNow: number }> {
  const { beaconId, userId } = args;
  const [prior, event] = await Promise.all([
    args.priorCount !== undefined
      ? Promise.resolve({ data: { check_in_count: args.priorCount }, error: null })
      : admin.from('event_check_ins').select('check_in_count').eq('beacon_id', beaconId).eq('user_id', userId).maybeSingle(),
    admin.from('map_beacons').select('metadata').eq('id', beaconId).maybeSingle(),
  ]);
  if (prior.error || event.error) {
    throw new Error(`door check-in lookup failed: ${prior.error?.message ?? event.error?.message}`);
  }

  const checkedInAt = new Date().toISOString();
  const metadata = (event.data as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {};
  const minutes = minutesAfterStart(metadata);
  const priorCount = (prior.data as { check_in_count: number | null } | null)?.check_in_count ?? 0;
  const { error } = await admin.from('event_check_ins').upsert(
    {
      user_id: userId,
      beacon_id: beaconId,
      checked_in_at: checkedInAt,
      checked_out_at: null,
      check_in_count: priorCount + 1,
      had_rsvp: true,
      source: args.source,
      minutes_after_start: minutes,
    },
    { onConflict: 'user_id,beacon_id' },
  );
  if (error) throw new Error(`door check-in failed: ${error.message}`);

  await Promise.all([
    insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: userId,
      venue_id: args.venueId,
      event_type: 'check_in',
      minutes_after_start: minutes,
      had_rsvp: true,
      source: args.source,
      metadata: { scanned_by: args.scannedBy },
    }),
    grantEventHubOnCheckIn(admin, beaconId, userId),
  ]);

  const { count } = await admin
    .from('event_check_ins')
    .select('user_id', { count: 'exact', head: true })
    .eq('beacon_id', beaconId)
    .is('checked_out_at', null);
  return { checkedInAt, hereNow: count ?? 0 };
}
