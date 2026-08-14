import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/withAuth';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { priorConnectionRespondBodySchema } from '@/lib/api/schemas/connections';
import { createAdminClient, isJunctionTableOptionalError } from '@/lib/server/connectionWriteAuth';
import { isPriorTarget } from '@/lib/connections/priorConnections';

/**
 * POST /api/connections/prior/respond
 *
 * Target user (responder_id) accepts or declines a pending prior connection.
 * Accept does not create connection_encounters.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, priorConnectionRespondBodySchema);
  if (!parsed.ok) return parsed.response;

  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from('connections')
    .select('id, user_ids, status, source, initiator_id, responder_id')
    .eq('id', parsed.data.connection_id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[prior/respond] lookup:', fetchErr.message);
    return apiError('Failed to update request', 500, 'respond_failed');
  }
  if (!row) {
    return apiError('Connection not found', 404, 'not_found');
  }
  if (row.source !== 'prior') {
    return apiError('Not a prior connection', 400, 'not_prior');
  }
  if (row.status !== 'pending') {
    return apiError('Request is no longer pending', 409, 'not_pending');
  }
  if (!isPriorTarget(row, auth.user.id)) {
    return apiError('Only the recipient can respond', 403, 'forbidden');
  }

  const ids = (Array.isArray(row.user_ids) ? row.user_ids : [])
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter(Boolean);

  if (parsed.data.action === 'decline') {
    const { error: updateErr } = await admin
      .from('connections')
      .update({
        status: 'removed',
        expiry_state: 'expired',
        confirmed_by_b: false,
      })
      .eq('id', row.id);
    if (updateErr) {
      console.error('[prior/respond] decline:', updateErr.message);
      return apiError('Failed to update request', 500, 'respond_failed');
    }
    if (ids.length > 0) {
      const hiddenRows = ids.map((userId) => ({
        user_id: userId,
        connection_id: row.id,
      }));
      const { error: hideErr } = await admin.from('connection_hidden').upsert(hiddenRows);
      if (hideErr && !isJunctionTableOptionalError(hideErr)) {
        console.warn('[prior/respond] hide:', hideErr.message);
      }
    }
    return NextResponse.json({ connection_id: row.id, status: 'removed', action: 'decline' });
  }

  const nowMs = Date.now();
  const { error: acceptErr } = await admin
    .from('connections')
    .update({
      confirmed_by_b: true,
      status: 'active',
      expiry_state: 'active',
      last_message_at: nowMs,
    })
    .eq('id', row.id);
  if (acceptErr) {
    console.error('[prior/respond] accept:', acceptErr.message);
    return apiError('Failed to update request', 500, 'respond_failed');
  }

  const { data: existingChat } = await admin
    .from('chats')
    .select('id')
    .eq('connection_id', row.id)
    .maybeSingle();
  if (!existingChat) {
    const { error: chatErr } = await admin.from('chats').insert({
      connection_id: row.id,
      created_at: nowMs,
      updated_at: nowMs,
    });
    if (chatErr) {
      console.warn('[prior/respond] chat:', chatErr.message);
    }
  }

  return NextResponse.json({
    connection_id: row.id,
    status: 'active',
    action: 'accept',
    source: 'prior',
  });
}
