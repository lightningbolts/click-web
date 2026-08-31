/**
 * GET /api/connections/[connectionId]/tabs
 *
 * Returns profile-sheet tab payloads for a conversation, backed by the
 * `public.messages` table for the chat associated with [connectionId].
 *
 *   - `attachments` → rows where `message_type IN ('image','audio','file')`
 *   - `media`       → attachments filtered to `image` / `audio`
 *   - `files`       → attachments filtered to `file`
 *   - `beacons`     → rows explicitly shared in this chat (`message_type = 'beacon'`)
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
import { resolveChatForTabsParam } from '@/lib/server/resolveChatForTabsParam';

type TabMessage = ReturnType<typeof normalizeDbMessage>;

function chatIdFromQueryOrParam(req: NextRequest, param: string): string {
  const fromQuery = req.nextUrl.searchParams.get('chatId')?.trim();
  if (fromQuery) return fromQuery;
  return param.trim();
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoid deep Supabase generic instantiation
  const resolved = await resolveChatForTabsParam(supabase as any, rawId);
  if (!resolved) {
    return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  }
  const { chatId } = resolved;

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

  const [attachmentsRes, beaconsRes] = await Promise.all([
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
  ]);

  if (attachmentsRes.error) {
    return NextResponse.json({ error: attachmentsRes.error.message }, { status: 500 });
  }
  if (beaconsRes.error) {
    return NextResponse.json({ error: beaconsRes.error.message }, { status: 500 });
  }
  const attachments: TabMessage[] = (attachmentsRes.data ?? []).map((row: Record<string, unknown>) =>
    normalizeDbMessage(row),
  );
  const chatBeacons: TabMessage[] = (beaconsRes.data ?? []).map((row: Record<string, unknown>) =>
    normalizeDbMessage(row),
  );

  const mergedBeacons = chatBeacons.sort(
    (a, b) => Number(b.time_created) - Number(a.time_created),
  );

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
