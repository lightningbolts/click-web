'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Loader2, Pencil, X } from 'lucide-react';
import {
  AVAILABILITY_INTENT_BUBBLE_CLASS,
  humanizeAvailabilityTimeframe,
  isIntentSweepExpired,
} from '@/lib/userProfile/availabilityIntentDisplay';

export type AvailabilityIntentClientRow = {
  id: string;
  timeframe: string;
  intent_tag: string;
  expires_at: string;
};

const PRESET_INTENT_TAGS = [
  'Coffee',
  'Lunch',
  'Walk',
  'Drinks',
  'Study',
  'Gym',
  'Networking',
  'Games',
] as const;

function buildRolling24hPayload(tag: string): { timeframe: string; intent_tag: string; expires_at: string } {
  const start = new Date();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const timeframe = `${start.toISOString()}/${end.toISOString()}`;
  return {
    timeframe,
    intent_tag: tag.trim().slice(0, 25),
    expires_at: end.toISOString(),
  };
}

type CurrentAvailabilitySectionProps = {
  getAuthHeaders: () => Promise<HeadersInit>;
};

export default function CurrentAvailabilitySection({ getAuthHeaders }: CurrentAvailabilitySectionProps) {
  const [intents, setIntents] = useState<AvailabilityIntentClientRow[]>([]);
  const [lastIntentUpdateAt, setLastIntentUpdateAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draftTags, setDraftTags] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const sweepExpired = useMemo(
    () => isIntentSweepExpired(lastIntentUpdateAt),
    [lastIntentUpdateAt],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/me/availability-intents', { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setLastIntentUpdateAt(
        typeof json.last_intent_update_at === 'string' ? json.last_intent_update_at : null,
      );
      const raw = json.intents;
      const rows: AvailabilityIntentClientRow[] = Array.isArray(raw)
        ? raw
            .filter(
              (r: unknown): r is AvailabilityIntentClientRow =>
                !!r &&
                typeof r === 'object' &&
                typeof (r as AvailabilityIntentClientRow).id === 'string' &&
                typeof (r as AvailabilityIntentClientRow).intent_tag === 'string',
            )
            .map((r: AvailabilityIntentClientRow) => ({
              id: r.id,
              timeframe: r.timeframe,
              intent_tag: r.intent_tag,
              expires_at: r.expires_at,
            }))
        : [];
      setIntents(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load availability');
      setIntents([]);
      setLastIntentUpdateAt(null);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node | null;
      if (t && popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openEditor = useCallback(() => {
    setDraftTags(new Set(intents.map((i) => i.intent_tag.trim()).filter(Boolean)));
    setOpen(true);
    setError(null);
  }, [intents]);

  const toggleDraft = useCallback((tag: string) => {
    setDraftTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const saveDraft = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const payload = {
        intents: Array.from(draftTags).map((t) => buildRolling24hPayload(t)),
      };
      const res = await fetch('/api/me/availability-intents', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      setLastIntentUpdateAt(
        typeof json.last_intent_update_at === 'string' ? json.last_intent_update_at : new Date().toISOString(),
      );
      const raw = json.intents;
      const rows: AvailabilityIntentClientRow[] = Array.isArray(raw)
        ? raw
            .filter(
              (r: unknown): r is AvailabilityIntentClientRow =>
                !!r &&
                typeof r === 'object' &&
                typeof (r as AvailabilityIntentClientRow).id === 'string' &&
                typeof (r as AvailabilityIntentClientRow).intent_tag === 'string',
            )
            .map((r: AvailabilityIntentClientRow) => ({
              id: r.id,
              timeframe: r.timeframe,
              intent_tag: r.intent_tag,
              expires_at: r.expires_at,
            }))
        : [];
      setIntents(rows);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [draftTags, getAuthHeaders]);

  const displayIntents = sweepExpired ? [] : intents;

  return (
    <section className="relative mb-6 rounded-3xl border border-zinc-800/90 bg-zinc-900/40 px-5 py-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[#3A86FF]" aria-hidden />
            Current availability
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            What you are open to in the next 24 hours — visible to your connections
          </p>
        </div>
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openEditor())}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-[#8338EC]/40 hover:text-white transition-colors"
        >
          {displayIntents.length === 0 ? (
            <>Set availability</>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </>
          )}
        </button>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin text-[#8338EC]" aria-hidden />
          Loading…
        </div>
      ) : error && !open ? (
        <p className="mt-3 text-xs text-red-400">{error}</p>
      ) : sweepExpired && displayIntents.length === 0 ? (
        <p className="mt-3 text-sm text-amber-200/90">
          Your previous availability expired (24h refresh). Set what you are open to now.
        </p>
      ) : displayIntents.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing set — tap <span className="text-zinc-400">Set availability</span> to share what you are up for.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {displayIntents.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={openEditor}
              className={`${AVAILABILITY_INTENT_BUBBLE_CLASS} cursor-pointer transition-opacity hover:opacity-90 text-left`}
            >
              <span className="font-medium">{row.intent_tag.trim()}</span>
              <span className="ml-2 text-[10px] text-sky-200/70">
                {humanizeAvailabilityTimeframe(row.timeframe)}
              </span>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute left-4 right-4 top-full z-30 mt-2 rounded-2xl border border-zinc-700/90 bg-zinc-950 p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Open to (next 24h)
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_INTENT_TAGS.map((tag) => {
                const on = draftTags.has(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleDraft(tag)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      on
                        ? 'border-[#3A86FF]/50 bg-[#3A86FF]/20 text-sky-100'
                        : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveDraft()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#8338EC] to-[#6520c0] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
