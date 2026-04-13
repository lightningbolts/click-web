import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

/**
 * Health check for the KMP → Next.js secure tunnel.
 * Requires `Authorization: Bearer <Supabase access JWT>` (validated server-side via GoTrue).
 */
export async function GET(request: NextRequest) {
  const raw = request.headers.get('authorization');
  const bearer = raw?.replace(/^Bearer\s+/i, '').trim();

  if (!raw?.trim() || !bearer) {
    return NextResponse.json(
      { error: 'Missing Authorization header. Expected: Bearer <access_token>.' },
      { status: 401 },
    );
  }

  const { user, authError } = await getSupabaseFromRouteRequest(request);

  if (authError != null || user == null) {
    return NextResponse.json(
      { error: 'Invalid or expired access token.' },
      { status: 401 },
    );
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Secure tunnel established',
    user_id: user.id,
  });
}
