import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { placeManagerInviteBodySchema } from '@/lib/api/schemas/places';
import { createInvite, emailInvite, inviteUrl, loadPendingInvites, normalizeEmail } from '@/lib/server/places/invites';
import { requirePlaceManagerContext } from '@/lib/server/places/routeContext';
import { loadPlaceTeam } from '@/lib/server/places/team';

/**
 * GET /api/places/[placeId]/managers — the team (any manager; emails and pending invites for
 * owners only): `{ managers, invites }`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const ctx = await requirePlaceManagerContext(request, (await params).placeId);
    if (!ctx.ok) return ctx.response;
    const owner = ctx.role === 'owner';
    const [managers, invites] = await Promise.all([
      loadPlaceTeam(ctx.admin, ctx.place.id, { includeEmail: owner }),
      owner ? loadPendingInvites(ctx.admin, ctx.place.id) : Promise.resolve([]),
    ]);
    return NextResponse.json({ managers, invites }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET /api/places/[placeId]/managers:', e instanceof Error ? e.message : e);
    return apiError('Internal Server Error', 500);
  }
}

/**
 * POST { email, role } — owner invites someone. Emails them (best effort) and returns
 * `{ invite, invite_url, emailed }` so the owner can share the link directly too.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const ctx = await requirePlaceManagerContext(request, (await params).placeId, { roles: ['owner'] });
    if (!ctx.ok) return ctx.response;
    const parsed = await parseBody(request, placeManagerInviteBodySchema);
    if (!parsed.ok) return parsed.response;
    const email = normalizeEmail(parsed.data.email);
    if (!email) return apiError('Enter a valid email address', 400, 'invalid_email');

    const team = await loadPlaceTeam(ctx.admin, ctx.place.id, { includeEmail: true });
    if (team.some((m) => m.email?.toLowerCase() === email)) return apiError('They already manage this Place', 409, 'already_member');

    const { token, invite } = await createInvite(ctx.admin, { placeId: ctx.place.id, email, role: parsed.data.role, invitedBy: ctx.user.id });
    const emailed = await emailInvite(ctx.admin, email, token).catch(() => false);
    return NextResponse.json({ invite, invite_url: inviteUrl(token), emailed }, { status: 201 });
  } catch (e) {
    console.error('POST /api/places/[placeId]/managers:', e instanceof Error ? e.message : e);
    return apiError('Couldn’t send the invite', 500, 'invite_failed');
  }
}
