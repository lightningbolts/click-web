import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ds/Button';
import { safeNextPath } from '@/lib/shell/appNav';

export const metadata: Metadata = { title: 'Signing in · Click', robots: { index: false } };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);

/**
 * Email auth landing (spec §7.11), decided on the server so nothing redirects blindly:
 *  1. `?verified=signup` → "You're verified" (the API route set the session)
 *  2. `?error=…`         → the error, with a way forward
 *  3. `?code=…`          → /api/auth/callback (PKCE)
 *  4. `?token_hash=…`    → /api/auth/callback
 */
export default async function AuthCallbackPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  if (one(p.verified) === 'signup') {
    return (
      <AuthCard title="You’re verified" subtitle="Your email is confirmed. You can keep going here, or go back to the app.">
        <Button variant="primary" size="lg" fullWidth href="/">
          Continue
        </Button>
      </AuthCard>
    );
  }

  const code = one(p.code);
  if (code) {
    redirect(`/api/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safeNextPath(one(p.next)))}`);
  }
  const tokenHash = one(p.token_hash);
  const type = one(p.type);
  if (tokenHash && type && !one(p.error)) {
    redirect(`/api/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`);
  }

  const desc = one(p.error_description);
  const message = one(p.error) || one(p.error_code)
    ? desc
      ? desc.replace(/\+/g, ' ')
      : 'The link may have expired. Ask for a new one.'
    : 'This link is missing its sign-in details. Ask for a new one.';
  return (
    <AuthCard title="That link didn’t work" subtitle={message}>
      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" fullWidth href="/login">
          Log in
        </Button>
        <Button variant="plain" fullWidth href="/forgot-password">
          Reset your password
        </Button>
      </div>
    </AuthCard>
  );
}
