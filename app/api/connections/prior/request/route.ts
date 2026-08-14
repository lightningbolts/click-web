import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/withAuth';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { priorConnectionRequestBodySchema } from '@/lib/api/schemas/connections';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import {
  PRIOR_RATE_WINDOW_MS,
  PRIOR_REQUESTS_PER_DAY,
  isPairBlocked,
  notifyPriorConnectionRequest,
  priorInsertRow,
  sameMemberSet,
} from '@/lib/connections/priorConnections';

/**
 * POST /api/connections/prior/request
 *
 * Create a pending self-reported prior connection. Does not insert
 * connection_encounters or copy sensor fields.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, priorConnectionRequestBodySchema);
  if (!parsed.ok) return parsed.response;

  const senderId = auth.user.id;
  const targetId = parsed.data.target_user_id.trim();
  if (targetId === senderId) {
    return apiError('Cannot request a prior connection with yourself', 400, 'self_connect');
  }

  const contextTag =
    typeof parsed.data.context_tag === 'string' && parsed.data.context_tag.trim()
      ? parsed.data.context_tag.trim().slice(0, 80)
      : null;

  const admin = createAdminClient();

  if (await isPairBlocked(admin, senderId, targetId)) {
    return apiError('User is not available', 403, 'blocked');
  }

  const { data: targetUser, error: targetErr } = await admin
    .from('users')
    .select('id, name, first_name')
    .eq('id', targetId)
    .maybeSingle();
  if (targetErr) {
    console.error('[prior/request] target lookup:', targetErr.message);
    return apiError('Failed to create request', 500, 'request_failed');
  }
  if (!targetUser) {
    return apiError('User not found', 404, 'not_found');
  }

  const windowStart = new Date(Date.now() - PRIOR_RATE_WINDOW_MS).toISOString();
  const { count, error: rateErr } = await admin
    .from('connection_requests_rate_limit')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', senderId)
    .gte('created_at', windowStart);
  if (rateErr) {
    console.error('[prior/request] rate limit:', rateErr.message);
    return apiError('Failed to create request', 500, 'request_failed');
  }
  if ((count ?? 0) >= PRIOR_REQUESTS_PER_DAY) {
    return apiError(
      'Too many prior connection requests today',
      429,
      'rate_limited',
    );
  }

  const { data: pairCandidates, error: pairErr } = await admin
    .from('connections')
    .select('id, user_ids, status, source, initiator_id, responder_id')
    .contains('user_ids', [senderId]);
  if (pairErr) {
    console.error('[prior/request] pair lookup:', pairErr.message);
    return apiError('Failed to create request', 500, 'request_failed');
  }

  const existing = (pairCandidates ?? []).find((row) =>
    sameMemberSet(row.user_ids, senderId, targetId),
  );

  if (existing) {
    const status = typeof existing.status === 'string' ? existing.status : '';
    const source = typeof existing.source === 'string' ? existing.source : 'handshake';
    if (source !== 'prior') {
      return apiError('You are already connected', 409, 'already_connected');
    }
    if (status === 'pending') {
      return apiError('A prior connection request is already pending', 409, 'already_pending');
    }
    if (status === 'active' || status === 'kept') {
      return apiError('You are already connected', 409, 'already_connected');
    }
  }

  const { error: rateInsertErr } = await admin.from('connection_requests_rate_limit').insert({
    sender_id: senderId,
    target_id: targetId,
  });
  if (rateInsertErr) {
    console.error('[prior/request] rate insert:', rateInsertErr.message);
    return apiError('Failed to create request', 500, 'request_failed');
  }

  const nowMs = Date.now();
  const insertRow = priorInsertRow({
    initiatorId: senderId,
    responderId: targetId,
    knownSince: parsed.data.known_since,
    contextTag,
    nowMs,
  });

  let connectionId: string;
  if (existing && typeof existing.id === 'string') {
    const { data: updated, error: updateErr } = await admin
      .from('connections')
      .update(insertRow)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (updateErr || !updated?.id) {
      console.error('[prior/request] restore:', updateErr?.message);
      return apiError('Failed to create request', 500, 'request_failed');
    }
    connectionId = String(updated.id);
    await admin.from('connection_hidden').delete().eq('connection_id', connectionId);
    await admin.from('connection_archives').delete().eq('connection_id', connectionId);
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from('connections')
      .insert(insertRow)
      .select('id')
      .single();
    if (insertErr || !inserted?.id) {
      console.error('[prior/request] insert:', insertErr?.message);
      return apiError('Failed to create request', 500, 'request_failed');
    }
    connectionId = String(inserted.id);
  }

  const { data: senderProfile } = await admin
    .from('users')
    .select('name, first_name')
    .eq('id', senderId)
    .maybeSingle();
  const resolvedSenderName =
    (typeof senderProfile?.first_name === 'string' && senderProfile.first_name.trim()) ||
    (typeof senderProfile?.name === 'string' && senderProfile.name.trim()) ||
    'Someone';

  await notifyPriorConnectionRequest({
    recipientUserId: targetId,
    senderUserId: senderId,
    senderName: resolvedSenderName,
    connectionId,
  });

  return NextResponse.json({
    connection_id: connectionId,
    status: 'pending',
    source: 'prior',
  });
}
