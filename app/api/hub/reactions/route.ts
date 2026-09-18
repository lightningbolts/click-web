/**
 * POST   /api/hub/reactions — add the caller's reaction to a Hub message.
 * DELETE /api/hub/reactions — remove the caller's matching reaction.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseBody } from '@/lib/api/parseBody';
import { hubReactionBodySchema } from '@/lib/api/schemas/beacons';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { assertHubGeofenceFromCoords } from '@/lib/server/hubGatekeeper';

type HubMessageTarget = { id: string; hub_id: string };

async function loadTarget(
  admin: SupabaseClient,
  messageId: string,
): Promise<HubMessageTarget | null> {
  const { data, error } = await admin
    .from('hub_messages')
    .select('id, hub_id')
    .eq('id', messageId)
    .maybeSingle();
  if (error) throw error;
  if (!data || typeof data.id !== 'string' || typeof data.hub_id !== 'string') return null;
  return { id: data.id, hub_id: data.hub_id };
}

async function authorize(
  admin: SupabaseClient,
  args: {
    hubId: string;
    messageId: string;
    userId: string;
    userLat: number;
    userLong: number;
  },
): Promise<{ target: HubMessageTarget } | { response: NextResponse }> {
  const target = await loadTarget(admin, args.messageId);
  if (!target || target.hub_id !== args.hubId) {
    return { response: NextResponse.json({ error: 'Hub message not found' }, { status: 404 }) };
  }
  const denied = await assertHubGeofenceFromCoords(
    admin,
    target.hub_id,
    args.userLat,
    args.userLong,
    args.userId,
  );
  return denied ? { response: denied } : { target };
}

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, hubReactionBodySchema);
  if (!parsed.ok) return parsed.response;

  const { hubId, messageId, reactionType, userLat, userLong } = parsed.data;
  const admin = createChatGatekeeperAdmin();

  try {
    const gate = await authorize(admin, {
      hubId: hubId.trim(),
      messageId: messageId.trim(),
      userId: auth.user.id,
      userLat,
      userLong,
    });
    if ('response' in gate) return gate.response;

    const { data: reaction, error } = await admin
      .from('hub_message_reactions')
      .insert({
        hub_message_id: gate.target.id,
        hub_id: gate.target.hub_id,
        user_id: auth.user.id,
        reaction_type: reactionType.trim(),
      })
      .select('*')
      .single();

    if (error) {
      const duplicate =
        error.code === '23505' ||
        error.message?.toLowerCase().includes('duplicate') ||
        error.message?.toLowerCase().includes('unique');
      if (duplicate) {
        return NextResponse.json({ action: 'exists', reaction: null }, { status: 200 });
      }
      console.error('[hub/reactions POST]', error.message);
      return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
    }

    return NextResponse.json({ action: 'added', reaction }, { status: 201 });
  } catch (error) {
    console.error('[hub/reactions POST]', error);
    return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, hubReactionBodySchema);
  if (!parsed.ok) return parsed.response;

  const { hubId, messageId, reactionType, userLat, userLong } = parsed.data;
  const admin = createChatGatekeeperAdmin();

  try {
    const gate = await authorize(admin, {
      hubId: hubId.trim(),
      messageId: messageId.trim(),
      userId: auth.user.id,
      userLat,
      userLong,
    });
    if ('response' in gate) return gate.response;

    const { error } = await admin
      .from('hub_message_reactions')
      .delete()
      .eq('hub_message_id', gate.target.id)
      .eq('user_id', auth.user.id)
      .eq('reaction_type', reactionType.trim());

    if (error) {
      console.error('[hub/reactions DELETE]', error.message);
      return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[hub/reactions DELETE]', error);
    return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
  }
}
