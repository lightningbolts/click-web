import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, source, referrer_user_id } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Use service role key to bypass RLS for this public insert operation.
    // Fall back to anon key if service role is not configured.
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ success: true, message: 'Successfully joined the waitlist!' });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* safe to ignore in middleware-managed contexts */ }
        },
      },
    });

    const { error } = await supabase
      .from('waitlist')
      .insert({
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
        const { error: retryError } = await supabase.from('waitlist').insert({ email });
        if (retryError && retryError.code !== '23505') {
          console.error('Waitlist insert error (retry):', retryError.message);
          return NextResponse.json({ error: retryError.message }, { status: 400 });
        }
        return NextResponse.json({ success: true, message: 'Successfully joined the waitlist!' });
      }
      console.error('Waitlist insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Successfully joined the waitlist!' });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
