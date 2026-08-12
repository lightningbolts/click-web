import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { waitlistBodySchema } from '@/lib/api/schemas/user';
import { apiError } from '@/lib/api/errors';
import { publicRoute } from '@/lib/server/withAuth';

export { publicRoute };

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, waitlistBodySchema);
    if (!parsed.ok) return parsed.response;

    const { email, source, referrer_user_id } = parsed.data;

    let admin;
    try {
      admin = createAdminClient();
    } catch {
      return apiError(
        'Waitlist is temporarily unavailable',
        503,
        'service_unavailable',
      );
    }

    const { error } = await admin.from('waitlist').insert({
      email,
      ...(source ? { source } : {}),
      ...(referrer_user_id ? { referrer_user_id } : {}),
    });

    if (error) {
      // Duplicate email — still success from user perspective
      if (error.code === '23505') {
        return NextResponse.json({
          success: true,
          message: "You're already on the waitlist!",
        });
      }
      // Column does not exist — attribution columns not yet migrated; retry with email only
      if (error.code === '42703') {
        const { error: retryError } = await admin.from('waitlist').insert({ email });
        if (retryError && retryError.code !== '23505') {
          console.error('Waitlist insert error (retry):', retryError.message);
          return apiError(retryError.message, 400, 'waitlist_insert_failed');
        }
        return NextResponse.json({
          success: true,
          message: 'Successfully joined the waitlist!',
        });
      }
      console.error('Waitlist insert error:', error.message);
      return apiError(error.message, 400, 'waitlist_insert_failed');
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully joined the waitlist!',
    });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return apiError('Internal server error', 500, 'internal_error');
  }
}
