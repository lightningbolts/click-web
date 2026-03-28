'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, CalendarDays, Cloud, Volume2 } from 'lucide-react';
import {
  buildProfileConnectionLines,
  type SharedConnectionPayload,
} from '@/lib/userProfile/formatSharedConnection';

export type UserProfilePayload = {
  user: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    full_name?: string | null;
    birthday?: string | null;
    image?: string | null;
    email?: string | null;
  };
  tags: string[];
  availability: {
    is_free_this_week?: boolean;
    available_days?: string[];
    preferred_activities?: string[];
    custom_status?: string | null;
  } | null;
  /** Mutual `connections` row for viewer + profile user. */
  sharedConnection?: SharedConnectionPayload | null;
};

function displayName(u: UserProfilePayload['user']): string {
  const fn = u.first_name?.trim();
  const ln = u.last_name?.trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ');
  return u.full_name?.trim() || u.name?.trim() || 'Member';
}

function coerceSharedConnection(raw: unknown): SharedConnectionPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== 'string') return null;
  const cr = o.created;
  const created = typeof cr === 'number' && Number.isFinite(cr) ? cr : 0;
  return { ...(o as object), id, created } as SharedConnectionPayload;
}

function ageFromBirthday(birthday?: string | null): number | null {
  if (!birthday?.trim()) return null;
  const d = new Date(birthday.slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const md = t.getMonth() - d.getMonth();
  if (md < 0 || (md === 0 && t.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

type UserProfileModalProps = {
  userId: string | null;
  getAuthHeaders: () => Promise<HeadersInit>;
  onClose: () => void;
};

export default function UserProfileModal({ userId, getAuthHeaders, onClose }: UserProfileModalProps) {
  const [data, setData] = useState<UserProfilePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}/profile`, { headers });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || res.statusText);
        if (!cancelled) setData(json as UserProfilePayload);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, getAuthHeaders]);

  const open = !!userId;

  const momentLines = useMemo(() => {
    const sc = data?.sharedConnection;
    const payload = coerceSharedConnection(sc);
    if (!payload) return null;
    return buildProfileConnectionLines(payload);
  }, [data?.sharedConnection]);

  const hasMoment =
    !!momentLines &&
    Object.values(momentLines).some((v) => typeof v === 'string' && v.trim().length > 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="w-full max-w-md max-h-[min(88vh,640px)] overflow-y-auto rounded-3xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800/90 bg-zinc-950/95 px-4 py-3 backdrop-blur-md">
              <h2 className="text-lg font-semibold text-white">Profile</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {loading && (
                <p className="text-sm text-zinc-400 text-center py-10">Loading…</p>
              )}
              {error && !loading && (
                <p className="text-sm text-red-400 text-center py-6">{error}</p>
              )}
              {data && !loading && (
                <div className="space-y-5">
                  <div className="flex flex-col items-center gap-3">
                    {data.user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={data.user.image}
                        alt=""
                        className="h-24 w-24 rounded-full object-cover ring-2 ring-[#8338EC]/40"
                      />
                    ) : (
                      <div
                        className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-3xl font-bold text-white"
                      >
                        {displayName(data.user).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-xl font-semibold text-white">
                        {displayName(data.user)}
                        {ageFromBirthday(data.user.birthday) != null && (
                          <span className="text-zinc-400 font-normal">, {ageFromBirthday(data.user.birthday)}</span>
                        )}
                      </p>
                      {data.user.email && (
                        <p className="text-xs text-zinc-500 mt-1">{data.user.email}</p>
                      )}
                    </div>
                  </div>

                  {hasMoment && momentLines && (
                    <section className="rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-zinc-900/80 to-zinc-950/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#a78bfa] mb-3">
                        When you connected
                      </h3>
                      <div className="space-y-3">
                        {(momentLines.context || momentLines.place || momentLines.addressDetail || momentLines.geoHint) && (
                          <div className="flex gap-3 rounded-xl bg-zinc-950/50 border border-zinc-800/80 p-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8338EC]/15 text-[#c4b5fd]">
                              <MapPin className="h-4 w-4" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Place</p>
                              {momentLines.context && (
                                <p className="text-sm font-medium text-white leading-snug">{momentLines.context}</p>
                              )}
                              {momentLines.place && (
                                <p className={`text-sm leading-snug ${momentLines.context ? 'text-zinc-300' : 'text-white font-medium'}`}>
                                  {momentLines.place}
                                </p>
                              )}
                              {momentLines.addressDetail && (
                                <p className="text-xs text-zinc-500 leading-relaxed">{momentLines.addressDetail}</p>
                              )}
                              {momentLines.geoHint && (
                                <p className="text-[11px] font-mono text-zinc-600">{momentLines.geoHint}</p>
                              )}
                            </div>
                          </div>
                        )}
                        {momentLines.when && (
                          <div className="flex gap-3 rounded-xl bg-zinc-950/50 border border-zinc-800/80 p-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300">
                              <CalendarDays className="h-4 w-4" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 mb-0.5">Time</p>
                              <p className="text-sm text-zinc-200 leading-snug">{momentLines.when}</p>
                            </div>
                          </div>
                        )}
                        {momentLines.weather && (
                          <div className="flex gap-3 rounded-xl bg-zinc-950/50 border border-zinc-800/80 p-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
                              <Cloud className="h-4 w-4" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 mb-0.5">Weather</p>
                              <p className="text-sm text-zinc-200 leading-snug">{momentLines.weather}</p>
                            </div>
                          </div>
                        )}
                        {momentLines.noise && (
                          <div className="flex gap-3 rounded-xl bg-zinc-950/50 border border-zinc-800/80 p-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
                              <Volume2 className="h-4 w-4" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 mb-0.5">Ambience</p>
                              <p className="text-sm text-zinc-200 leading-snug">{momentLines.noise}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Interests</h3>
                    {data.tags.length === 0 ? (
                      <p className="text-sm text-zinc-500">No interests shared yet</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {data.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-[#8338EC]/35 bg-[#8338EC]/10 px-3 py-1 text-xs text-[#c4b5fd]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Availability</h3>
                    {!data.availability ? (
                      <p className="text-sm text-zinc-500">No availability shared</p>
                    ) : (
                      <div className="space-y-2 text-sm text-zinc-300">
                        <p>
                          {data.availability.is_free_this_week
                            ? 'Free this week'
                            : 'Not marked free this week'}
                        </p>
                        {!!data.availability.available_days?.length && (
                          <p className="text-zinc-400">
                            <span className="text-zinc-500">Days: </span>
                            {data.availability.available_days
                              .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
                              .join(', ')}
                          </p>
                        )}
                        {!!data.availability.preferred_activities?.length && (
                          <p className="text-zinc-400">
                            <span className="text-zinc-500">Activities: </span>
                            {data.availability.preferred_activities.join(', ')}
                          </p>
                        )}
                        {data.availability.custom_status && (
                          <p className="text-zinc-200 border-l-2 border-[#8338EC]/50 pl-3">
                            {data.availability.custom_status}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
