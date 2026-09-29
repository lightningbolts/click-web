import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { dropReportBodySchema } from '@/lib/api/schemas/drops';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { resolveVisibleDrops } from '@/lib/server/drops/develop';

/**
 * POST /api/drops/report { kind, id, reason } — a quiet report to moderation on any Click Drop the
 * reporter can see. Never shown to anyone. (Blocking stays on /api/safety/block; blocked people's
 * drops are already hidden everywhere.)
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const limited = await featureMutationRateLimitResponse('drop_report', user.id);
    if (limited) return limited;
    const parsed = await parseBody(request, dropReportBodySchema);
    if (!parsed.ok) return parsed.response;
    const { kind, id, reason } = parsed.data;
    const admin = createAdminSupabaseClient();
    if (!(await resolveVisibleDrops(admin, user.id, kind, [id])).has(id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const { error } = await admin.from('drop_reports').insert({ drop_kind: kind, drop_id: id, reporter_id: user.id, reason });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    console.error('POST /api/drops/report:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
