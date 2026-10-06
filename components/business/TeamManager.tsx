'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Mail, UserPlus } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { Dialog } from '@/components/ds/Dialog';
import { IconButton } from '@/components/ds/IconButton';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { StatusPill } from '@/components/ds/StatusPill';
import { Select, TextField } from '@/components/ds/TextField';
import { toast } from '@/components/ds/Toast';
import { authedJson } from '@/lib/api/authedJson';
import type { PlaceRole } from '@/lib/places/workspace';

export type TeamRow = { userId: string; name: string; avatarUrl: string | null; role: PlaceRole; email: string | null };
export type InviteRow = { id: string; email: string; role: PlaceRole; expired: boolean };

export const ROLE_LABEL: Record<PlaceRole, string> = { owner: 'Owner', manager: 'Manager', viewer: 'Viewer' };
const ROLE_HELP: Record<PlaceRole, string> = {
  owner: 'Everything, including billing and the team.',
  manager: 'Edit the profile, host events and see Insights.',
  viewer: 'See everything; change nothing.',
};

/** Whether this row's role or membership can change without leaving the Place ownerless. */
export function isLastOwner(team: Pick<TeamRow, 'role'>[], row: Pick<TeamRow, 'role'>): boolean {
  return row.role === 'owner' && team.filter((m) => m.role === 'owner').length <= 1;
}

function InviteDialog({ placeId, open, onOpenChange, onInvited }: { placeId: string; open: boolean; onOpenChange: (o: boolean) => void; onInvited: (i: InviteRow) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlaceRole>('manager');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ url: string; emailed: boolean } | null>(null);

  const reset = () => {
    setEmail('');
    setRole('manager');
    setError(null);
    setSent(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await authedJson<{ invite: InviteRow; invite_url: string; emailed: boolean }>(`/api/places/${placeId}/managers`, {
        method: 'POST',
        body: { email, role },
        fallback: 'Couldn’t send the invite.',
      });
      onInvited(res.invite);
      setSent({ url: res.invite_url, emailed: res.emailed });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send the invite.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={sent ? 'Invite ready' : 'Invite someone'}
      size="sm"
      footer={
        sent ? (
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" variant="primary" loading={busy} disabled={!email.trim()}>
              Send invite
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col gap-3">
          <p className="type-body text-fg-secondary">
            {sent.emailed ? `We emailed ${email}. You can also share this link with them:` : 'Share this link with them. It works once, for 14 days:'}
          </p>
          <div className="flex items-center gap-2 rounded-md bg-fill-subtle py-1 pl-3 pr-1">
            <span className="type-meta min-w-0 flex-1 truncate text-fg">{sent.url}</span>
            <IconButton
              icon={Copy}
              size="sm"
              aria-label="Copy invite link"
              onClick={() =>
                void navigator.clipboard.writeText(sent.url).then(
                  () => toast.success('Link copied'),
                  () => toast.error('Couldn’t copy.'),
                )
              }
            />
          </div>
          <p className="type-meta text-fg-tertiary">They sign in with {email} to accept.</p>
        </div>
      ) : (
        <form id="invite-form" onSubmit={submit} className="flex flex-col gap-4">
          <TextField label="Email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as PlaceRole)} help={ROLE_HELP[role]}>
            <option value="manager">Manager</option>
            <option value="viewer">Viewer</option>
            <option value="owner">Owner</option>
          </Select>
          {error ? <InlineNotice variant="destructive">{error}</InlineNotice> : null}
        </form>
      )}
    </Dialog>
  );
}

/**
 * Team (spec §9.5): everyone who manages the Place. Owners invite by email, change roles and
 * remove people; the last owner stays put. Others see the list read-only.
 */
export function TeamManager({
  placeId,
  viewerId,
  isOwner,
  initialTeam,
  initialInvites,
}: {
  placeId: string;
  viewerId: string;
  isOwner: boolean;
  initialTeam: TeamRow[];
  initialInvites: InviteRow[];
}) {
  const router = useRouter();
  const [team, setTeam] = useState(initialTeam);
  const [invites, setInvites] = useState(initialInvites);
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const changeRole = async (row: TeamRow, role: PlaceRole) => {
    const previous = team;
    setTeam((cur) => cur.map((m) => (m.userId === row.userId ? { ...m, role } : m)));
    try {
      await authedJson(`/api/places/${placeId}/managers/${row.userId}`, { method: 'PATCH', body: { role }, fallback: 'Couldn’t change the role.' });
      toast.success(`${row.name} is now ${ROLE_LABEL[role].toLowerCase()}`);
      if (row.userId === viewerId) router.refresh();
    } catch (e) {
      setTeam(previous);
      toast.error(e instanceof Error ? e.message : 'Couldn’t change the role.');
    }
  };

  const remove = async (row: TeamRow) => {
    const self = row.userId === viewerId;
    const ok = await confirm({
      title: self ? 'Leave this Place?' : `Remove ${row.name}?`,
      message: self ? 'You’ll lose access to this Place’s workspace.' : 'They’ll lose access to this Place’s workspace right away.',
      confirmLabel: self ? 'Leave' : 'Remove',
      cancelLabel: self ? 'Stay' : 'Keep',
      destructive: true,
    });
    if (!ok) return;
    setBusy(row.userId);
    try {
      await authedJson(`/api/places/${placeId}/managers/${row.userId}`, { method: 'DELETE', fallback: 'Couldn’t remove them.' });
      setTeam((cur) => cur.filter((m) => m.userId !== row.userId));
      toast.success(self ? 'You left this Place' : `${row.name} removed`);
      if (self) router.push('/business');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t remove them.');
    } finally {
      setBusy(null);
    }
  };

  const cancelInvite = async (invite: InviteRow) => {
    setBusy(invite.id);
    try {
      await authedJson(`/api/places/${placeId}/managers/invites/${invite.id}`, { method: 'DELETE', fallback: 'Couldn’t cancel the invite.' });
      setInvites((cur) => cur.filter((i) => i.id !== invite.id));
      toast.success('Invite canceled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t cancel the invite.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      {isOwner ? (
        <div className="flex justify-end">
          <Button variant="primary" icon={UserPlus} onClick={() => setInviting(true)}>
            Invite
          </Button>
        </div>
      ) : null}

      <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]" data-testid="team-list">
        {team.map((m) => {
          const locked = isLastOwner(team, m);
          return (
            <li key={m.userId} className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
              <Avatar seed={m.userId} name={m.name} src={m.avatarUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="type-body-strong block truncate text-fg">
                  {m.name}
                  {m.userId === viewerId ? <span className="type-meta font-normal text-fg-tertiary"> (you)</span> : null}
                </span>
                {m.email ? <span className="type-meta block truncate text-fg-tertiary">{m.email}</span> : null}
              </span>
              {isOwner ? (
                <>
                  <Select
                    label={`Role for ${m.name}`}
                    hideLabel
                    value={m.role}
                    disabled={locked}
                    onChange={(e) => void changeRole(m, e.target.value as PlaceRole)}
                    className="w-36"
                    title={locked ? 'A Place needs at least one owner' : undefined}
                  >
                    <option value="owner">Owner</option>
                    <option value="manager">Manager</option>
                    <option value="viewer">Viewer</option>
                  </Select>
                  <Button
                    size="sm"
                    variant="plain"
                    className="text-destructive"
                    disabled={locked || busy != null}
                    loading={busy === m.userId}
                    onClick={() => void remove(m)}
                  >
                    {m.userId === viewerId ? 'Leave' : 'Remove'}
                  </Button>
                </>
              ) : (
                <StatusPill variant={m.role === 'owner' ? 'tinted' : 'neutral'}>{ROLE_LABEL[m.role]}</StatusPill>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && invites.length > 0 ? (
        <section aria-labelledby="team-invites">
          <h2 id="team-invites" className="type-meta mb-2 px-4 font-semibold text-fg-secondary">
            Invited
          </h2>
          <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
            {invites.map((i) => (
              <li key={i.id} className="flex min-h-14 items-center gap-3 px-4 py-2 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
                <Mail size={18} aria-hidden className="w-10 text-fg-secondary" />
                <span className="type-body min-w-0 flex-1 truncate text-fg">{i.email}</span>
                <StatusPill variant={i.expired ? 'warning' : 'neutral'}>{i.expired ? 'Expired' : ROLE_LABEL[i.role]}</StatusPill>
                <Button size="sm" variant="plain" className="text-fg-secondary" loading={busy === i.id} disabled={busy != null} onClick={() => void cancelInvite(i)}>
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!isOwner ? <p className="type-meta px-4 text-fg-tertiary">Only an owner can change the team.</p> : null}

      {isOwner ? (
        <InviteDialog
          placeId={placeId}
          open={inviting}
          onOpenChange={setInviting}
          onInvited={(invite) => setInvites((cur) => [invite, ...cur.filter((c) => c.email !== invite.email)])}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}
