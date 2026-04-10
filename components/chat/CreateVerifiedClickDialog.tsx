'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildInitialVerifiedClickName,
  createVerifiedClickFromConnections,
  verifiedCliqueEdgesExist,
} from '@/lib/chat/createVerifiedClick';

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
      setErr('You already have a verified click with this group.');
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
          ? 'You already have a verified click with this group.'
          : raw,
      );
    } finally {
      setBusy(false);
    }
  };

  const overlayEase = [0.22, 1, 0.36, 1] as const;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="create-verified-click-overlay"
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-4 pb-6 pt-14 sm:items-center sm:py-10 sm:pb-10"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: overlayEase }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-click-title"
            className="flex max-h-[min(420px,calc(100dvh-9rem))] w-full max-w-md flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:max-h-[min(480px,calc(100dvh-10rem))]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 56 }}
            transition={{ duration: 0.28, ease: overlayEase }}
            style={{ willChange: 'transform, opacity' }}
          >
            <div className="shrink-0">
              <h2 id="create-click-title" className="text-lg font-semibold text-white">
                Create verified click
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Pick friends who are pairwise connected (active or kept). Server verifies every edge.
              </p>
              <p
                className={`mt-2 min-h-[1.25rem] text-xs text-[#8338EC] ${
                  !eligibilityReady && friends.length > 0 ? 'visible' : 'invisible'
                }`}
                aria-live="polite"
              >
                Checking who can join…
              </p>
              {duplicateMemberSet ? (
                <p className="mt-2 text-xs text-red-400">You already have a verified click with this group.</p>
              ) : null}
            </div>
            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {friends.length === 0 ? (
                <p className="text-sm text-zinc-500">No active 1:1 connections yet.</p>
              ) : (
                friends.map((f) => {
                  const checked = selected.has(f.userId);
                  const enabled = checked || (eligibilityReady && mask[f.userId] === true);
                  return (
                    <label
                      key={f.connectionId}
                      className={`flex items-center gap-3 rounded-xl border border-zinc-800/80 px-3 py-2 ${
                        enabled ? 'cursor-pointer bg-zinc-900/60' : 'cursor-default opacity-40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#8338EC]"
                        checked={checked}
                        disabled={!enabled}
                        onChange={() => toggle(f.userId)}
                      />
                      <span className="text-sm text-white">{f.name}</span>
                    </label>
                  );
                })
              )}
            </div>
            {err ? <p className="mt-3 shrink-0 text-sm text-red-400">{err}</p> : null}
            <div className="mt-5 flex shrink-0 justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-[#8338EC] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                disabled={
                  busy ||
                  selected.size === 0 ||
                  !eligibilityReady ||
                  !createOk ||
                  duplicateMemberSet
                }
                onClick={() => void submit()}
              >
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
