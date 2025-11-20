import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Create a Supabase client with the auth token from the request
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false
      }
    });

    // Get auth token from cookie
    const authCookie = request.cookies.get('sb-access-token') ||
                      request.cookies.get('sb-lrgcwnmcscimkmslihxp-auth-token');

    if (authCookie) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(authCookie.value);

      if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Fetch connections for the user
      const { data: connections, error } = await supabase
        .from('connections')
        .select('*')
        .contains('user_ids', [user.id])
        .order('created', { ascending: false });

      if (error) {
        console.error('Error fetching connections:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ connections: connections || [] });
    }

    return NextResponse.json({ error: 'No auth token found' }, { status: 401 });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

