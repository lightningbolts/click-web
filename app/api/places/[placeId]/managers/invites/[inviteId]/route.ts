import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { requirePlaceManagerContext } from '@/lib/server/places/routeContext';

/** DELETE — owner cancels a pending invite; its link stops working. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ placeId: string; inviteId: string }> }) {
  try {
    const { placeId, inviteId } = await params;
    const ctx = await requirePlaceManagerContext(request, placeId, { roles: ['owner'] });
    if (!ctx.ok) return ctx.response;
    const { error } = await ctx.admin
      .from('place_manager_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId)
      .eq('place_id', ctx.place.id)
      .is('accepted_at', null);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/places/[placeId]/managers/invites/[inviteId]:', e instanceof Error ? e.message : e);
    return apiError('Couldn’t cancel the invite', 500, 'revoke_failed');
  }
}
