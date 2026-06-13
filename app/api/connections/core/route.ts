import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  isJunctionTableOptionalError,
  requireConnectionParticipant,
} from '@/lib/server/connectionWriteAuth';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

type Body = { connection_id?: string };

/** GET — list core connection IDs for the signed-in user. */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('connection_core')
      .select('connection_id')
      .eq('user_id', user.id);

    if (error) {
      if (isJunctionTableOptionalError(error)) {
        return NextResponse.json({ core: [] });
      }
      console.error('[connections/core] list:', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const core = (data ?? [])
      .map((row) => String(row.connection_id ?? '').trim())
      .filter((id) => id.length > 0);

    return NextResponse.json({ core });
  } catch (error) {
    console.error('[connections/core]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST { connection_id } — mark connection as core for the signed-in user. */
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

    const { error } = await admin.from('connection_core').upsert(
      {
        user_id: user.id,
        connection_id: connectionId,
      },
      { onConflict: 'user_id,connection_id' },
    );

    if (error) {
      if (isJunctionTableOptionalError(error)) {
        return NextResponse.json(
          { error: 'Core connections are not available (database configuration)' },
          { status: 503 },
        );
      }
      console.error('[connections/core] insert:', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[connections/core]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE ?connection_id= — remove from core list. */
export async function DELETE(request: NextRequest) {
  try {
    const connectionId =
      request.nextUrl.searchParams.get('connection_id')?.trim() ??
      (await request.json().catch(() => ({})) as Body).connection_id?.trim();

    const gate = await requireConnectionParticipant(request, connectionId);
    if (!gate.ok) return gate.response;

    const { user, admin } = gate;

    const { error } = await admin
      .from('connection_core')
      .delete()
      .eq('user_id', user.id)
      .eq('connection_id', connectionId);

    if (error) {
      if (isJunctionTableOptionalError(error)) {
        return NextResponse.json(
          { error: 'Core connections are not available (database configuration)' },
          { status: 503 },
        );
      }
      console.error('[connections/core] delete:', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[connections/core]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
