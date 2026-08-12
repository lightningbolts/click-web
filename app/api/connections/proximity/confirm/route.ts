import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { confirmProximityHandshakeSelection } from '@/lib/server/proximity/confirmProximitySelection';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import type { ProximityConfirmSelectionRequest } from '@/types/supabase-json';
import { parseBody } from '@/lib/api/parseBody';
import { proximityConfirmBodySchema } from '@/lib/api/schemas/connections';

/**
 * POST /api/connections/proximity/confirm
 *
 * Host finalizes a multi-peer tri-factor bind after selecting members (and optional context tags).
 */
export async function POST(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseBody(request, proximityConfirmBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as ProximityConfirmSelectionRequest;

    const admin = createAdminClient();
    const result = await confirmProximityHandshakeSelection(admin, user.id, body);

    if (result.kind === 'error') {
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[api/connections/proximity/confirm]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
