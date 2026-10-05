import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { removeAllDropMediaForUser } from '@/lib/server/drops/storage';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

/**
 * DELETE /api/user/delete — permanently deletes the signed-in account.
 * Accepts `Authorization: Bearer` (iOS deletes in-app, App Store 5.1.1(v)) or the web cookie session.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
