import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/withAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { ensureOrganizerAccount, createOnboardingLink } from '@/lib/server/ticketing/connect';
import { parseBody } from '@/lib/api/parseBody';
import { connectOnboardingBodySchema } from '@/lib/api/schemas/ticketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start (or resume) Stripe Connect hosted onboarding for the signed-in
 * organizer. Account Links are single-use and never stored; the client opens
 * the returned URL in the system browser. Returning from Stripe proves
 * nothing — readiness is resolved by GET /api/payments/connect/status.
 */
export async function POST(request: NextRequest) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  try {
    const parsed = request.body
      ? await parseBody(request, connectOnboardingBodySchema)
      : { ok: true as const, data: { return_to: undefined } };
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const admin = createAdminSupabaseClient();
    const account = await ensureOrganizerAccount(admin, auth.user.id, auth.user.email ?? null);
    const onboardingUrl = await createOnboardingLink(account.stripe_account_id, body.return_to);
    return NextResponse.json({
      onboarding_url: onboardingUrl,
      onboarding_state: account.onboarding_state,
    });
  } catch (e) {
    console.error('Connect onboarding failed:', e);
    return NextResponse.json({ error: 'Onboarding unavailable' }, { status: 502 });
  }
}
