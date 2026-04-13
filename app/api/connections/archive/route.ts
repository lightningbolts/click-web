import { NextRequest, NextResponse } from 'next/server';
import {
  isJunctionTableOptionalError,
  requireConnectionParticipant,
} from '@/lib/server/connectionWriteAuth';

type Body = { connection_id?: string };

/**
 * Per-user archive: insert `connection_archives` so the connection leaves this user's active feed.
 * POST { connection_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const gate = await requireConnectionParticipant(request, body.connection_id);
    if (!gate.ok) return gate.response;

    const { user, connectionId, admin } = gate;

    const { error: insertError } = await admin.from('connection_archives').upsert(
      {
        user_id: user.id,
        connection_id: connectionId,
      },
      { onConflict: 'user_id,connection_id' },
    );

    if (insertError) {
      if (isJunctionTableOptionalError(insertError)) {
        return NextResponse.json(
          { error: 'Archive is not available (database configuration)' },
          { status: 503 },
        );
      }
      console.error('[connections/archive] insert:', insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[connections/archive]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
