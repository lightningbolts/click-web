import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Hourly sweep: delete expired pending_handshakes rows (expires_at < now()).
 * Complements on-write cleanup in bindProximityHandshake.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
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
