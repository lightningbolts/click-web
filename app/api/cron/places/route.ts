import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { runPlacesRollup } from '@/lib/server/places/rollupJob';

/**
 * GET /api/cron/places — hourly (via cron-hourly-maintenance): Click Places daily rollup, then
 * retention (check-ins 90 d, Pulse identity 30 d, Pulses 400 d).
 */
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const admin = createAdminSupabaseClient();
    const rollup = await runPlacesRollup(admin);
    const { data: purge, error } = await admin.rpc('purge_place_presence', {
      p_check_in_days: 90,
      p_pulse_identity_days: 30,
      p_pulse_days: 400,
    });
    if (error) throw new Error(`purge_place_presence: ${error.message}`);
    if (rollup.errors.length > 0) console.warn('[cron/places] rollup errors:', rollup.errors.slice(0, 10));
    return NextResponse.json({ ok: true, rollup, purge });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/places]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
