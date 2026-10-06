'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildInitialVerifiedClickName,
  createVerifiedClickFromConnections,
  verifiedCliqueEdgesExist,
} from '@/lib/chat/createVerifiedClick';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { Dialog } from '@/components/ds/Dialog';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Toggle } from '@/components/ds/Toggle';
import { cn } from '@/lib/cn';

export type ClickFriendOption = { connectionId: string; userId: string; name: string };

/** Stable key for an unordered set of user ids (must match server-side member-set logic). */
export function memberSetKeySorted(userIds: Iterable<string>): string {
  return [...userIds].sort().join('\u0001');
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supabase: SupabaseClient;
  currentUserId: string;
  /** Display label for the signed-in user (first word used in the default group name). */
  currentUserLabel: string;
  friends: ClickFriendOption[];
  /** Sorted member-set keys for verified clicks the user already belongs to. */
  existingVerifiedMemberSetKeys?: ReadonlySet<string>;
  onCreated: () => void;
};

export default function CreateVerifiedClickDialog({
  open,
  onOpenChange,
  supabase,
  currentUserId,
  currentUserLabel,
  friends,
  existingVerifiedMemberSetKeys = new Set<string>(),
  onCreated,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mask, setMask] = useState<Record<string, boolean>>({});
  const [createOk, setCreateOk] = useState(false);
  const [eligibilityReady, setEligibilityReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setMask({});
      setCreateOk(false);
      setEligibilityReady(false);
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !currentUserId) return;
    let cancelled = false;
    (async () => {
      setEligibilityReady(false);
      if (friends.length === 0) {
        setMask({});
        setCreateOk(false);
        setEligibilityReady(true);
        return;
      }
      const selectedArr = Array.from(selected);
      const [maskEntries, fullOk] = await Promise.all([
        Promise.all(
          friends.map(async (f) => {
            if (selected.has(f.userId)) {
              return [f.userId, true] as const;
            }
            const ok = await verifiedCliqueEdgesExist(supabase, [
              currentUserId,
              ...selectedArr,
              f.userId,
            ]);
            return [f.userId, ok] as const;
          }),
        ),
        selected.size === 0
          ? Promise.resolve(false)
          : verifiedCliqueEdgesExist(supabase, [currentUserId, ...selectedArr]),
      ]);
      if (cancelled) return;
      setMask(Object.fromEntries(maskEntries));
      setCreateOk(fullOk);
      setEligibilityReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentUserId, friends, selected, supabase]);

  const memberSetKey =
    open && selected.size > 0 ? memberSetKeySorted([currentUserId, ...selected]) : '';
  const duplicateMemberSet =
    memberSetKey.length > 0 && existingVerifiedMemberSetKeys.has(memberSetKey);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async () => {
    if (duplicateMemberSet) {
      setErr('You already have a verified group with these people.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const friendNameById = Object.fromEntries(friends.map((f) => [f.userId, f.name]));
      const initialName = buildInitialVerifiedClickName(
        currentUserId,
        currentUserLabel,
        Array.from(selected),
        friendNameById,
      );
      await createVerifiedClickFromConnections(
        supabase,
        currentUserId,
        Array.from(selected),
        initialName,
      );
      onCreated();
      onOpenChange(false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Could not create click';
      setErr(
        raw.toLowerCase().includes('verified click already exists')
          ? 'You already have a verified group with these people.'
          : raw,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      size="md"
      title="New verified group"
      description="Pick people who have all Clicked with each other. Every pair is checked before the group is created."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="plain" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={selected.size === 0 || !eligibilityReady || !createOk || duplicateMemberSet}
            onClick={() => void submit()}
          >
            Create group
          </Button>
        </div>
      }
    >
      <p className={cn('type-meta min-h-5 text-fg-tertiary', eligibilityReady || friends.length === 0 ? 'invisible' : 'visible')} aria-live="polite">
        Checking who can join…
      </p>
      {duplicateMemberSet ? (
        <InlineNotice variant="warning" className="mb-2">
          You already have a verified group with these people.
        </InlineNotice>
      ) : null}
      {friends.length === 0 ? (
        <p className="type-body py-6 text-center text-fg-secondary">No active Clicks yet.</p>
      ) : (
        <ul className="-mx-2 max-h-[min(50vh,360px)] overflow-y-auto">
          {friends.map((f) => {
            const checked = selected.has(f.userId);
            const enabled = checked || (eligibilityReady && mask[f.userId] === true);
            const id = `verified-group-${f.userId}`;
            return (
              <li key={f.connectionId} className={cn('flex h-14 items-center gap-3 rounded-md px-2', enabled ? 'hover:bg-hover' : 'opacity-40')}>
                <Avatar seed={f.userId} name={f.name} size={40} />
                <label htmlFor={id} className="type-body-strong min-w-0 flex-1 truncate text-fg">
                  {f.name}
                </label>
                <Toggle id={id} checked={checked} disabled={!enabled} onCheckedChange={() => toggle(f.userId)} />
              </li>
            );
          })}
        </ul>
      )}
      {err ? (
        <InlineNotice variant="destructive" live className="mt-3">
          {err}
        </InlineNotice>
      ) : null}
    </Dialog>
  );
}
