import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, action, first_name, last_name, birthday } = body as {
      email?: string;
      password?: string;
      action?: string;
      first_name?: string;
      last_name?: string;
      birthday?: string;
    };

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Safe to ignore from Server Components — middleware handles refresh.
            }
          },
        },
      }
    );

    if (action === 'signup') {
      if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
        return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
      }
      const fn = typeof first_name === 'string' ? first_name.trim() : '';
      const ln = typeof last_name === 'string' ? last_name.trim() : '';
      const bd = typeof birthday === 'string' ? birthday.trim() : '';
      const display = [fn, ln].filter(Boolean).join(' ').trim();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            ...(fn ? { first_name: fn } : {}),
            ...(ln ? { last_name: ln } : {}),
            ...(bd ? { birthday: bd } : {}),
            ...(display ? { full_name: display, name: display } : {}),
          },
        },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: 'Check your email to confirm your account!',
        user: data.user
      });
    } else if (action === 'login') {
      if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
        return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        user: data.user,
        session: data.session
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

