import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { acceptInvite, loadInviteByToken } from '@/lib/server/places/invites';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

/**
 * POST /api/places/invites/[token]/accept — the signed-in invitee joins the Place's team.
 * The account's email must match the invite. `{ place_id, role }`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return apiError('Unauthorized', 401);
    const admin = createAdminSupabaseClient();
    const invite = await loadInviteByToken(admin, decodeURIComponent((await params).token));
    if (invite.kind === 'missing') return apiError('This invite isn’t valid', 404, 'invite_missing');
    if (invite.kind === 'used') return apiError('This invite was already used', 409, 'invite_used');
    if (invite.kind === 'expired') return apiError('This invite has expired. Ask for a new one.', 410, 'invite_expired');
    const result = await acceptInvite(admin, invite, { id: user.id, email: user.email ?? null });
    if (result === 'wrong_email') return apiError(`This invite is for ${invite.email}. Sign in with that email.`, 403, 'wrong_email');
    return NextResponse.json({ place_id: invite.placeId, role: invite.role });
  } catch (e) {
    console.error('POST /api/places/invites/[token]/accept:', e instanceof Error ? e.message : e);
    return apiError('Couldn’t accept the invite', 500, 'accept_failed');
  }
}
