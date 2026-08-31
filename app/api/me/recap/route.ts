import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { emptyActivityRecap, loadActivityRecap, type RecapWindow } from '@/lib/me/activityRecap';

/**
 * GET /api/me/recap?window=day|week
 * Day/week activity rollup for Home. Empty windows return `{ recap }` with zeros (200),
 * not a 500 — archived/hidden connections and missing optional columns are skipped.
 */
export async function GET(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get('window') ?? 'week';
  const window: RecapWindow = raw === 'day' ? 'day' : 'week';

  try {
    const admin = createAdminClient();
    const recap = await loadActivityRecap(admin, user.id, window);
    return NextResponse.json({ recap });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[me/recap]', message);
    if (
      message.includes('Missing NEXT_PUBLIC_SUPABASE') ||
      message.includes('SUPABASE_SERVICE_ROLE')
    ) {
      return NextResponse.json({ error: 'Failed to load recap' }, { status: 500 });
    }
    return NextResponse.json({ recap: emptyActivityRecap(window) }, { status: 200 });
  }
}
