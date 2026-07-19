'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { normalizeWeatherSnapshot } from '@/lib/userProfile/formatSharedConnection';

/** Must match server max in `get_recent_sanitized_connections` (50). */
const PAGE_SIZE = 20;
const TICKER_LOCATION_FALLBACK = 'A new city';

export type SanitizedTickerConnection = {
  id: string;
  display_location: string;
  connection_method: string;
  /** Human-readable condition (never a raw JSON blob). */
  weather_condition: string | null;
  /** Parsed from `weather_snapshot` when the payload includes numeric fields. */
  weather_temperature_celsius?: number | null;
  weather_wind_speed_kph?: number | null;
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
  const place = c.display_location?.trim() || TICKER_LOCATION_FALLBACK;
  const timePart = formatConnectionLocalTime(c);
  const when = timePart ? ` at ${timePart}` : '';
  const w = c.weather_condition?.trim();
  const temp = c.weather_temperature_celsius;
  const wind = c.weather_wind_speed_kph;
  const wxParts: string[] = [];
  if (w) {
    wxParts.push(`${emojiForWeather(w)} ${w}`);
  }
  if (typeof temp === 'number' && Number.isFinite(temp)) {
    wxParts.push(`${Math.round(temp)}°C`);
  }
  if (typeof wind === 'number' && Number.isFinite(wind)) {
    wxParts.push(`${Math.round(wind)} km/h`);
  }
  if (wxParts.length > 0) {
    return `New Click in ${place}${when} • ${wxParts.join(' · ')}`;
  }
  return `New Click in ${place}${when}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function coerceTickerId(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function readDisplayLocation(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : TICKER_LOCATION_FALLBACK;
}

function readNumericField(o: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.trim());
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * RPC / broadcast rows never include raw `weather_snapshot`; the DB may send
 * `weather_condition` as a plain label, a JSON object, or a **double-encoded** JSON string
 * (often starting with `"` after one decode). Top-level `weather_temperature_celsius` /
 * `weather_wind_speed_kph` are added by `build_sanitized_connection_payload` after migration.
 */
function parseTickerWeatherFields(x: Record<string, unknown>): {
  condition: string | null;
  tempC: number | null;
  windKph: number | null;
} {
  const topTemp = readNumericField(
    x,
    'weather_temperature_celsius',
    'weatherTemperatureCelsius',
  );
  const topWind = readNumericField(x, 'weather_wind_speed_kph', 'weatherWindSpeedKph');

  const ws =
    normalizeWeatherSnapshot(x.weather_snapshot) ??
    normalizeWeatherSnapshot(x['weatherSnapshot']) ??
    normalizeWeatherSnapshot(x.weather_condition);

  if (ws) {
    const condRaw = ws['condition'] ?? ws['Condition'];
    const cond =
      typeof condRaw === 'string' && condRaw.trim()
        ? condRaw.trim()
        : typeof ws['iconCode'] === 'string' && ws['iconCode'].trim()
          ? ws['iconCode'].trim().replace(/^./, (c) => String(c).toUpperCase())
          : null;
    const temp =
      readNumericField(ws, 'temperatureCelsius', 'temperature_celsius') ?? topTemp;
    const wind = readNumericField(ws, 'windSpeedKph', 'wind_speed_kph') ?? topWind;
    return { condition: cond, tempC: temp, windKph: wind };
  }

  const wc = x.weather_condition;
  if (typeof wc === 'string' && wc.trim()) {
    const t = wc.trim();
    if (!t.startsWith('{') && !t.startsWith('[') && !t.startsWith('"')) {
      return { condition: t, tempC: topTemp, windKph: topWind };
    }
  }

  return { condition: null, tempC: topTemp, windKph: topWind };
}

function parseSanitizedRow(x: unknown): SanitizedTickerConnection | null {
  if (!isRecord(x)) return null;
  const id = coerceTickerId(x.id);
  // Privacy guard: this public component only reads sanitized `display_location`.
  const display_location = readDisplayLocation(x.display_location);
  const connection_method =
    typeof x.connection_method === 'string' && x.connection_method.trim()
      ? x.connection_method.trim()
      : 'qr';
  const createdRaw = x.created;
  const created =
    typeof createdRaw === 'number' && Number.isFinite(createdRaw)
      ? createdRaw
      : typeof createdRaw === 'string' && createdRaw.trim()
        ? Number(createdRaw.trim())
        : NaN;
  if (id == null || display_location === null) return null;
  if (!Number.isFinite(created)) return null;
  const { condition, tempC, windKph } = parseTickerWeatherFields(x);
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
    weather_condition: condition,
    weather_temperature_celsius: tempC,
    weather_wind_speed_kph: windKph,
    created,
    created_utc,
  };
}

/** `get_recent_sanitized_connections` returns `jsonb_agg(...)` — usually an array; tolerate a single object or stringified JSON. */
function unwrapTickerRpcPayload(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    const t = data.trim();
    if (!t) return [];
    try {
      return unwrapTickerRpcPayload(JSON.parse(t) as unknown);
    } catch {
      return [];
    }
  }
  if (isRecord(data)) {
    const keys = Object.keys(data);
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      return [...keys]
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => (data as Record<string, unknown>)[k]);
    }
    if (coerceTickerId(data.id) != null && 'display_location' in data) {
      return [data];
    }
  }
  return [];
}

function parseRecentRpc(data: unknown): SanitizedTickerConnection[] {
  const rows = unwrapTickerRpcPayload(data);
  const out: SanitizedTickerConnection[] = [];
  for (const row of rows) {
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
  /** Only reflects `get_recent_sanitized_connections` (not the total-count RPC). */
  const [recentFeedOk, setRecentFeedOk] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const pageIndexRef = useRef(0);

  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);

  const fetchPage = useCallback(async (page: number) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setRecentFeedOk(false);
      setRows([]);
      return;
    }
    setPageLoading(true);
    try {
      const { data: recentData, error: recentError } = await supabase.rpc('get_recent_sanitized_connections', {
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (recentError) throw recentError;
      setRows(parseRecentRpc(recentData));
      setRecentFeedOk(true);
    } catch (err) {
      console.error('[LiveConnectionTicker] get_recent_sanitized_connections failed:', err);
      setRecentFeedOk(false);
      setRows([]);
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setRecentFeedOk(false);
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
      } catch (err) {
        if (!cancelled) {
          console.error('[LiveConnectionTicker] get_total_connections_count failed:', err);
          setTotalCount(null);
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
      <div className="rounded-[16px] border border-border-hard/50 bg-background/40 p-5 shadow-xl shadow-black/30 sm:p-6">
        <div className="mb-4 flex flex-col gap-2 border-b border-border-hard/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Live network</span>
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
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300/90">Live</span>
            )}
            <span className="text-xs font-medium text-on-surface-variant">
              {totalCount === null ? '—' : totalCount.toLocaleString()}{' '}
              <span className="text-on-surface-variant">clicks</span>
            </span>
          </div>
        </div>

        {!recentFeedOk && rows.length === 0 && !pageLoading ? (
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Recent activity could not be loaded. The list RPC failed or returned rows we could not parse; the
            click total above may still be correct. Open the browser console for the error, and ensure
            `get_recent_sanitized_connections` plus a non-throwing `build_sanitized_connection_payload` are deployed
            (corrupt `weather_snapshot` values must not abort the whole batch).
          </p>
        ) : totalCount === 0 && rows.length === 0 && !pageLoading ? (
          <p className="text-sm text-on-surface-variant">Waiting for the next connection…</p>
        ) : rows.length === 0 && pageLoading ? (
          <p className="py-8 text-center text-sm text-on-surface-variant">Loading…</p>
        ) : (
          <>
            <div className="mb-3 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-center text-[11px] text-on-surface-variant sm:text-left">
                {rows.length > 0 && (
                  <>
                    Showing{' '}
                    <span className="text-on-surface-variant">
                      {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
                    </span>
                    {totalCount !== null ? (
                      <>
                        {' '}
                        of {total.toLocaleString()}
                        {totalPages > 1 && (
                          <span className="text-outline">
                            {' '}
                            · Page {Math.min(pageIndex + 1, Math.max(1, totalPages))} of {totalPages}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-outline"> · loading total…</span>
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
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border-hard/80 text-on-surface-variant transition hover:border-[#630ed4]/50 hover:text-on-surface disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageIndex((p) => p + 1)}
                    disabled={!canNext || pageLoading}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border-hard/80 text-on-surface-variant transition hover:border-[#630ed4]/50 hover:text-on-surface disabled:pointer-events-none disabled:opacity-30"
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
                <p className="py-8 text-center text-sm text-on-surface-variant">Loading…</p>
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
                      className="fc-card rounded-2xl border border-border-hard/70 bg-surface-container/40 px-4 py-3.5 shadow-inner shadow-black/20"
                    >
                      <p className="text-sm leading-relaxed text-on-surface sm:text-[15px]">
                        <span className="text-[#630ed4]" aria-hidden>
                          ⚡{' '}
                        </span>
                        {formatTickerLine(c)}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              {pageLoading && rows.length > 0 && (
                <p className="py-2 text-center text-xs text-outline">Updating…</p>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
