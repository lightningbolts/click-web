'use client';

import { useState } from 'react';
import { UserX } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { EmptyState } from '@/components/ds/EmptyState';
import { toast } from '@/components/ds/Toast';
import { authedJson } from '@/lib/api/authedJson';
import type { BlockedPerson } from '@/lib/server/settings/loadSettings';

/** Blocked people (spec §7.8): one row each with "Unblock" behind a confirm. */
export function BlockedSettings({ initial }: { initial: BlockedPerson[] }) {
  const [people, setPeople] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const unblock = async (p: BlockedPerson) => {
    const ok = await confirm({
      title: `Unblock ${p.name}?`,
      message: 'They’ll be able to see you and message you again. They won’t be told.',
      confirmLabel: 'Unblock',
      cancelLabel: 'Keep blocked',
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      await authedJson(`/api/safety/block?blocked_id=${encodeURIComponent(p.id)}`, { method: 'DELETE', fallback: 'Couldn’t unblock.' });
      setPeople((cur) => cur.filter((x) => x.id !== p.id));
      toast.success(`${p.name} unblocked`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Couldn’t unblock.');
    } finally {
      setBusy(null);
    }
  };

  if (people.length === 0) {
    return <EmptyState icon={UserX} title="No one is blocked" body="People you block from a profile or chat show up here." />;
  }

  return (
    <>
      <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]" data-testid="blocked-list">
        {people.map((p) => (
          <li key={p.id} className="flex min-h-16 items-center gap-3 px-4 py-2 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
            <Avatar seed={p.id} name={p.name} src={p.avatarUrl} size={40} />
            <span className="type-body-strong min-w-0 flex-1 truncate text-fg">{p.name}</span>
            <Button size="sm" variant="secondary" loading={busy === p.id} disabled={busy != null} onClick={() => void unblock(p)}>
              Unblock
            </Button>
          </li>
        ))}
      </ul>
      {confirmDialog}
    </>
  );
}
