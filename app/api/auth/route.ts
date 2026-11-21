import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseBody } from '@/lib/api/parseBody';
import { authBodySchema } from '@/lib/api/schemas/user';
import { applyAuthCookies, authCookieDomainFor, collectingCookieAdapter } from '@/lib/auth/cookieDomain';

/** Deliberately excludes session tokens and mutable auth metadata from JSON. */
function publicAuthUser(user: User | null) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    created_at: user.created_at ?? null,
  };
}

function hasValidPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8;
}

function hasLoginPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length > 0;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, authBodySchema);
    if (!parsed.ok) return parsed.response;
    const { email, password, action, first_name, last_name, birthday } = parsed.data;

    const domain = authCookieDomainFor(request.nextUrl.hostname);
    const cookieAdapter = collectingCookieAdapter(request);
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: domain ? { domain } : {},
        cookies: cookieAdapter,
      }
    );
    // The new session, minus any older host-only one the browser would otherwise read first.
    const json = (body: unknown, init?: ResponseInit) => {
      const response = NextResponse.json(body, init);
      applyAuthCookies(response, cookieAdapter.written, request.cookies.getAll(), domain);
      return response;
    };

    if (action === 'signup') {
      if (typeof email !== 'string' || !email.trim() || !hasValidPassword(password)) {
        return json({ error: 'Use an email address and a password with at least 8 characters' }, { status: 400 });
      }
      const fn = typeof first_name === 'string' ? first_name.trim() : '';
      const ln = typeof last_name === 'string' ? last_name.trim() : '';
      const bd = typeof birthday === 'string' ? birthday.trim() : '';
      const display = [fn, ln].filter(Boolean).join(' ').trim();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${request.nextUrl.origin}/api/auth/callback`,
          data: {
            ...(fn ? { first_name: fn } : {}),
            ...(ln ? { last_name: ln } : {}),
            ...(bd ? { birthday: bd } : {}),
            ...(display ? { full_name: display, name: display } : {}),
          },
        },
      });

      if (error) {
        console.warn('[auth] signup failed:', error.message);
        return json({ error: 'Unable to create this account' }, { status: 400 });
      }

      return json({
        success: true,
        message: 'Check your email to confirm your account!',
        user: publicAuthUser(data.user),
      });
    } else if (action === 'login') {
      if (typeof email !== 'string' || !email.trim() || !hasLoginPassword(password)) {
        return json({ error: 'Email and password are required' }, { status: 400 });
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.warn('[auth] login failed:', error.message);
        return json({ error: 'Unable to sign in with those credentials' }, { status: 400 });
      }

      return json({
        success: true,
        user: publicAuthUser(data.user),
      });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
