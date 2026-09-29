import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { dropDevelopBodySchema } from '@/lib/api/schemas/drops';
import { developDrops } from '@/lib/server/drops/develop';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';

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
    const results = await developDrops(createAdminSupabaseClient(), user.id, parsed.data.drops);
    return NextResponse.json({ drops: results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('POST /api/drops/develop:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
