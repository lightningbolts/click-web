'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createVerifiedClickFromConnections,
  verifiedCliqueEdgesExist,
} from '@/lib/chat/createVerifiedClick';

export type ClickFriendOption = { connectionId: string; userId: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supabase: SupabaseClient;
  currentUserId: string;
  friends: ClickFriendOption[];
  onCreated: () => void;
};

export default function CreateVerifiedClickDialog({
  open,
  onOpenChange,
  supabase,
  currentUserId,
  friends,
  onCreated,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mask, setMask] = useState<Record<string, boolean>>({});
  const [createOk, setCreateOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setMask({});
      setCreateOk(false);
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !currentUserId) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, boolean> = {};
      for (const f of friends) {
        if (selected.has(f.userId)) {
          next[f.userId] = true;
        } else {
          const ok = await verifiedCliqueEdgesExist(supabase, [
            currentUserId,
            ...Array.from(selected),
            f.userId,
          ]);
          next[f.userId] = ok;
        }
      }
      if (!cancelled) setMask(next);
      if (selected.size === 0) {
        if (!cancelled) setCreateOk(false);
        return;
      }
      const fullOk = await verifiedCliqueEdgesExist(supabase, [
        currentUserId,
        ...Array.from(selected),
      ]);
      if (!cancelled) setCreateOk(fullOk);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentUserId, friends, selected, supabase]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await createVerifiedClickFromConnections(supabase, currentUserId, Array.from(selected));
      onCreated();
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create click');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-click-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <h2 id="create-click-title" className="text-lg font-semibold text-white">
          Create verified click
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Pick friends who are pairwise connected (active or kept). Server verifies every edge.
        </p>
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
          {friends.length === 0 ? (
            <p className="text-sm text-zinc-500">No active 1:1 connections yet.</p>
          ) : (
            friends.map((f) => {
              const checked = selected.has(f.userId);
              const enabled = checked || mask[f.userId];
              return (
                <label
                  key={f.connectionId}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-800/80 px-3 py-2 ${
                    enabled ? 'bg-zinc-900/60' : 'opacity-40'
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
        {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
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
            disabled={busy || selected.size === 0 || !createOk}
            onClick={() => void submit()}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
