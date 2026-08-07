/**
 * GET /api/connections/[connectionId]/tabs
 *
 * Returns profile-sheet tab payloads for a conversation, backed by the
 * `public.messages` table for the chat associated with [connectionId].
 *
 *   - `attachments` → rows where `message_type IN ('image','audio','file')`
 *   - `media`       → attachments filtered to `image` / `audio`
 *   - `files`       → attachments filtered to `file`
 *   - `beacons`     → chat `message_type = 'beacon'` rows plus encounter-attached
 *                     live events the viewer RSVPed + checked into
 *   - `links`  → intentionally omitted server-side; [content] is E2EE,
 *                so clients filter their locally-decrypted message state for
 *                `http://` / `https://` substrings.
 *
 * Auth: standard Supabase bearer JWT (via [getAuthenticatedSupabase]). Must be
 * a participant on the connection (enforced by [assertChatWritable]).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import { assertChatWritable, createChatGatekeeperAdmin } from '@/lib/server/chatGatekeeper';
import { normalizeDbMessage } from '@/lib/chat/messages';
import { filterBeaconIdsWithActiveEngagement } from '@/lib/server/resolveLiveEventBeaconAt';

type TabMessage = ReturnType<typeof normalizeDbMessage>;

function chatIdFromQueryOrParam(req: NextRequest, param: string): string {
  const fromQuery = req.nextUrl.searchParams.get('chatId')?.trim();
  if (fromQuery) return fromQuery;
  return param.trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

async function resolveChatForParam(
  supabase: Awaited<ReturnType<typeof getAuthenticatedSupabase>>['supabase'],
  paramId: string,
): Promise<{ chatId: string; connectionId: string | null } | null> {
  // The dynamic segment is named `connectionId` by filesystem convention
  // (see `app/api/connections/[connectionId]/...`), but the directive frames
  // it as `chatId`. Accept either by trying a direct chat lookup first and
  // falling back to a connection → chat resolution.
  const { data: chatRow } = await supabase
    .from('chats')
    .select('id, connection_id')
    .eq('id', paramId)
    .maybeSingle();
  if (isRecord(chatRow) && typeof chatRow.id === 'string') {
    return {
      chatId: chatRow.id,
      connectionId: typeof chatRow.connection_id === 'string' ? chatRow.connection_id : null,
    };
  }

  const { data: byConn } = await supabase
    .from('chats')
    .select('id, connection_id')
    .eq('connection_id', paramId)
    .maybeSingle();
  if (isRecord(byConn) && typeof byConn.id === 'string') {
    return {
      chatId: byConn.id,
      connectionId:
        typeof byConn.connection_id === 'string' ? byConn.connection_id : paramId,
    };
  }
  return null;
}

type EncounterEventRow = {
  event_beacon_id: string;
  event_beacon_title: string | null;
  event_beacon_start_at: string | null;
  event_beacon_end_at: string | null;
  encountered_at: string | null;
};

function scheduleLabel(startAt: string | null, endAt: string | null): string | null {
  if (!startAt && !endAt) return null;
  try {
    const start = startAt ? new Date(startAt) : null;
    const end = endAt ? new Date(endAt) : null;
    const fmt = (d: Date) =>
      d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    if (start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
      return `${fmt(start)} – ${fmt(end)}`;
    }
    if (start && Number.isFinite(start.getTime())) return fmt(start);
    if (end && Number.isFinite(end.getTime())) return fmt(end);
  } catch {
    /* ignore */
  }
  return null;
}

function encounterAttachedBeaconMessage(
  chatId: string,
  userId: string,
  row: EncounterEventRow,
): TabMessage {
  const title = (row.event_beacon_title ?? '').trim() || 'Event';
  const encounteredMs = row.encountered_at
    ? Date.parse(row.encountered_at)
    : Number.NaN;
  const timeCreated = Number.isFinite(encounteredMs) ? encounteredMs : Date.now();
  const schedule = scheduleLabel(row.event_beacon_start_at, row.event_beacon_end_at);
  return normalizeDbMessage({
    id: `encounter-event:${row.event_beacon_id}`,
    chat_id: chatId,
    user_id: userId,
    content: `Beacon: ${title}`,
    time_created: timeCreated,
    message_type: 'beacon',
    metadata: {
      beacon_id: row.event_beacon_id,
      title,
      beacon_type: 'event',
      ...(schedule ? { schedule_label: schedule } : {}),
      source: 'connection_encounter',
    },
  });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await context.params;
  const rawId = chatIdFromQueryOrParam(req, connectionId);
  if (!rawId) {
    return NextResponse.json({ error: 'chatId required' }, { status: 400 });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveChatForParam(supabase, rawId);
  if (!resolved) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }
  const { chatId, connectionId: resolvedConnectionId } = resolved;

  // Enforce participant-only access using the same gatekeeper as
  // `/api/chat/messages` so media/file listings never leak outside the chat.
  const admin = createChatGatekeeperAdmin();
  const denied = await assertChatWritable(admin, user.id, chatId);
  if (denied) return denied;

  const limit = (() => {
    const raw = parseInt(req.nextUrl.searchParams.get('limit') ?? '200', 10);
    if (!Number.isFinite(raw)) return 200;
    return Math.min(Math.max(raw, 1), 500);
  })();

  const [attachmentsRes, beaconsRes, encountersRes] = await Promise.all([
    supabase
      .schema('public')
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .in('message_type', ['image', 'audio', 'file'])
      .order('time_created', { ascending: false })
      .limit(limit),
    supabase
      .schema('public')
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .eq('message_type', 'beacon')
      .order('time_created', { ascending: false })
      .limit(limit),
    resolvedConnectionId
      ? admin
          .from('connection_encounters')
          .select(
            'event_beacon_id, event_beacon_title, event_beacon_start_at, event_beacon_end_at, encountered_at',
          )
          .eq('connection_id', resolvedConnectionId)
          .not('event_beacon_id', 'is', null)
          .order('encountered_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (attachmentsRes.error) {
    return NextResponse.json({ error: attachmentsRes.error.message }, { status: 500 });
  }
  if (beaconsRes.error) {
    return NextResponse.json({ error: beaconsRes.error.message }, { status: 500 });
  }
  if (encountersRes.error) {
    console.warn('[connections/tabs] encounters:', encountersRes.error.message);
  }

  const attachments: TabMessage[] = (attachmentsRes.data ?? []).map((row: Record<string, unknown>) =>
    normalizeDbMessage(row),
  );
  const chatBeacons: TabMessage[] = (beaconsRes.data ?? []).map((row: Record<string, unknown>) =>
    normalizeDbMessage(row),
  );

  const encounterRows: EncounterEventRow[] = [];
  const seenBeaconIds = new Set<string>();
  for (const raw of Array.isArray(encountersRes.data) ? encountersRes.data : []) {
    if (!isRecord(raw)) continue;
    const id =
      typeof raw.event_beacon_id === 'string' ? raw.event_beacon_id.trim() : '';
    if (!id || seenBeaconIds.has(id)) continue;
    seenBeaconIds.add(id);
    encounterRows.push({
      event_beacon_id: id,
      event_beacon_title:
        typeof raw.event_beacon_title === 'string' ? raw.event_beacon_title : null,
      event_beacon_start_at:
        typeof raw.event_beacon_start_at === 'string' ? raw.event_beacon_start_at : null,
      event_beacon_end_at:
        typeof raw.event_beacon_end_at === 'string' ? raw.event_beacon_end_at : null,
      encountered_at: typeof raw.encountered_at === 'string' ? raw.encountered_at : null,
    });
  }

  const eligibleIds = await filterBeaconIdsWithActiveEngagement(
    admin,
    user.id,
    encounterRows.map((r) => r.event_beacon_id),
  );
  const encounterBeacons = encounterRows
    .filter((r) => eligibleIds.has(r.event_beacon_id))
    .map((r) => encounterAttachedBeaconMessage(chatId, user.id, r));

  // Prefer chat-shared beacons when the same id appears in both sources.
  const chatBeaconIds = new Set(
    chatBeacons
      .map((b) => {
        const meta = b.metadata;
        if (!isRecord(meta)) return '';
        const id =
          typeof meta.beacon_id === 'string'
            ? meta.beacon_id
            : typeof meta.beaconId === 'string'
              ? meta.beaconId
              : '';
        return id.trim();
      })
      .filter(Boolean),
  );
  const mergedBeacons = [
    ...chatBeacons,
    ...encounterBeacons.filter((b) => {
      const meta = b.metadata;
      if (!isRecord(meta)) return true;
      const id =
        typeof meta.beacon_id === 'string'
          ? meta.beacon_id.trim()
          : typeof meta.beaconId === 'string'
            ? meta.beaconId.trim()
            : '';
      return !id || !chatBeaconIds.has(id);
    }),
  ].sort((a, b) => Number(b.time_created) - Number(a.time_created));

  const media = attachments.filter((item) => item.message_type === 'image' || item.message_type === 'audio');
  const files = attachments.filter((item) => item.message_type === 'file');

  return NextResponse.json({
    chatId,
    attachments,
    // NB: `links` is intentionally omitted — see the route-level doc comment.
    media,
    files,
    beacons: mergedBeacons,
  });
}
