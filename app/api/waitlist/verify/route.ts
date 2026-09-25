import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { hashVerificationToken } from '@/lib/server/waitlistVerification';
import { isRateLimited, CONNECTIONS_RATE_LIMIT_BINDING } from '@/lib/server/rateLimit';
import { clientIpFromRequest } from '@/lib/events/eventMetadata';

export const publicRoute = true;
const bodySchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

// Explicit POST avoids consuming links when mail scanners prefetch the page.
export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  try {
    if (await isRateLimited({
      bindingName: CONNECTIONS_RATE_LIMIT_BINDING,
      key: `waitlist-confirm:${clientIpFromRequest(request)}`, limit: 10, windowMs: 60_000,
    })) return apiError('Too many attempts. Please try again in a minute.', 429, 'rate_limited', { 'Retry-After': '60' });
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('confirm_waitlist_email', {
      p_token_hash: await hashVerificationToken(parsed.data.token),
    });
    if (error) throw new Error('Confirmation unavailable');
    if (data !== true) return apiError('This link has expired or has already been used. Please request a new confirmation email.', 400, 'invalid_verification');
    return NextResponse.json({ success: true, verified: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return apiError('Confirmation is temporarily unavailable. Please try again.', 503, 'service_unavailable');
  }
}
