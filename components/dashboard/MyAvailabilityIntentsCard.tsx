'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  AVAILABILITY_INTENT_DURATION_PRESETS,
  DEFAULT_AVAILABILITY_INTENT_DURATION_MS,
} from '@/lib/availabilityIntentDurations';

type IntentRow = {
  id: string;
  timeframe: string;
  intent_tag: string;
  expires_at: string;
};

const DURATION_OPTIONS = AVAILABILITY_INTENT_DURATION_PRESETS;

const easeOut = [0.22, 1, 0.36, 1] as const;

type Props = {
  getAuthHeaders: () => Promise<HeadersInit>;
};

/**
 * Memory Box card: shows your active availability intents and lets you add one (matches mobile presets).
 */
export default function MyAvailabilityIntentsCard({ getAuthHeaders }: Props) {
  const [intents, setIntents] = useState<IntentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  const [durationMs, setDurationMs] = useState(DEFAULT_AVAILABILITY_INTENT_DURATION_MS);

  const load = useCallback(async () => {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/user/availability-intents', { headers });
      const json = (await res.json().catch(() => ({}))) as { intents?: IntentRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || res.statusText);
      setIntents(Array.isArray(json.intents) ? json.intents : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load availability');
      setIntents([]);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tag.trim();
    if (!trimmed || trimmed.length > 25) {
      setError(trimmed ? 'Tag must be 25 characters or less' : 'Enter what you’re open to');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/user/availability-intents', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent_tag: trimmed,
          durationMs,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || res.statusText);
      setTag('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/user/availability-intents?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || res.statusText);
      setIntents((prev) => prev.filter((r) => r.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not remove');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: easeOut }}
      className="fc-card rounded-[16px] border border-border-hard p-6"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-sky-500/15 rounded-xl shrink-0">
          <CalendarClock className="w-5 h-5 text-sky-400" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-on-surface">Open to meet</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Share a short intent (coffee, study, walk…). Connections see it on your profile while it’s active.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant py-4">
          <Loader2 className="w-4 h-4 animate-spin text-[#630ed4]" />
          Loading…
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.32, ease: easeOut }}
        >
          {intents.length > 0 ? (
            <div className="mb-5 space-y-2">
              <motion.p
                className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.28, delay: 0.04, ease: easeOut }}
              >
                Active now
              </motion.p>
              <ul className="space-y-2">
                <AnimatePresence initial={false} mode="popLayout">
                  {intents.map((row, i) => (
                    <motion.li
                      key={row.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{
                        duration: 0.28,
                        delay: i * 0.055,
                        ease: easeOut,
                        layout: { duration: 0.22, ease: easeOut },
                      }}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border-hard/90 bg-surface-container/40 px-3 py-2"
                    >
                      <div className="min-w-0 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#630ed4]/35 bg-[#630ed4]/10 px-2.5 py-0.5 text-xs text-sky-200 truncate max-w-[200px]">
                          {row.intent_tag.trim()}
                        </span>
                        <span className="text-xs text-on-surface-variant">{row.timeframe}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        disabled={deletingId === row.id}
                        className="shrink-0 rounded-lg p-2 text-on-surface-variant hover:bg-zinc-800 hover:text-red-700 dark:text-red-400 transition-colors disabled:opacity-50"
                        aria-label="Remove intent"
                      >
                        {deletingId === row.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          ) : (
            <motion.div
              className="mb-5 rounded-xl border border-border-hard/80 bg-surface-container/30 px-3 py-3 text-sm text-on-surface-variant"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: easeOut }}
            >
              No active intent — add one below so friends know what you’re up for.
            </motion.div>
          )}

          <motion.form
            onSubmit={submit}
            className={`space-y-3 ${intents.length > 0 ? 'mt-4 border-t border-border-hard/80 pt-4' : ''}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Add intent</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value.slice(0, 25))}
                placeholder="e.g. Coffee, Study session"
                maxLength={25}
                className="flex-1 rounded-xl border border-border-hard bg-surface px-3 py-2.5 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-[#630ed4]/50"
              />
              <select
                value={durationMs}
                onChange={(e) => setDurationMs(Number(e.target.value))}
                className="rounded-xl border border-border-hard bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-[#630ed4]/50 sm:min-w-[140px]"
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.ms} value={o.ms}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={saving || !tag.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#630ed4] to-[#6520c0] px-4 py-2.5 text-sm font-medium text-on-surface hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none transition-opacity"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Share availability
            </button>
          </motion.form>
        </motion.div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-700 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </motion.section>
  );
}
