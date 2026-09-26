import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';


/**
 * Hourly sweep: delete expired pending_handshakes rows (expires_at < now()).
 * Complements on-write cleanup in bindProximityHandshake.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('pending_handshakes')
    .delete()
    .lt('expires_at', nowIso)
    .select('id');

  if (error) {
    console.error('[cron/pending-handshakes-cleanup]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deleted = data?.length ?? 0;
  return NextResponse.json({ ok: true, deleted });
}
