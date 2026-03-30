'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** Must match server max in `get_recent_sanitized_connections` (50). */
const PAGE_SIZE = 20;

export type SanitizedTickerConnection = {
  id: string;
  display_location: string;
  connection_method: string;
  weather_condition: string | null;
  created: number;
  created_utc: string | null;
};

const WEATHER_EMOJI: Record<string, string> = {
  rainy: '🌧️',
  rain: '🌧️',
  drizzle: '🌦️',
  sunny: '☀️',
  clear: '☀️',
  cloudy: '☁️',
  overcast: '☁️',
  snow: '❄️',
  snowy: '❄️',
  fog: '🌫️',
  mist: '🌫️',
  windy: '💨',
  storm: '⛈️',
  thunder: '⛈️',
};

function emojiForWeather(condition: string): string {
  const k = condition.trim().toLowerCase();
  for (const [key, emoji] of Object.entries(WEATHER_EMOJI)) {
    if (k.includes(key)) return emoji;
  }
  return '🌤️';
}

/** Connection moment in the viewer's local timezone and locale. */
export function formatConnectionLocalTime(c: SanitizedTickerConnection): string {
  const iso = c.created_utc?.trim();
  const d = iso ? new Date(iso) : new Date(c.created);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const sameCalendarDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (sameCalendarDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTickerLine(c: SanitizedTickerConnection): string {
  const place = c.display_location?.trim() || 'a new city';
  const timePart = formatConnectionLocalTime(c);
  const when = timePart ? ` at ${timePart}` : '';
  const w = c.weather_condition?.trim();
  if (w) {
    return `New Connection in ${place}${when} • ${emojiForWeather(w)} ${w}`;
  }
  return `New Connection in ${place}${when}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function parseSanitizedRow(x: unknown): SanitizedTickerConnection | null {
  if (!isRecord(x)) return null;
  const id = x.id;
  const display_location = x.display_location;
  const connection_method = x.connection_method;
  const created = x.created;
  if (typeof id !== 'string' || typeof display_location !== 'string') return null;
  if (typeof connection_method !== 'string') return null;
  if (typeof created !== 'number' || !Number.isFinite(created)) return null;
  const weather =
    x.weather_condition === null || x.weather_condition === undefined
      ? null
      : typeof x.weather_condition === 'string'
        ? x.weather_condition
        : null;
  const created_utc =
    x.created_utc === null || x.created_utc === undefined
      ? null
      : typeof x.created_utc === 'string'
        ? x.created_utc
        : null;
  return {
    id,
    display_location,
    connection_method,
    weather_condition: weather,
    created,
    created_utc,
  };
}

function parseRecentRpc(data: unknown): SanitizedTickerConnection[] {
  if (!Array.isArray(data)) return [];
  const out: SanitizedTickerConnection[] = [];
  for (const row of data) {
    const parsed = parseSanitizedRow(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseBroadcastBody(raw: unknown): SanitizedTickerConnection | null {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(v)) return null;
  const inner = isRecord(v.payload) ? v.payload : v;
  return parseSanitizedRow(inner);
}

function normalizeCount(data: unknown): number | null {
  if (typeof data === 'number' && Number.isFinite(data)) return data;
  if (typeof data === 'string' && data.trim() !== '') {
    const n = Number(data);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export default function LiveConnectionTicker() {
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rows, setRows] = useState<SanitizedTickerConnection[]>([]);
  const [pageLoading, setPageLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [rpcOk, setRpcOk] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const pageIndexRef = useRef(0);

  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);

  const fetchPage = useCallback(async (page: number) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setPageLoading(true);
    try {
      const { data: recentData, error: recentError } = await supabase.rpc('get_recent_sanitized_connections', {
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (recentError) throw recentError;
      let raw: unknown = recentData;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw) as unknown;
        } catch {
          raw = [];
        }
      }
      setRows(parseRecentRpc(raw));
      setRpcOk(true);
    } catch {
      setRpcOk(false);
      setRows([]);
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setRpcOk(false);
      setTotalCount(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data: countData, error: countError } = await supabase.rpc('get_total_connections_count');
        if (countError) throw countError;
        const n = normalizeCount(countData);
        if (!cancelled && n !== null) setTotalCount(n);
      } catch {
        if (!cancelled) {
          setRpcOk(false);
          setTotalCount(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetchPage(pageIndex);
  }, [pageIndex, fetchPage]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('public-ticker', {
        config: { private: false },
      })
      .on('broadcast', { event: 'new_connection' }, ({ payload }) => {
        const row = parseBroadcastBody(payload ?? {});
        if (!row) return;
        setTotalCount((c) => (typeof c === 'number' ? c + 1 : 1));
        if (pageIndexRef.current !== 0) return;
        setRows((prev) => {
          if (prev.some((r) => r.id === row.id)) return prev;
          return [row, ...prev].slice(0, PAGE_SIZE);
        });
        requestAnimationFrame(() => {
          listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLive(true);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setLive(false);
      });

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
      setLive(false);
    };
  }, []);

  const total = totalCount ?? 0;
  const totalPages = totalCount !== null && total > 0 ? Math.ceil(total / PAGE_SIZE) : 0;

  useEffect(() => {
    if (totalPages > 0 && pageIndex > totalPages - 1) {
      setPageIndex(totalPages - 1);
    }
  }, [totalPages, pageIndex]);

  const rangeStart =
    totalCount !== null && total > 0 ? pageIndex * PAGE_SIZE + 1 : rows.length > 0 ? pageIndex * PAGE_SIZE + 1 : 0;
  const rangeEnd =
    totalCount !== null && total > 0
      ? Math.min((pageIndex + 1) * PAGE_SIZE, total)
      : rows.length > 0
        ? pageIndex * PAGE_SIZE + rows.length
        : 0;
  const canPrev = pageIndex > 0;
  const canNext =
    totalCount !== null && total > 0
      ? pageIndex < totalPages - 1
      : rows.length >= PAGE_SIZE;

  const supabaseConfigured = typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string'
    && process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0
    && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'your-project-url.supabase.co'
    && typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string'
    && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;
  if (!supabaseConfigured && totalCount === null && rows.length === 0) {
    return null;
  }

  return (
    <motion.div
      className="relative z-10 w-full"
      initial={{ y: 30, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true, margin: '-40px' }}
      aria-live="polite"
      aria-label="Live connection activity"
    >
      <div className="rounded-3xl border border-zinc-700/50 bg-zinc-950/40 p-5 shadow-xl shadow-black/30 backdrop-blur-xl sm:p-6">
        <div className="mb-4 flex flex-col gap-2 border-b border-zinc-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Live network</span>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                live
                  ? 'h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]'
                  : 'h-2 w-2 shrink-0 rounded-full bg-zinc-600'
              }
              aria-hidden
            />
            {live && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">Live</span>
            )}
            <span className="text-xs font-medium text-zinc-400">
              {totalCount === null ? '—' : totalCount.toLocaleString()}{' '}
              <span className="text-zinc-500">connections</span>
            </span>
          </div>
        </div>

        {!rpcOk && rows.length === 0 && !pageLoading ? (
          <p className="text-sm leading-relaxed text-zinc-500">
            Stats unavailable. When the database scripts are deployed, recent activity will show here.
          </p>
        ) : totalCount === 0 && rows.length === 0 && !pageLoading ? (
          <p className="text-sm text-zinc-500">Waiting for the next connection…</p>
        ) : rows.length === 0 && pageLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : (
          <>
            <div className="mb-3 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-center text-[11px] text-zinc-500 sm:text-left">
                {rows.length > 0 && (
                  <>
                    Showing{' '}
                    <span className="text-zinc-400">
                      {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
                    </span>
                    {totalCount !== null ? (
                      <>
                        {' '}
                        of {total.toLocaleString()}
                        {totalPages > 1 && (
                          <span className="text-zinc-600">
                            {' '}
                            · Page {Math.min(pageIndex + 1, Math.max(1, totalPages))} of {totalPages}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-zinc-600"> · loading total…</span>
                    )}
                  </>
                )}
              </p>
              {(totalPages > 1 || (totalCount === null && rows.length >= PAGE_SIZE)) && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                    disabled={!canPrev || pageLoading}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700/80 text-zinc-400 transition hover:border-[#8338EC]/50 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageIndex((p) => p + 1)}
                    disabled={!canNext || pageLoading}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700/80 text-zinc-400 transition hover:border-[#8338EC]/50 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>

            <div
              ref={listScrollRef}
              className="relative max-h-[min(28rem,55vh)] space-y-3 overflow-y-auto pr-1 [-webkit-overflow-scrolling:touch]"
            >
              {pageLoading && rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {rows.map((c) => (
                    <motion.div
                      key={c.id}
                      layout
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      className="glass rounded-2xl border border-zinc-700/70 bg-zinc-900/40 px-4 py-3.5 shadow-inner shadow-black/20"
                    >
                      <p className="text-sm leading-relaxed text-zinc-200 sm:text-[15px]">
                        <span className="text-[#8338EC]" aria-hidden>
                          ⚡{' '}
                        </span>
                        {formatTickerLine(c)}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              {pageLoading && rows.length > 0 && (
                <p className="py-2 text-center text-xs text-zinc-600">Updating…</p>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
