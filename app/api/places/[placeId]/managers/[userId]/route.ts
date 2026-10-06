import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { placeManagerRoleBodySchema } from '@/lib/api/schemas/places';
import type { PlaceRole } from '@/lib/places/workspace';
import { countOwners, lastOwnerBlocks } from '@/lib/server/places/invites';
import { requirePlaceManagerContext } from '@/lib/server/places/routeContext';

type Params = { params: Promise<{ placeId: string; userId: string }> };

async function currentRole(admin: Parameters<typeof countOwners>[0], placeId: string, userId: string): Promise<PlaceRole | null> {
  const { data, error } = await admin.from('place_managers').select('role').eq('place_id', placeId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { role?: PlaceRole } | null)?.role ?? null;
}

/** PATCH { role } — owner changes someone's role. The last owner can't be downgraded. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { placeId, userId } = await params;
    const ctx = await requirePlaceManagerContext(request, placeId, { roles: ['owner'] });
    if (!ctx.ok) return ctx.response;
    const parsed = await parseBody(request, placeManagerRoleBodySchema);
    if (!parsed.ok) return parsed.response;
    const role = await currentRole(ctx.admin, ctx.place.id, userId);
    if (!role) return apiError('They don’t manage this Place', 404, 'not_a_member');
    if (lastOwnerBlocks(await countOwners(ctx.admin, ctx.place.id), role, parsed.data.role)) {
      return apiError('A Place needs at least one owner. Make someone else an owner first.', 409, 'last_owner');
    }
    const { error } = await ctx.admin.from('place_managers').update({ role: parsed.data.role }).eq('place_id', ctx.place.id).eq('user_id', userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ user_id: userId, role: parsed.data.role });
  } catch (e) {
    console.error('PATCH /api/places/[placeId]/managers/[userId]:', e instanceof Error ? e.message : e);
    return apiError('Couldn’t change the role', 500, 'role_failed');
  }
}

/** DELETE — owner removes someone. The last owner can't be removed. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { placeId, userId } = await params;
    const ctx = await requirePlaceManagerContext(request, placeId, { roles: ['owner'] });
    if (!ctx.ok) return ctx.response;
    const role = await currentRole(ctx.admin, ctx.place.id, userId);
    if (!role) return apiError('They don’t manage this Place', 404, 'not_a_member');
    if (lastOwnerBlocks(await countOwners(ctx.admin, ctx.place.id), role, null)) {
      return apiError('A Place needs at least one owner. Make someone else an owner first.', 409, 'last_owner');
    }
    const { error } = await ctx.admin.from('place_managers').delete().eq('place_id', ctx.place.id).eq('user_id', userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/places/[placeId]/managers/[userId]:', e instanceof Error ? e.message : e);
    return apiError('Couldn’t remove them', 500, 'remove_failed');
  }
}
