import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { bindProximityHandshake } from '@/lib/server/proximity/bindProximityHandshake';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import type { ProximityHandshakeRequest } from '@/types/supabase-json';

/**
 * POST /api/connections/proximity
 *
 * Async tri-factor proximity bind — replaces bind-proximity-connection Edge Function.
 * Accepts BLE/audio tokens, GPS, and sensor payload. When a peer handshake exists within
 * the 48-hour pending window, forms the connection clique and returns 200. Otherwise
 * stores the payload and returns 202 Accepted (pending_match).
 */
export async function POST(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: ProximityHandshakeRequest;
    try {
      body = (await request.json()) as ProximityHandshakeRequest;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const admin = createAdminClient();
    const result = await bindProximityHandshake(admin, user.id, body);

    if (result.kind === 'error') {
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[api/connections/proximity]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
