import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { AcceptInvite } from '@/components/business/AcceptInvite';
import { Button } from '@/components/ds/Button';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadInviteByToken } from '@/lib/server/places/invites';
import { loginHref } from '@/lib/shell/appNav';

export const metadata: Metadata = { title: 'Join a Place · Click for Business', robots: { index: false } };

const ROLE = { owner: 'an owner', manager: 'a manager', viewer: 'a viewer' } as const;

/** Where an invite email lands (spec §9.5 Team): check it, then join with one tap. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await params).token);
  const user = await getServerUser();
  if (!user) redirect(loginHref(`/business/invite/${encodeURIComponent(token)}`));
  const invite = await loadInviteByToken(createAdminSupabaseClient(), token);

  if (invite.kind !== 'ok') {
    const copy = {
      missing: 'This invite link isn’t valid. Ask the owner to send a new one.',
      used: 'This invite was already used.',
      expired: 'This invite has expired. Ask the owner to send a new one.',
    }[invite.kind];
    return (
      <AuthCard title="Invite unavailable" subtitle={copy}>
        <Button variant="secondary" size="lg" fullWidth href="/business">
          Go to Business
        </Button>
      </AuthCard>
    );
  }
  const matches = (user.email ?? '').toLowerCase() === invite.email.toLowerCase();
  return (
    <AuthCard title={`Join ${invite.placeName}`} subtitle={`You’re invited to help run ${invite.placeName} on Click as ${ROLE[invite.role]}.`}>
      {matches ? (
        <AcceptInvite token={token} />
      ) : (
        <p className="type-body text-fg-secondary">
          This invite is for <strong className="text-fg">{invite.email}</strong>. Sign out and sign in with that email to accept.
        </p>
      )}
    </AuthCard>
  );
}
