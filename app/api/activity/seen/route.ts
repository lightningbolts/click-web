import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { markActivitySeen } from '@/lib/server/activity';

const bodySchema = z.object({ seen_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'ISO date') });

/** POST { seen_at } — the newest item the viewer was shown; clears the badge up to it. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = await parseBody(request, bodySchema);
    if (!parsed.ok) return parsed.response;
    await markActivitySeen(createAdminSupabaseClient(), user.id, parsed.data.seen_at);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST /api/activity/seen:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
