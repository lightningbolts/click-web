import { NextRequest, NextResponse } from 'next/server';
import { requireConnectionParticipant } from '@/lib/server/connectionWriteAuth';

type Body = { connection_id?: string; reason?: string };

/**
 * Report a connection for safety review.
 * POST { connection_id: string, reason: string }
 */
export async function POST(request: NextRequest) {
  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return NextResponse.json({ error: 'connection_id and reason are required' }, { status: 400 });
    }

    const gate = await requireConnectionParticipant(request, body.connection_id);
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
