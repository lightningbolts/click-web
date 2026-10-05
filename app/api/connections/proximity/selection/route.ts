import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { recordProximitySelectionExclusions } from '@/lib/server/proximity/selectionExclusions';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import type { ProximitySelectionExclusionsRequest } from '@/types/supabase-json';
import { parseBody } from '@/lib/api/parseBody';
import { proximitySelectionBodySchema } from '@/lib/api/schemas/connections';

/**
 * POST /api/connections/proximity/selection
 *
 * Saves who the caller removed while reviewing a group tap, so the confirm step leaves them out
 * no matter which phone confirms first.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseBody(request, proximitySelectionBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as ProximitySelectionExclusionsRequest;

    const result = await recordProximitySelectionExclusions(createAdminClient(), user.id, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[api/connections/proximity/selection]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
