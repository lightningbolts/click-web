import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { removeAllDropMediaForUser } from '@/lib/server/drops/storage';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { isAppleUser, revokeAppleAuthorizationCode } from '@/lib/server/appleRevoke';
import { parseBody } from '@/lib/api/parseBody';
import { userDeleteBodySchema } from '@/lib/api/schemas/user';

/**
 * DELETE /api/user/delete — permanently deletes the signed-in account.
 * Accepts `Authorization: Bearer` (iOS deletes in-app, App Store 5.1.1(v)) or the web cookie session.
 * Apple sign-in accounts revoke their Apple tokens first when iOS sends an authorization code.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The web sends no body; iOS sends `{ apple_authorization_code }` for Apple accounts.
    let appleCode: string | undefined;
    if (request.body) {
      const parsed = await parseBody(request, userDeleteBodySchema);
      if (!parsed.ok) return parsed.response;
      appleCode = parsed.data.apple_authorization_code;
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('Missing Supabase service role key or URL');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // A fresh Sign in with Apple code from iOS: Apple's tokens are revoked with the account.
    if (appleCode && isAppleUser(user.app_metadata)) {
      const result = await revokeAppleAuthorizationCode(appleCode);
      if (result !== 'revoked') console.error('Apple token revocation on account deletion:', result);
    }

    await removeAllDropMediaForUser(adminAuthClient, user.id);
    // beacon_reports.reporter_id has no ON DELETE action, so the user's reports would block deletion.
    await adminAuthClient.from('beacon_reports').delete().eq('reporter_id', user.id);

    const { error } = await adminAuthClient.auth.admin.deleteUser(
      user.id
    );

    if (error) {
      console.error('Error deleting user:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
