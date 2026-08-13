import type { SupabaseClient } from '@supabase/supabase-js';

type IntentRow = {
  id: string;
  user_id: string;
  timeframe: string;
  intent_tag: string;
  expires_at: string;
};

type ConnectionRow = {
  id: string;
  user_ids: string[] | null;
  should_continue?: boolean[] | null;
  expiry_state?: string | null;
  status?: string | null;
};

export function parseIntentRange(timeframe: string): { start: number; end: number } | null {
  const parts = timeframe.split('/');
  if (parts.length !== 2) return null;
  const start = Date.parse(parts[0].trim());
  const end = Date.parse(parts[1].trim());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

export function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

export function normalizeIntentTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function isMutuallyKept(row: ConnectionRow): boolean {
  const sc = row.should_continue;
  if (Array.isArray(sc) && sc.length >= 2 && sc[0] === true && sc[1] === true) {
    return true;
  }
  return row.expiry_state === 'kept';
}

function orderedIntentIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export type AvailabilityMatch = {
  intent_tag: string;
  user_a: string;
  user_b: string;
  intent_id_a: string;
  intent_id_b: string;
  connection_id: string;
};

/** Pure matcher used by cron + unit tests. */
export function findAvailabilityMatches(args: {
  intents: IntentRow[];
  connections: ConnectionRow[];
}): AvailabilityMatch[] {
  const { intents, connections } = args;
  const peerToConnection = new Map<string, string>();
  for (const row of connections) {
    if (row.status === 'archived' || row.status === 'removed') continue;
    if (!isMutuallyKept(row)) continue;
    const ids = (row.user_ids ?? []).map((id) => id.trim()).filter(Boolean);
    if (ids.length !== 2) continue;
    const [a, b] = ids[0] < ids[1] ? [ids[0], ids[1]] : [ids[1], ids[0]];
    peerToConnection.set(`${a}|${b}`, row.id);
  }

  const matches: AvailabilityMatch[] = [];
  const seenPair = new Set<string>();

  for (let i = 0; i < intents.length; i += 1) {
    const mine = intents[i];
    const myRange = parseIntentRange(mine.timeframe);
    const myTag = normalizeIntentTag(mine.intent_tag);
    if (!myRange || !myTag) continue;

    for (let j = i + 1; j < intents.length; j += 1) {
      const theirs = intents[j];
      if (theirs.user_id === mine.user_id) continue;
      if (normalizeIntentTag(theirs.intent_tag) !== myTag) continue;
      const theirRange = parseIntentRange(theirs.timeframe);
      if (!theirRange || !rangesOverlap(myRange, theirRange)) continue;

      const [lo, hi] =
        mine.user_id < theirs.user_id
          ? [mine.user_id, theirs.user_id]
          : [theirs.user_id, mine.user_id];
      const connectionId = peerToConnection.get(`${lo}|${hi}`);
      if (!connectionId) continue;

      const [idLo, idHi] = orderedIntentIds(mine.id, theirs.id);
      const key = `${idLo}|${idHi}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);

      matches.push({
        intent_tag: mine.intent_tag.trim(),
        user_a: mine.user_id,
        user_b: theirs.user_id,
        intent_id_a: mine.id,
        intent_id_b: theirs.id,
        connection_id: connectionId,
      });
    }
  }

  return matches;
}

export async function runAvailabilityMatchPushes(
  admin: SupabaseClient,
  pushUrl: string,
  authBearer: string,
  nowIso: string = new Date().toISOString(),
): Promise<{ scanned: number; matches: number; pushAttempts: number }> {
  const { data: intentData, error: intentErr } = await admin
    .from('availability_intents')
    .select('id, user_id, timeframe, intent_tag, expires_at')
    .gt('expires_at', nowIso);

  if (intentErr) {
    throw new Error(`availability-matches intents: ${intentErr.message}`);
  }

  const intents = (intentData ?? []) as IntentRow[];
  const { data: connData, error: connErr } = await admin
    .from('connections')
    .select('id, user_ids, should_continue, expiry_state, status');

  if (connErr) {
    throw new Error(`availability-matches connections: ${connErr.message}`);
  }

  const matches = findAvailabilityMatches({
    intents,
    connections: (connData ?? []) as ConnectionRow[],
  });

  let pushAttempts = 0;

  for (const match of matches) {
    const [idLo, idHi] = orderedIntentIds(match.intent_id_a, match.intent_id_b);
    const { data: existing, error: existingErr } = await admin
      .from('availability_match_pushes')
      .select('intent_id_lo')
      .eq('intent_id_lo', idLo)
      .eq('intent_id_hi', idHi)
      .maybeSingle();
    if (existingErr) {
      console.warn('[availability-matches] dedupe read:', existingErr.message);
      continue;
    }
    if (existing) continue;

    const recipients = [match.user_a, match.user_b];
    let sentAny = false;
    for (const recipient of recipients) {
      try {
        const response = await fetch(pushUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authBearer}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient_user_id: recipient,
            title: 'Availability match',
            body: `You and a connection are both available for “${match.intent_tag}”.`,
            data: {
              type: 'availability_match',
              intent_tag: match.intent_tag,
              connection_id: match.connection_id,
              peer_user_id: recipient === match.user_a ? match.user_b : match.user_a,
            },
          }),
        });
        if (response.ok) {
          pushAttempts += 1;
          sentAny = true;
        }
      } catch (e) {
        console.warn('[availability-matches] push error:', match.connection_id, e);
      }
    }

    if (sentAny) {
      const { error: insertErr } = await admin.from('availability_match_pushes').insert({
        intent_id_lo: idLo,
        intent_id_hi: idHi,
      });
      if (insertErr) {
        console.warn('[availability-matches] dedupe insert:', insertErr.message);
      }
    }
  }

  return { scanned: intents.length, matches: matches.length, pushAttempts };
}
