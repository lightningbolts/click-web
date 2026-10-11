import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Server-side sign-out handler.
 *
 * Ends this browser's Supabase session on the server and removes its auth cookies, so the
 * browser is fully signed out (not just on the client side). Other devices stay signed in.
 */
export async function POST() {
  try {
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

    // This browser only: the default (`global`) revokes every session of the account, signing
    // its phones and other browsers out too. Settings › Sign out everywhere is the global one.
    await supabase.auth.signOut({ scope: 'local' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Sign out error:', error);
    return NextResponse.json({ error: 'Sign out failed' }, { status: 500 });
  }
}
