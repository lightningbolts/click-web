import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { waitlistBodySchema } from '@/lib/api/schemas/user';
import { apiError } from '@/lib/api/errors';
import { isRateLimited, CONNECTIONS_RATE_LIMIT_BINDING } from '@/lib/server/rateLimit';
import { clientIpFromRequest } from '@/lib/events/eventMetadata';
import {
  hashVerificationToken, newVerificationToken, sendVerificationEmail,
  verificationEmailConfig, WAITLIST_PENDING_MESSAGE,
} from '@/lib/server/waitlistVerification';

export const publicRoute = true;

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, waitlistBodySchema);
    if (!parsed.ok) return parsed.response;

    if (await isRateLimited({
      bindingName: CONNECTIONS_RATE_LIMIT_BINDING,
      key: `waitlist:${clientIpFromRequest(request)}`, limit: 10, windowMs: 60_000,
    })) return apiError('Too many attempts. Please try again in a minute.', 429, 'rate_limited', { 'Retry-After': '60' });

    const config = verificationEmailConfig();
    const admin = createAdminClient();
    const token = newVerificationToken();
    const tokenHash = await hashVerificationToken(token);
    const { email, source, referrer_user_id } = parsed.data;
    const { data: shouldSend, error } = await admin.rpc('request_waitlist_verification', {
      p_email: email, p_token_hash: tokenHash,
      p_source: source ?? null, p_referrer_user_id: referrer_user_id ?? null,
    });
    if (error || typeof shouldSend !== 'boolean') throw new Error('Waitlist storage unavailable');
    if (shouldSend) await sendVerificationEmail(email, token, tokenHash, config);
    // Same response for new, throttled, and already-confirmed addresses.
    // Sending mail is not proof of ownership.
    return NextResponse.json({ success: true, verificationRequired: true, message: WAITLIST_PENDING_MESSAGE }, {
      status: 202, headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    // Do not log addresses, tokens, provider response bodies, or API keys.
    return apiError('Unable to send a confirmation email. Please try again in two minutes.', 503, 'service_unavailable');
  }
}
