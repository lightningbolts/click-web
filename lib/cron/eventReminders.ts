import type { SupabaseClient } from '@supabase/supabase-js';

type EventBeaconRow = {
  id: string;
  creator_id: string | null;
  metadata: Record<string, unknown> | null;
};

export type ReminderKind = 'day_of' | 'thirty_min' | 'recap_ready';

const THIRTY_MIN_MS = 30 * 60 * 1000;

function parseEpochMs(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw.trim());
  return Number.isFinite(ms) ? ms : null;
}

function metadataFlag(meta: Record<string, unknown>, key: string): boolean {
  return meta[key] === true || meta[key] === 'true';
}

function calendarDateInZone(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  }
}

function reminderTimeZone(meta: Record<string, unknown>): string {
  const raw = meta.event_timezone ?? meta.eventTimezone;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return 'UTC';
}

function thirtyMinAlreadySent(meta: Record<string, unknown>): boolean {
  return (
    metadataFlag(meta, 'thirty_min_notification_sent') ||
    metadataFlag(meta, 'one_hour_notification_sent')
  );
}

/** Due kinds for a single event at [nowMs]. Independent of sweep alignment. */
export function dueReminderKinds(args: {
  nowMs: number;
  startMs: number;
  endMs: number;
  metadata: Record<string, unknown>;
}): ReminderKind[] {
  const { nowMs, startMs, endMs, metadata } = args;
  if (endMs <= nowMs) {
    if (!metadataFlag(metadata, 'recap_notification_sent')) return ['recap_ready'];
    return [];
  }

  const kinds: ReminderKind[] = [];
  const tz = reminderTimeZone(metadata);
  if (
    !metadataFlag(metadata, 'day_of_notification_sent') &&
    calendarDateInZone(nowMs, tz) === calendarDateInZone(startMs, tz)
  ) {
    kinds.push('day_of');
  }
  if (!thirtyMinAlreadySent(metadata) && nowMs >= startMs - THIRTY_MIN_MS && nowMs < endMs) {
    kinds.push('thirty_min');
  }
  return kinds;
}

function sentKeyForKind(kind: ReminderKind): string {
  if (kind === 'day_of') return 'day_of_notification_sent';
  if (kind === 'thirty_min') return 'thirty_min_notification_sent';
  return 'recap_notification_sent';
}

async function recipientIdsForKind(
  admin: SupabaseClient,
  beaconId: string,
  kind: ReminderKind,
  creatorId: string,
): Promise<string[]> {
  if (kind !== 'recap_ready') return [creatorId];
  const [{ data: rsvps }, { data: checkIns }] = await Promise.all([
    admin.from('beacon_attendees').select('user_id').eq('beacon_id', beaconId),
    admin.from('event_check_ins').select('user_id').eq('beacon_id', beaconId),
  ]);
  const ids = new Set<string>();
  for (const row of [...(rsvps ?? []), ...(checkIns ?? [])]) {
    if (row && typeof row === 'object' && 'user_id' in row && typeof row.user_id === 'string') {
      ids.add(row.user_id);
    }
  }
  if (ids.size === 0) ids.add(creatorId);
  return [...ids];
}

/** Hourly sweep: event beacons → day-of and 30-minutes-before push notifications. */
export async function runEventReminders(
  admin: SupabaseClient,
  pushUrl: string,
  authBearer: string,
  nowMs: number = Date.now(),
): Promise<{ scanned: number; pushAttempts: number }> {
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
    if (startMs == null || endMs == null) continue;

    const description =
      (typeof meta.description === 'string' && meta.description.trim()) ||
      (typeof meta.text === 'string' && meta.text.trim()) ||
      'Your event';

    const kinds = dueReminderKinds({ nowMs, startMs, endMs, metadata: meta });
    let nextMeta = { ...meta };

    for (const kind of kinds) {
      const creatorId = row.creator_id?.trim();
      if (!creatorId || !pushUrl) continue;

      const title =
        kind === 'day_of' ? 'Event today' : kind === 'thirty_min' ? 'Event starting soon' : 'Your event recap is ready';
      const body =
        kind === 'day_of'
          ? `${description.slice(0, 80)} starts today — tap to view on the map.`
          : kind === 'thirty_min'
            ? `${description.slice(0, 80)} starts in about 30 minutes.`
            : `See who you met at ${description.slice(0, 80)}.`;

      const recipients = await recipientIdsForKind(admin, row.id, kind, creatorId);
      let anyOk = false;
      for (const recipientId of recipients) {
        try {
          const response = await fetch(pushUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${authBearer}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              recipient_user_id: recipientId,
              title,
              body,
              data: {
                type: kind === 'recap_ready' ? 'event_recap' : 'event_reminder',
                beacon_id: row.id,
                reminder_kind: kind,
              },
            }),
          });
          if (response.ok) {
            pushAttempts += 1;
            anyOk = true;
          }
        } catch (e) {
          console.warn('[event-reminders] push error:', row.id, kind, e);
        }
      }
      if (anyOk) {
        const sentKey = sentKeyForKind(kind);
        nextMeta = { ...nextMeta, [sentKey]: true };
        await admin.from('map_beacons').update({ metadata: nextMeta }).eq('id', row.id);
      }
    }
  }

  return { scanned: rows.length, pushAttempts };
}
