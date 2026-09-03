/**
 * GET /api/hub/[id]    — read hub metadata for creator-aware clients
 * PATCH /api/hub/[id]  — update hub name/category (creator only)
 * DELETE /api/hub/[id] — delete hub and its messages/participants (creator only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { assertHubReadable } from '@/lib/server/hubGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { hubPatchBodySchema } from '@/lib/api/schemas/beacons';

type RouteContext = { params: Promise<{ id: string }> };

async function resolveHubAndVerifyOwner(
  admin: ReturnType<typeof createChatGatekeeperAdmin>,
  hubId: string,
  userId: string,
) {
  const { data: hub, error } = await admin
    .from('hub_venues')
    .select('id, creator_id, event_beacon_id')
    .eq('id', hubId)
    .maybeSingle();

  if (error) {
    console.error('[hub] owner lookup:', error.message);
    return { hub: null, errorResponse: NextResponse.json({ error: 'Failed to load hub' }, { status: 500 }) };
  }
  if (!hub) {
    return { hub: null, errorResponse: NextResponse.json({ error: 'Hub not found' }, { status: 404 }) };
  }
  if (hub.creator_id !== userId) {
    return { hub: null, errorResponse: NextResponse.json({ error: 'Only the hub creator can modify this hub' }, { status: 403 }) };
  }
  return { hub, errorResponse: null };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const { id: hubId } = await context.params;
  const trimmedId = hubId?.trim();
  if (!trimmedId) {
    return NextResponse.json({ error: 'Hub id is required' }, { status: 400 });
  }

  const admin = createChatGatekeeperAdmin();
  const denied = await assertHubReadable(admin, trimmedId, auth.user.id);
  if (denied) return denied;
  const { data: hub, error } = await admin
    .from('hub_venues')
    .select('id, name, category, creator_id, event_beacon_id, expires_at')
    .eq('id', trimmedId)
    .maybeSingle();

  if (error) {
    console.error('[hub/GET] hub lookup error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch hub' }, { status: 500 });
  }
  if (!hub) {
    return NextResponse.json({ error: 'Hub not found' }, { status: 404 });
  }

  return NextResponse.json({ hub });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const { id: hubId } = await context.params;
  if (!hubId?.trim()) {
    return NextResponse.json({ error: 'Hub id is required' }, { status: 400 });
  }

  const parsed = await parseBody(request, hubPatchBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as Record<string, unknown>;

  const admin = createChatGatekeeperAdmin();
  const { hub, errorResponse } = await resolveHubAndVerifyOwner(admin, hubId.trim(), auth.user.id);
  if (errorResponse) return errorResponse;
  if (hub?.event_beacon_id) {
    return NextResponse.json(
      {
        error: 'EVENT_OWNED_HUB',
        message: 'Edit this event from its event details instead of changing the hub directly.',
      },
      { status: 409 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body.category === 'string' && body.category.trim()) {
    updates.category = body.category.trim();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await admin
    .from('hub_venues')
    .update(updates)
    .eq('id', hub!.id)
    .select('*')
    .single();

  if (updateErr) {
    console.error('[hub/PATCH] update error:', updateErr.message);
    return NextResponse.json({ error: 'Failed to update hub' }, { status: 500 });
  }

  return NextResponse.json({ hub: updated });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const { id: hubId } = await context.params;
  if (!hubId?.trim()) {
    return NextResponse.json({ error: 'Hub id is required' }, { status: 400 });
  }

  const admin = createChatGatekeeperAdmin();
  const { hub, errorResponse } = await resolveHubAndVerifyOwner(admin, hubId.trim(), auth.user.id);
  if (errorResponse) return errorResponse;
  if (hub?.event_beacon_id) {
    return NextResponse.json(
      {
        error: 'EVENT_OWNED_HUB',
        message: 'Delete this event from its event details instead of deleting the hub directly.',
      },
      { status: 409 },
    );
  }

  const trimmedId = hub!.id;

  await admin.from('hub_messages').delete().eq('hub_id', trimmedId);
  await admin.from('hub_participants').delete().eq('hub_id', trimmedId);

  const { error: deleteErr } = await admin
    .from('hub_venues')
    .delete()
    .eq('id', trimmedId);

  if (deleteErr) {
    console.error('[hub/DELETE] delete error:', deleteErr.message);
    return NextResponse.json({ error: 'Failed to delete hub' }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
