import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireFeature } from '@/lib/server/featureFlags';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { runAfterResponse } from '@/lib/server/afterResponse';
import { emitProductEvent } from '@/lib/server/telemetry/productEvents';
import { parseBody } from '@/lib/api/parseBody';
import { sharedDropCreateBodySchema } from '@/lib/api/schemas/drops';
import { DROP_MAX_ORIGINAL_BYTES, DROP_MAX_PREVIEW_BYTES, decodeDropUpload } from '@/lib/server/drops/storage';
import {
  findSharedDropByClientId,
  insertSharedDrop,
  listSharedDropStrip,
  serializeSharedDrops,
  sharedDropsConfigFrom,
} from '@/lib/server/sharedDrops';

export const maxDuration = 60;
export const runtime = 'nodejs';

async function authorize(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminSupabaseClient();
  const feature = await requireFeature(admin, 'shared_drops', user.id);
  if (!feature.ok) return { ok: false as const, response: feature.response };
  return { ok: true as const, userId: user.id, admin, config: sharedDropsConfigFrom(feature.config) };
}

/**
 * GET /api/me/shared-drops — the bounded Home strip: your recent shared drops and the ones your
 * connections shared with you (`{ drops, teaser }`). No counts, no infinite feed.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;
    const { rows, views } = await listSharedDropStrip(auth.admin, auth.userId, auth.config);
    return NextResponse.json(
      { teaser: auth.config.teaser, drops: await serializeSharedDrops(auth.admin, rows, auth.userId, views) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('GET /api/me/shared-drops:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/me/shared-drops — share one drop with all or core connections; it develops 24 hours
 * later. 409 `cap_reached` past the daily cap; the same `client_drop_id` returns the same drop.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;
    const limited = await featureMutationRateLimitResponse('shared_drops', auth.userId);
    if (limited) return limited;
    const parsed = await parseBody(request, sharedDropCreateBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const respond = async (row: Parameters<typeof serializeSharedDrops>[1][number], status: number) =>
      NextResponse.json({ drop: (await serializeSharedDrops(auth.admin, [row], auth.userId, new Map()))[0] }, { status });

    const existing = await findSharedDropByClientId(auth.admin, auth.userId, body.client_drop_id);
    if (existing) return respond(existing, 200);

    const original = decodeDropUpload(body.original_b64, DROP_MAX_ORIGINAL_BYTES);
    const preview = decodeDropUpload(body.preview_b64, DROP_MAX_PREVIEW_BYTES);
    if (!original || !preview) {
      return NextResponse.json({ error: 'Photo is empty or too large.', code: 'invalid_media' }, { status: 413 });
    }
    const result = await insertSharedDrop(auth.admin, {
      userId: auth.userId,
      audience: body.audience,
      clientDropId: body.client_drop_id,
      mimeType: body.mime_type,
      original,
      preview,
      width: body.width ?? null,
      height: body.height ?? null,
      caption: body.caption ?? null,
      config: auth.config,
    });
    if ('error' in result) {
      if (result.error === 'cap_reached') {
        return NextResponse.json(
          { error: `You can share ${auth.config.dailyCap} drops a day. Try again tomorrow.`, code: 'cap_reached' },
          { status: 409 },
        );
      }
      if (result.error === 'duplicate') {
        const again = await findSharedDropByClientId(auth.admin, auth.userId, body.client_drop_id);
        if (again) return respond(again, 200);
      }
      return NextResponse.json({ error: 'Failed to share the drop. Try again.' }, { status: 500 });
    }
    runAfterResponse('product events', () => emitProductEvent(auth.admin, auth.userId, 'drop_posted', { kind: 'shared' }));
    return respond(result.row, 201);
  } catch (e) {
    console.error('POST /api/me/shared-drops:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
