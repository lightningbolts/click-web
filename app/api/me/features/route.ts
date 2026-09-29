import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { resolveAllFeatures } from '@/lib/server/featureFlags';

/**
 * GET /api/me/features — the signed-in user's resolved feature flags:
 * `{ features: { [key]: { enabled, config } } }`. Unknown or unreadable flags are off.
 */
export async function GET(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const features = await resolveAllFeatures(createAdminSupabaseClient(), user.id);
    return NextResponse.json({ features }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    console.error('GET /api/me/features:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
