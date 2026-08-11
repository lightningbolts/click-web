import { NextRequest, NextResponse } from 'next/server';
import {
  isJunctionTableOptionalError,
  requireConnectionParticipant,
} from '@/lib/server/connectionWriteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { connectionIdBodySchema } from '@/lib/api/schemas/connections';

/**
 * Per-user hide: upsert `connection_hidden` for the JWT user only (other participant unchanged).
 * POST { connection_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, connectionIdBodySchema);
    if (!parsed.ok) return parsed.response;

    const gate = await requireConnectionParticipant(request, parsed.data.connection_id);
    if (!gate.ok) return gate.response;

    const { user, connectionId, admin } = gate;

    const hiddenAt = new Date().toISOString();
    const { error: insertError } = await admin.from('connection_hidden').upsert(
      {
        user_id: user.id,
        connection_id: connectionId,
        hidden_at: hiddenAt,
      },
      { onConflict: 'user_id,connection_id' },
    );

    if (!insertError) {
      return NextResponse.json({ success: true, connection_id: connectionId });
    }

    if (isJunctionTableOptionalError(insertError)) {
      console.error('[connections/hide] junction unavailable:', insertError.message);
      return NextResponse.json(
        { error: 'Hide is not available (database configuration)' },
        { status: 503 },
      );
    }

    console.error('[connections/hide]', insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  } catch (error) {
    console.error('[connections/hide]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
