import type { SupabaseClient } from '@supabase/supabase-js';
import { isActiveIshConnection } from '@/lib/events/attendeeDirectory';
import { eventTitleFromMetadata, parseBeaconMetadata } from '@/lib/events/eventMetadata';
import { sharedEventNudgeCopy } from '@/lib/cron/nudgesReconnect';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function firstNameFromUser(row: Record<string, unknown>): string {
  const first = typeof row.first_name === 'string' ? row.first_name.trim() : '';
  if (first) return first;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (name) return name.split(/\s+/)[0] ?? name;
  return 'a connection';
}

async function sendPush(
  pushUrl: string | null,
  authBearer: string | null,
  recipientUserId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  if (!pushUrl || !authBearer) return false;
  try {
    const response = await fetch(pushUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authBearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_user_id: recipientUserId,
        title,
        body,
        data,
      }),
    });
    return response.ok;
  } catch (e) {
    console.warn('[shared-event-nudge] push error:', recipientUserId, e);
    return false;
  }
}

/**
 * When a user RSVPs or bookmarks an upcoming event, notify existing connections
 * who are also going. Ghost-mode users are excluded from the other person's nudge.
 */
export async function maybeCreateSharedEventNudges(
  admin: SupabaseClient,
  userId: string,
  beaconId: string,
  opts?: { pushUrl?: string | null; authBearer?: string | null },
): Promise<{ created: number; pushAttempts: number }> {
  const { data: beacon } = await admin
    .from('map_beacons')
    .select('id, metadata, beacon_type')
    .eq('id', beaconId)
    .maybeSingle();
  if (!isRecord(beacon) || beacon.beacon_type !== 'event') {
    return { created: 0, pushAttempts: 0 };
  }
  const meta = parseBeaconMetadata(beacon.metadata);
  const title = eventTitleFromMetadata(meta) ?? 'an upcoming event';

  const [{ data: rsvps }, { data: bookmarks }] = await Promise.all([
    admin.from('beacon_attendees').select('user_id').eq('beacon_id', beaconId),
    admin.from('event_bookmarks').select('user_id').eq('beacon_id', beaconId),
  ]);
  const going = new Set<string>();
  for (const row of [...(rsvps ?? []), ...(bookmarks ?? [])]) {
    if (isRecord(row) && typeof row.user_id === 'string') going.add(row.user_id);
  }
  going.add(userId);

  const { data: connections } = await admin
    .from('connections')
    .select('id, user_ids, status, expiry_state')
    .contains('user_ids', [userId]);

  const peers: Array<{ connectionId: string; peerId: string }> = [];
  for (const row of connections ?? []) {
    if (!isRecord(row) || typeof row.id !== 'string' || !Array.isArray(row.user_ids)) continue;
    if (
      !isActiveIshConnection({
        status: typeof row.status === 'string' ? row.status : null,
        expiry_state: typeof row.expiry_state === 'string' ? row.expiry_state : null,
      })
    ) {
      continue;
    }
    const ids = row.user_ids.filter((id): id is string => typeof id === 'string');
    const peerId = ids.find((id) => id !== userId);
    if (!peerId || !going.has(peerId)) continue;
    peers.push({ connectionId: row.id, peerId });
  }
  if (peers.length === 0) return { created: 0, pushAttempts: 0 };

  const involved = [userId, ...peers.map((p) => p.peerId)];
  const { data: users } = await admin
    .from('users')
    .select('id, first_name, name, ghost_mode')
    .in('id', involved);
  const ghost = new Set<string>();
  const nameById = new Map<string, string>();
  for (const row of users ?? []) {
    if (!isRecord(row) || typeof row.id !== 'string') continue;
    if (row.ghost_mode === true) ghost.add(row.id);
    nameById.set(row.id, firstNameFromUser(row));
  }

  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('user_id, reconnect_nudge_push_enabled')
    .in('user_id', involved);
  const allowPush = new Map<string, boolean>();
  for (const row of prefs ?? []) {
    if (!isRecord(row) || typeof row.user_id !== 'string') continue;
    allowPush.set(row.user_id, row.reconnect_nudge_push_enabled !== false);
  }

  let created = 0;
  let pushAttempts = 0;
  const nowIso = new Date().toISOString();

  for (const peer of peers) {
    const pairs: Array<{ recipient: string; other: string }> = [];
    if (!ghost.has(peer.peerId)) {
      pairs.push({ recipient: userId, other: peer.peerId });
    }
    if (!ghost.has(userId)) {
      pairs.push({ recipient: peer.peerId, other: userId });
    }

    for (const { recipient, other } of pairs) {
      const peerName = nameById.get(other) ?? 'a connection';
      const copy = sharedEventNudgeCopy({ peerFirstName: peerName, eventTitle: title });
      const { data: inserted, error } = await admin
        .from('nudges')
        .insert({
          user_id: recipient,
          connection_id: peer.connectionId,
          beacon_id: beaconId,
          nudge_type: 'shared_upcoming_event',
          payload: {
            peer_first_name: peerName,
            event_title: title,
          },
          sent_at: nowIso,
        })
        .select('id')
        .maybeSingle();
      if (error) {
        if (error.code === '23505') continue;
        console.warn('[shared-event-nudge] insert:', error.message);
        continue;
      }
      created += 1;
      if (allowPush.get(recipient) !== false) {
        const sent = await sendPush(opts?.pushUrl ?? null, opts?.authBearer ?? null, recipient, copy.title, copy.body, {
          type: 'shared_upcoming_event',
          connection_id: peer.connectionId,
          beacon_id: beaconId,
          nudge_id: isRecord(inserted) && typeof inserted.id === 'string' ? inserted.id : undefined,
        });
        if (sent) pushAttempts += 1;
      }
    }
  }

  return { created, pushAttempts };
}
