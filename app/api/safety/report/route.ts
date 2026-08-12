import { NextRequest, NextResponse } from 'next/server';
import { requireConnectionParticipant } from '@/lib/server/connectionWriteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { safetyReportBodySchema } from '@/lib/api/schemas/connections';

/**
 * Report a connection for safety review.
 * POST { connection_id: string, reason: string }
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, safetyReportBodySchema);
    if (!parsed.ok) return parsed.response;

    const { connection_id, reason } = parsed.data;

    const gate = await requireConnectionParticipant(request, connection_id);
    if (!gate.ok) return gate.response;

    const { user, connectionId, admin } = gate;

    const { error } = await admin.from('connection_reports').insert({
      connection_id: connectionId,
      reporter_id: user.id,
      reason,
    });

    if (error) {
      console.error('[safety/report]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Report submitted' });
  } catch (error) {
    console.error('[safety/report]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
