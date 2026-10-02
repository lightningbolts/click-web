import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { apiError } from '@/lib/api/errors';
import { dropViewsQuerySchema } from '@/lib/api/schemas/drops';
import { loadDevelopedAt } from '@/lib/server/drops/develop';

/**
 * GET /api/drops/views?kind=chat&ids=a,b — `{ developed: { [id]: developed_at } }` for the viewer.
 * Only the viewer's own rows, so a foreign id simply comes back absent.
 */
export async function GET(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const params = request.nextUrl.searchParams;
  const parsed = dropViewsQuerySchema.safeParse({ kind: params.get('kind'), ids: params.get('ids') ?? '' });
  if (!parsed.success) return apiError('kind and 1-100 ids are required', 400, 'validation_error');

  try {
    const developed = await loadDevelopedAt(createAdminSupabaseClient(), user.id, parsed.data.kind, parsed.data.ids);
    return NextResponse.json({ developed }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET /api/drops/views:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
