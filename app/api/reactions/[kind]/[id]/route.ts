import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { REACTION_EMOJI, loadReactions, resolveReactionTarget, type ReactionKind } from '@/lib/server/reactions';

type Params = { params: Promise<{ kind: string; id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bodySchema = z.object({ emoji: z.enum(REACTION_EMOJI).nullable() });

async function authorize(request: NextRequest, params: Params['params']) {
  const { kind, id } = await params;
  if ((kind !== 'soundtrack' && kind !== 'shared_drop') || !UUID_RE.test(id)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminSupabaseClient();
  const target = await resolveReactionTarget(admin, kind as ReactionKind, id, user.id);
  if (!target) return { ok: false as const, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { ok: true as const, kind: kind as ReactionKind, id, userId: user.id, admin, ownerId: target.ownerId };
}

/** GET /api/reactions/{soundtrack|shared_drop}/{id} — `{ mine, reactions, is_owner }`. */
export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  try {
    const auth = await authorize(request, params);
    if (!auth.ok) return auth.response;
    return NextResponse.json(await loadReactions(auth.admin, auth.kind, auth.id, auth.userId, auth.ownerId));
  } catch (e) {
    console.error('GET /api/reactions:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** PUT { emoji | null } — react (replacing any earlier one) or take it back. Not on your own. */
export async function PUT(request: NextRequest, { params }: Params): Promise<Response> {
  try {
    const auth = await authorize(request, params);
    if (!auth.ok) return auth.response;
    if (auth.ownerId === auth.userId) return NextResponse.json({ error: "You can't react to your own." }, { status: 403 });
    const limited = await featureMutationRateLimitResponse('reactions', auth.userId);
    if (limited) return limited;
    const parsed = await parseBody(request, bodySchema);
    if (!parsed.ok) return parsed.response;
    const key = { target_kind: auth.kind, target_id: auth.id, user_id: auth.userId };
    const { error } = parsed.data.emoji
      ? await auth.admin.from('reactions').upsert({ ...key, emoji: parsed.data.emoji, created_at: new Date().toISOString() })
      : await auth.admin.from('reactions').delete().match(key);
    if (error) throw new Error(error.message);
    return NextResponse.json(await loadReactions(auth.admin, auth.kind, auth.id, auth.userId, auth.ownerId));
  } catch (e) {
    console.error('PUT /api/reactions:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
