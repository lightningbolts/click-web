import type { SupabaseClient } from '@supabase/supabase-js';
import { eventStartAtFromMetadata, parseBeaconMetadata } from '@/lib/events/eventMetadata';
import { isTeaserPushDue, teaserHeadline, type TeaserPayload } from '@/lib/events/eventTeasers';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function asPayload(raw: unknown): TeaserPayload | null {
  if (!isRecord(raw) || typeof raw.count !== 'number' || raw.count < 1) return null;
  const label = raw.label;
  if (label !== 'interest' && label !== 'org' && label !== 'people you know') return null;
  return {
    count: raw.count,
    label,
    shared_tag: typeof raw.shared_tag === 'string' ? raw.shared_tag : undefined,
  };
}

export async function runEventTeaserPushes(
  admin: SupabaseClient,
  pushUrl: string,
  authBearer: string,
  nowMs: number = Date.now(),
): Promise<{ scanned: number; pushAttempts: number }> {
  const { data: teasers, error } = await admin
    .from('event_teasers')
    .select('id, beacon_id, recipient_user_id, payload, push_sent_at')
    .is('push_sent_at', null);
  if (error) {
    throw new Error(`event-teaser fetch: ${error.message}`);
  }
  const rows = teasers ?? [];
  if (rows.length === 0) return { scanned: 0, pushAttempts: 0 };

  const beaconIds = [
    ...new Set(
      rows
        .map((r) => (isRecord(r) && typeof r.beacon_id === 'string' ? r.beacon_id : null))
        .filter((id): id is string => !!id),
    ),
  ];
  const { data: beacons } = await admin
    .from('map_beacons')
    .select('id, metadata')
    .in('id', beaconIds)
    .eq('beacon_type', 'event');
  const startByBeacon = new Map<string, number>();
  for (const b of beacons ?? []) {
    if (!isRecord(b) || typeof b.id !== 'string') continue;
    const start = eventStartAtFromMetadata(parseBeaconMetadata(b.metadata));
    if (!start) continue;
    const ms = Date.parse(start);
    if (Number.isFinite(ms)) startByBeacon.set(b.id, ms);
  }

  const recipientIds = [
    ...new Set(
      rows
        .map((r) => (isRecord(r) && typeof r.recipient_user_id === 'string' ? r.recipient_user_id : null))
        .filter((id): id is string => !!id),
    ),
  ];
  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('user_id, event_teaser_push_enabled')
    .in('user_id', recipientIds);
  const allow = new Map<string, boolean>();
  for (const row of prefs ?? []) {
    if (!isRecord(row) || typeof row.user_id !== 'string') continue;
    allow.set(row.user_id, row.event_teaser_push_enabled !== false);
  }

  let pushAttempts = 0;
  const nowIso = new Date(nowMs).toISOString();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== 'string' || typeof row.beacon_id !== 'string') continue;
    if (typeof row.recipient_user_id !== 'string') continue;
    const startMs = startByBeacon.get(row.beacon_id);
    if (startMs == null) continue;
    const pushSentAt = typeof row.push_sent_at === 'string' ? row.push_sent_at : null;
    if (!isTeaserPushDue({ nowMs, startMs, pushSentAt })) continue;
    if (allow.get(row.recipient_user_id) === false) continue;
    const payload = asPayload(row.payload);
    if (!payload) continue;
    const body = teaserHeadline(payload);
    try {
      const response = await fetch(pushUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authBearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient_user_id: row.recipient_user_id,
          title: 'People like you are going',
          body,
          data: {
            type: 'event_teaser',
            beacon_id: row.beacon_id,
            teaser_id: row.id,
          },
        }),
      });
      if (response.ok) {
        pushAttempts += 1;
        await admin.from('event_teasers').update({ push_sent_at: nowIso }).eq('id', row.id);
      }
    } catch (e) {
      console.warn('[event-teasers] push error:', row.id, e);
    }
  }

  return { scanned: rows.length, pushAttempts };
}
