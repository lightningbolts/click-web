import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { parsePassCredential, verifyEventPassToken } from '@/lib/events/eventPass';
import { eventPassKey, isGoing, loadPassHolder } from '@/lib/server/eventPass';
import { insertEngagementEvent, minutesAfterStart } from '@/lib/server/eventEngagement';
import { grantEventHubOnCheckIn } from '@/lib/server/eventHubLifecycle';
import { parseBody } from '@/lib/api/parseBody';
import { passScanBodySchema } from '@/lib/api/schemas/beacons';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type PassScanResult = 'checked_in' | 'already_checked_in' | 'not_going' | 'wrong_event' | 'invalid';

/**
 * POST `{ credential }` — a host (or co-host) scans an attendee's Click Pass at the door.
 *
 * The pass only says who it belongs to; admission is decided here, live: the holder must still
 * be going. A first scan checks them in (the same check-in as on-site, minus the geofence — the
 * host is the proof of presence) and opens the event chat to them; a repeat scan answers
 * `already_checked_in` with the time, so a shared screenshot is caught at the door. Every outcome
 * is a 200 with the holder's name and photo for the host to match against the face in front of them.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ beaconId: string }> }) {
  try {
    const { beaconId } = await params;
    const manager = await requireEventManager(request, beaconId);
    if (!manager.ok) return manager.response;
    const parsed = await parseBody(request, passScanBodySchema);
    if (!parsed.ok) return parsed.response;
    const key = eventPassKey();
    if (!key) return apiError('Click Pass is not configured', 503, 'pass_unavailable');

    const reply = (result: PassScanResult, extra: Record<string, unknown> = {}) =>
      NextResponse.json({ result, attendee: null, checked_in_at: null, ...extra });

    const credential = parsePassCredential(parsed.data.credential);
    if (!credential.ok) return reply('invalid');
    if (credential.beaconId && credential.beaconId !== beaconId.toLowerCase()) return reply('wrong_event');
    const userId = verifyEventPassToken(key, beaconId, credential.token);
    if (!userId) return reply('invalid');

    const { admin } = manager;
    const [holder, going, existing, event] = await Promise.all([
      loadPassHolder(admin, userId),
      isGoing(admin, beaconId, userId),
      admin
        .from('event_check_ins')
        .select('checked_in_at, checked_out_at, check_in_count')
        .eq('beacon_id', beaconId)
        .eq('user_id', userId)
        .maybeSingle(),
      admin.from('map_beacons').select('metadata').eq('id', beaconId).maybeSingle(),
    ]);
    const attendee = { user_id: holder.userId, name: holder.name, avatar_url: holder.avatarUrl };
    if (!going) return reply('not_going', { attendee });

    const row = existing.data as { checked_in_at: string; checked_out_at: string | null; check_in_count: number | null } | null;
    if (row && row.checked_out_at == null) {
      return reply('already_checked_in', { attendee, checked_in_at: row.checked_in_at });
    }

    const nowIso = new Date().toISOString();
    const metadata = (event.data as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {};
    const minutes = minutesAfterStart(metadata);
    const { error } = await admin.from('event_check_ins').upsert(
      {
        user_id: userId,
        beacon_id: beaconId,
        checked_in_at: nowIso,
        checked_out_at: null,
        check_in_count: (row?.check_in_count ?? 0) + 1,
        had_rsvp: true,
        source: 'pass_scan',
        minutes_after_start: minutes,
      },
      { onConflict: 'user_id,beacon_id' },
    );
    if (error) {
      console.error('pass scan check-in:', error.message);
      return apiError('Check-in failed', 500);
    }

    await Promise.all([
      insertEngagementEvent(admin, {
        beacon_id: beaconId,
        user_id: userId,
        venue_id: manager.beacon.venue_id ?? null,
        event_type: 'check_in',
        minutes_after_start: minutes,
        had_rsvp: true,
        source: 'pass_scan',
        metadata: { scanned_by: manager.userId },
      }),
      grantEventHubOnCheckIn(admin, beaconId, userId),
    ]);

    const { count } = await admin
      .from('event_check_ins')
      .select('user_id', { count: 'exact', head: true })
      .eq('beacon_id', beaconId)
      .is('checked_out_at', null);
    return reply('checked_in', { attendee, checked_in_at: nowIso, check_in_count: count ?? 0 });
  } catch (e) {
    console.error('POST /api/beacons/[beaconId]/pass/scan:', e);
    return apiError('Check-in failed', 500);
  }
}
