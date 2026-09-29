import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { deleteSharedDrop } from '@/lib/server/sharedDrops';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DELETE /api/me/shared-drops/{id} — the poster removes their drop, any time; media is removed. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ dropId: string }> }): Promise<Response> {
  try {
    const { dropId } = await params;
    if (!UUID_RE.test(dropId)) return NextResponse.json({ error: 'Invalid drop id' }, { status: 400 });
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Not flag-gated: anyone who posted must always be able to take it down.
    if (!(await deleteSharedDrop(createAdminSupabaseClient(), dropId, user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/me/shared-drops/[dropId]:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
