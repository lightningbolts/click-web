import type { SupabaseClient } from '@supabase/supabase-js';

type EventBeaconRow = {
  id: string;
  creator_id: string | null;
  metadata: Record<string, unknown> | null;
};

function parseEpochMs(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw.trim());
  return Number.isFinite(ms) ? ms : null;
}

function metadataFlag(meta: Record<string, unknown>, key: string): boolean {
  return meta[key] === true || meta[key] === 'true';
}

/** Hourly sweep: event beacons → day-of and one-hour-before push notifications. */
export async function runEventReminders(
  admin: SupabaseClient,
  pushUrl: string,
  authBearer: string,
  nowMs: number = Date.now(),
): Promise<{ scanned: number; pushAttempts: number }> {
  const windowMs = 15 * 60 * 1000;

  const { data, error } = await admin
    .from('map_beacons')
    .select('id, creator_id, metadata')
    .eq('beacon_type', 'event');

  if (error) {
    throw new Error(`event-reminders fetch: ${error.message}`);
  }

  const rows = (data ?? []) as EventBeaconRow[];
  let pushAttempts = 0;

  for (const row of rows) {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const startMs = parseEpochMs(meta.event_start_at ?? meta.eventStartAt);
    const endMs = parseEpochMs(meta.event_end_at ?? meta.eventEndAt);
    if (startMs == null || endMs == null || endMs <= nowMs) continue;

    const description =
      (typeof meta.description === 'string' && meta.description.trim()) ||
      (typeof meta.text === 'string' && meta.text.trim()) ||
      'Your event';

    const dayOfStart = Math.floor(startMs / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000;
    const kinds: Array<'day_of' | 'one_hour'> = [];
    if (nowMs >= dayOfStart && nowMs < dayOfStart + windowMs) kinds.push('day_of');
    const oneHourBefore = startMs - 60 * 60 * 1000;
    if (nowMs >= oneHourBefore && nowMs < oneHourBefore + windowMs) kinds.push('one_hour');

    for (const kind of kinds) {
      const sentKey = kind === 'day_of' ? 'day_of_notification_sent' : 'one_hour_notification_sent';
      if (metadataFlag(meta, sentKey)) continue;

      const creatorId = row.creator_id?.trim();
      if (!creatorId || !pushUrl) continue;

      const title = kind === 'day_of' ? 'Event today' : 'Event starting soon';
      const body =
        kind === 'day_of'
          ? `${description.slice(0, 80)} starts today — tap to view on the map.`
          : `${description.slice(0, 80)} starts in about an hour.`;

      try {
        const response = await fetch(pushUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authBearer}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient_user_id: creatorId,
            title,
            body,
            data: {
              type: 'event_reminder',
              beacon_id: row.id,
              reminder_kind: kind,
            },
          }),
        });
        if (response.ok) {
          pushAttempts += 1;
          const nextMeta = { ...meta, [sentKey]: true };
          await admin.from('map_beacons').update({ metadata: nextMeta }).eq('id', row.id);
        }
      } catch (e) {
        console.warn('[event-reminders] push error:', row.id, kind, e);
      }
    }
  }

  return { scanned: rows.length, pushAttempts };
}
