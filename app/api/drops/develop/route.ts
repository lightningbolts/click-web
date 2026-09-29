import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { dropDevelopBodySchema } from '@/lib/api/schemas/drops';
import { developDrops } from '@/lib/server/drops/develop';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { runAfterResponse } from '@/lib/server/afterResponse';
import { emitProductEvent } from '@/lib/server/telemetry/productEvents';

/**
 * POST /api/drops/develop { drops: [{ kind, id }] }
 * Tap-to-develop (one drop) or "Develop all" (up to 50). Ready drops are marked developed for the
 * viewer and gated originals come back as 10-minute signed URLs; pending drops come back pending.
 * Not flag-gated: a viewer must be able to develop a gated drop someone in the cohort sent them.
 */
export async function POST(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limited = await featureMutationRateLimitResponse('drops_develop', user.id);
  if (limited) return limited;

  const parsed = await parseBody(request, dropDevelopBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const admin = createAdminSupabaseClient();
    const startedAt = Date.now();
    const results = await developDrops(admin, user.id, parsed.data.drops, startedAt);
    // Only drops this call developed (developing again is idempotent and not a new open).
    const opened = results.filter((r) => r.status === 'developed' && Date.parse(r.developed_at) >= startedAt - 5_000);
    if (opened.length > 0) {
      runAfterResponse('product events', async () => {
        for (const r of opened) await emitProductEvent(admin, user.id, 'drop_ready_opened', { kind: r.kind });
      });
    }
    return NextResponse.json({ drops: results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('POST /api/drops/develop:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
