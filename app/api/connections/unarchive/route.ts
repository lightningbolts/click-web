import { NextRequest, NextResponse } from 'next/server';
import {
  isJunctionTableOptionalError,
  requireConnectionParticipant,
} from '@/lib/server/connectionWriteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { connectionIdBodySchema } from '@/lib/api/schemas/connections';
import type { ConnectionLifecycleStatus } from '@/types/connection';

/**
 * Restore for the current user: remove their `connection_archives` row and set `connections.status` to `kept`
 * when a junction row was removed (legacy `status = archived` fallback).
 * POST { connection_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, connectionIdBodySchema);
    if (!parsed.ok) return parsed.response;

    const gate = await requireConnectionParticipant(request, parsed.data.connection_id);
    if (!gate.ok) return gate.response;

    const { user, connectionId, admin } = gate;

    const { data: removedArchiveRows, error: archiveDeleteError } = await admin
      .from('connection_archives')
      .delete()
      .eq('user_id', user.id)
      .eq('connection_id', connectionId)
      .select('id');

    if (archiveDeleteError && !isJunctionTableOptionalError(archiveDeleteError)) {
      console.error('[connections/unarchive] archive delete:', archiveDeleteError.message);
      return NextResponse.json({ error: archiveDeleteError.message }, { status: 400 });
    }

    if ((removedArchiveRows?.length ?? 0) > 0) {
      const keptStatus: ConnectionLifecycleStatus = 'kept';
      const { data: connection, error: keepUpdateError } = await admin
        .from('connections')
        .update({ status: keptStatus })
        .eq('id', connectionId)
        .select()
        .maybeSingle();

      if (keepUpdateError) {
        console.error('[connections/unarchive] status:', keepUpdateError.message);
        return NextResponse.json({ error: keepUpdateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, connection });
    }

    const { data: row, error: rowErr } = await admin
      .from('connections')
      .select('id, status')
      .eq('id', connectionId)
      .maybeSingle();

    if (rowErr) {
      console.error('[connections/unarchive] row:', rowErr.message);
      return NextResponse.json({ error: rowErr.message }, { status: 400 });
    }

    if (row?.status === 'archived') {
      const keptStatus: ConnectionLifecycleStatus = 'kept';
      const { data: updated, error: updateError } = await admin
        .from('connections')
        .update({ status: keptStatus })
        .eq('id', connectionId)
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('[connections/unarchive] legacy:', updateError.message);
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, connection: updated });
    }

    return NextResponse.json(
      { error: 'Connection is not archived for this user' },
      { status: 409 },
    );
  } catch (error) {
    console.error('[connections/unarchive]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
