'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  MapPin,
  Clock,
  Cloud,
  Volume2,
  Mountain,
  Thermometer,
  Sun,
  Moon,
  Battery,
  Compass,
  Activity,
  Wind,
  Gauge,
  Image as ImageIcon,
  Link as LinkIcon,
  Paperclip,
  History,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import {
  buildProfileConnectionLines,
  normalizeWeatherSnapshot,
  prettyElevationCategoryKey,
  prettyNoiseCategoryKey,
  type SharedConnectionPayload,
} from '@/lib/userProfile/formatSharedConnection';
import { formatDetailedEncounterLocation } from '@/lib/location/detailedEncounterLocation';
import CurrentAvailabilitySection from '@/components/dashboard/CurrentAvailabilitySection';
import {
  originEncounter,
  parseConnectionEncounters,
  type ConnectionEncounterRow,
} from '@/lib/dashboard/connectionEncounters';
import type { AvailabilityIntentRow } from '@/lib/userProfile/availability';

export type { AvailabilityIntentRow };

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
  /** Non-expired rows from `availability_intents` (when API can read them). */
  availabilityIntents?: AvailabilityIntentRow[];
  /** Logged-in viewer’s tags (for client-side use; API also sends `sharedInterestTags`). */
  viewerInterestTags?: string[];
  sharedInterestTags?: string[];
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

function formatEncounterWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function encounterMetricPills(enc: ConnectionEncounterRow): { key: string; Icon: LucideIcon; label: string }[] {
  const out: { key: string; Icon: LucideIcon; label: string }[] = [];
  const ws = normalizeWeatherSnapshot(enc.weatherSnapshot);
  if (ws) {
    const cond =
      typeof ws.condition === 'string' && ws.condition.trim()
        ? ws.condition.trim()
        : typeof ws.iconCode === 'string' && ws.iconCode.trim()
          ? ws.iconCode.trim().replace(/^./, (c) => c.toUpperCase())
          : null;
    if (cond) out.push({ key: 'wx-cond', Icon: Cloud, label: cond });

    const temp = typeof ws.temperatureCelsius === 'number' && Number.isFinite(ws.temperatureCelsius)
      ? ws.temperatureCelsius
      : null;
    if (temp != null) {
      const f = Math.round((temp * 9) / 5 + 32);
      out.push({ key: 'temp', Icon: Thermometer, label: `${f}°F (${Math.round(temp)}°C)` });
    }
    const windKph =
      typeof ws.windSpeedKph === 'number' && Number.isFinite(ws.windSpeedKph) ? ws.windSpeedKph : null;
    if (windKph != null) {
      const degRaw = ws.windDirectionDegrees;
      const deg =
        typeof degRaw === 'number' && Number.isFinite(degRaw)
          ? degRaw
          : typeof degRaw === 'string' && degRaw.trim()
            ? Number(degRaw.trim())
            : NaN;
      let suffix = '';
      if (Number.isFinite(deg) && deg >= 0 && deg <= 359) {
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const x = ((deg % 360) + 360) % 360;
        const idx = (Math.floor((x + 22.5) / 45) % 8 + 8) % 8;
        suffix = ` ${dirs[idx]}`;
      }
      out.push({ key: 'wind', Icon: Wind, label: `${Math.round(windKph)} km/h${suffix}` });
    }
    const p = typeof ws.pressureMslHpa === 'number' && Number.isFinite(ws.pressureMslHpa) ? ws.pressureMslHpa : null;
    if (p != null) {
      out.push({ key: 'hpa', Icon: Gauge, label: `${Math.round(p)} hPa` });
    }
  }
  const noiseCat = enc.noiseLevel?.trim();
  if (noiseCat) {
    out.push({ key: 'noise-cat', Icon: Volume2, label: prettyNoiseCategoryKey(noiseCat) });
  }
  const dbRaw = enc.exactNoiseLevelDb;
  if (dbRaw !== null && dbRaw !== undefined && typeof dbRaw === 'number' && Number.isFinite(dbRaw)) {
    out.push({ key: 'db', Icon: Volume2, label: `${Math.round(dbRaw)} dB` });
  }
  const elCat = enc.elevationCategory?.trim();
  if (elCat) {
    out.push({ key: 'el-cat', Icon: Mountain, label: prettyElevationCategoryKey(elCat) });
  }
  const elRaw = enc.exactBarometricElevationM;
  if (elRaw !== null && elRaw !== undefined && typeof elRaw === 'number' && Number.isFinite(elRaw)) {
    out.push({ key: 'el', Icon: Mountain, label: `${Math.round(elRaw)} m` });
  }
  const luxRaw = enc.luxLevel;
  if (luxRaw !== null && luxRaw !== undefined && typeof luxRaw === 'number' && Number.isFinite(luxRaw) && luxRaw >= 0) {
    const I = luxRaw < 15 ? Moon : Sun;
    out.push({ key: 'lux', Icon: I, label: `${Math.round(luxRaw)} lx` });
  }
  const bat = enc.batteryLevel;
  if (bat !== null && bat !== undefined && typeof bat === 'number' && Number.isFinite(bat) && bat >= 0 && bat <= 100) {
    out.push({ key: 'bat', Icon: Battery, label: `${Math.round(bat)}%` });
  }
  const az = enc.compassAzimuth;
  if (az !== null && az !== undefined && typeof az === 'number' && Number.isFinite(az)) {
    const d = Math.round(((az % 360) + 360) % 360);
    out.push({ key: 'az', Icon: Compass, label: `${d}°` });
  }
  const mv = enc.motionVariance;
  if (mv !== null && mv !== undefined && typeof mv === 'number' && Number.isFinite(mv) && mv >= 0) {
    out.push({ key: 'mv', Icon: Activity, label: mv.toFixed(2) });
  }
  return out;
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

/**
 * Locally-decrypted chat messages used to populate the Media / Files / Links
 * subtabs. Message content is E2EE on the wire, so the BFF cannot parse it —
 * clients scan their already-decrypted state.
 */
export type DecryptedProfileMessage = {
  id: string;
  content: string;
  /** Human-readable timestamp already formatted by the caller. */
  timestamp: string;
  /** Message type (e.g. 'text', 'image', 'audio', 'file'). Defaults to 'text'. */
  messageType?: string;
  /** Parsed metadata JSON for media/file messages. */
  metadata?: Record<string, unknown> | null;
};

type UserProfileModalProps = {
  userId: string | null;
  getAuthHeaders: () => Promise<HeadersInit>;
  onClose: () => void;
  /**
   * When supplied, the Media and Files subtabs hydrate from
   * `GET /api/connections/{connectionId}/tabs` on click-web. Omit to render the
   * sheet in profile-only mode (Media / Files will show empty states).
   */
  connectionId?: string | null;
  /**
   * Locally-decrypted chat messages scanned client-side for `http(s)://` URLs.
   * Required for the Links subtab — the server cannot parse links because
   * message content is end-to-end encrypted.
   */
  decryptedMessages?: DecryptedProfileMessage[];
};

type ProfileTabKey = 'timeline' | 'media' | 'links' | 'files';

type ConnectionTabsPayload = {
  media: Array<{
    id: string;
    content: string;
    time_created: number | string;
    message_type: string;
    metadata: Record<string, unknown> | null;
  }>;
  files: Array<{
    id: string;
    content: string;
    time_created: number | string;
    message_type: string;
    metadata: Record<string, unknown> | null;
  }>;
};

type MediaItem = { id: string; url: string; caption: string | null };
type FileItem = {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  timestamp: string;
};
type LinkItem = { id: string; url: string; timestamp: string };

function pickString(meta: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!meta) return null;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}
function pickNumber(meta: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!meta) return null;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function mapMedia(rows: ConnectionTabsPayload['media']): MediaItem[] {
  const out: MediaItem[] = [];
  for (const r of rows) {
    const url = pickString(r.metadata, ['url', 'storage_url', 'image_url', 'audio_url', 'media_url']);
    if (!url) continue;
    const caption = r.content && !r.content.startsWith('ccx:v1:') ? r.content : null;
    out.push({ id: r.id, url, caption });
  }
  return out;
}

function mapFiles(rows: ConnectionTabsPayload['files']): FileItem[] {
  return rows.map((r) => {
    const fileName =
      pickString(r.metadata, ['file_name', 'filename', 'name']) ??
      (r.content && !r.content.startsWith('ccx:v1:') ? r.content : 'Attachment');
    const sizeBytes = pickNumber(r.metadata, ['file_size', 'size_bytes', 'size']) ?? 0;
    const mimeType =
      pickString(r.metadata, ['mime_type', 'content_type']) ?? 'application/octet-stream';
    const raw = r.time_created;
    const ts = typeof raw === 'number' ? new Date(raw).toLocaleString() : String(raw ?? '');
    return { id: r.id, fileName, sizeBytes, mimeType, timestamp: ts };
  });
}

const URL_REGEX = /https?:\/\/\S+/gi;

function extractLinks(messages: DecryptedProfileMessage[]): LinkItem[] {
  if (!messages.length) return [];
  const seen = new Set<string>();
  const out: LinkItem[] = [];
  for (const m of messages) {
    const matches = m.content.matchAll(URL_REGEX);
    for (const match of matches) {
      const url = match[0].replace(/[.,)\]};:]+$/g, '');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ id: `${m.id}:${url}`, url, timestamp: m.timestamp });
    }
  }
  return out;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${((bytes / (1024 * 1024)) * 10 >> 0) / 10} MB`;
}

function ProfileLoadingSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-5 py-1"
      aria-busy
      aria-label="Loading profile"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-24 w-24 rounded-full bg-white/5 ring-1 ring-white/[0.06] animate-pulse" />
        <div className="h-5 w-40 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-3 w-28 rounded-md bg-white/[0.04] animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-white/[0.06] animate-pulse" />
        <div className="h-9 w-full rounded-xl bg-white/[0.04] animate-pulse" />
        <div className="h-9 w-[80%] rounded-xl bg-white/[0.04] animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-white/[0.06] animate-pulse" />
        <div className="h-16 w-full rounded-xl bg-white/[0.04] animate-pulse" />
      </div>
    </motion.div>
  );
}

export default function UserProfileModal({
  userId,
  getAuthHeaders,
  onClose,
  connectionId = null,
  decryptedMessages = [],
}: UserProfileModalProps) {
  const [data, setData] = useState<UserProfilePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('timeline');
  const [tabsPayload, setTabsPayload] = useState<ConnectionTabsPayload | null>(null);

  useEffect(() => {
    if (!connectionId) {
      setTabsPayload(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/connections/${encodeURIComponent(connectionId)}/tabs`,
          { headers },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        if (!cancelled) setTabsPayload(json as ConnectionTabsPayload);
      } catch {
        // Soft-fail: tabs stay empty; Timeline subtab still renders full profile.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionId, getAuthHeaders]);

  const localMediaItems = useMemo(() => {
    const mediaMessages = decryptedMessages.filter(
      (m) => m.messageType === 'image' || m.messageType === 'audio',
    );
    const out: MediaItem[] = [];
    for (const m of mediaMessages) {
      const url = pickString(m.metadata, ['url', 'storage_url', 'image_url', 'audio_url', 'media_url']);
      if (!url) continue;
      const caption = m.content && !m.content.startsWith('ccx:v1:') ? m.content : null;
      out.push({ id: m.id, url, caption });
    }
    return out;
  }, [decryptedMessages]);

  const localFileItems = useMemo(() => {
    const fileMessages = decryptedMessages.filter(
      (m) => m.messageType === 'file' || m.content.startsWith('ccx:v1:'),
    );
    return fileMessages.map((m): FileItem => {
      const fileName =
        pickString(m.metadata, ['file_name', 'filename', 'name']) ??
        (m.content && !m.content.startsWith('ccx:v1:') ? m.content : 'Attachment');
      const sizeBytes = pickNumber(m.metadata, ['file_size', 'size_bytes', 'size']) ?? 0;
      const mimeType = pickString(m.metadata, ['mime_type', 'content_type']) ?? 'application/octet-stream';
      return { id: m.id, fileName, sizeBytes, mimeType, timestamp: m.timestamp };
    });
  }, [decryptedMessages]);

  const bffMediaItems = useMemo(
    () => mapMedia(tabsPayload?.media ?? []),
    [tabsPayload],
  );
  const bffFileItems = useMemo(
    () => mapFiles(tabsPayload?.files ?? []),
    [tabsPayload],
  );

  const mediaItems = localMediaItems.length > 0 ? localMediaItems : bffMediaItems;
  const fileItems = localFileItems.length > 0 ? localFileItems : bffFileItems;
  const linkItems = useMemo(
    () => extractLinks(decryptedMessages.filter((m) => (m.messageType ?? 'text') === 'text' && m.content.includes('http'))),
    [decryptedMessages],
  );

  useEffect(() => {
    // Reset to the Timeline tab whenever the sheet opens for a new user.
    if (userId) setActiveTab('timeline');
  }, [userId]);

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

  const encounterTimeline = useMemo(() => {
    const raw = data?.sharedConnection;
    if (!raw || typeof raw !== 'object') return null;
    const conn = raw as Record<string, unknown>;
    const rows = parseConnectionEncounters(conn);
    const origin = originEncounter(conn);
    return { rows, originId: origin?.id ?? null };
  }, [data?.sharedConnection]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320, mass: 0.85 }}
            className="w-full max-w-md max-h-[min(88vh,640px)] overflow-y-auto rounded-3xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800/90 bg-zinc-950/95 px-4 pt-6 pb-3 backdrop-blur-md">
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
              {loading && <ProfileLoadingSkeleton />}
              {error && !loading && (
                <p className="text-sm text-red-400 text-center py-6">{error}</p>
              )}
              {data && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-5"
                >
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

                  {/*
                    Four-tab secondary nav mirroring the KMP [ProfileBottomSheet]
                    subtabs: Timeline · Media · Links · Files. Media/Files are
                    hydrated from `/api/connections/{connectionId}/tabs`; Links are
                    derived client-side from the locally-decrypted chat messages
                    (server content is E2EE, so the BFF never sees URLs).
                  */}
                  <nav
                    role="tablist"
                    aria-label="Profile sections"
                    className="grid grid-cols-4 gap-1 rounded-xl border border-zinc-800/90 bg-zinc-900/50 p-1"
                  >
                    {(
                      [
                        { key: 'timeline', label: 'Timeline', Icon: History },
                        { key: 'media', label: 'Media', Icon: ImageIcon },
                        { key: 'links', label: 'Links', Icon: LinkIcon },
                        { key: 'files', label: 'Files', Icon: Paperclip },
                      ] as const
                    ).map(({ key, label, Icon }) => {
                      const selected = activeTab === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() => setActiveTab(key)}
                          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                            selected
                              ? 'bg-[#8338EC]/20 text-[#c4b5fd] ring-1 ring-[#8338EC]/40'
                              : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </nav>

                  {activeTab === 'media' && (
                    <section role="tabpanel" aria-label="Media">
                      {mediaItems.length === 0 ? (
                        <EmptyTabState
                          Icon={ImageIcon}
                          title="No shared photos"
                          body="Photos you exchange in chat will appear here."
                        />
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5">
                          {mediaItems.map((m) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={m.id}
                              src={m.url}
                              alt={m.caption ?? ''}
                              className="h-28 w-full rounded-lg object-cover ring-1 ring-zinc-800"
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {activeTab === 'links' && (
                    <section role="tabpanel" aria-label="Links">
                      {linkItems.length === 0 ? (
                        <EmptyTabState
                          Icon={LinkIcon}
                          title="No shared links"
                          body="URLs shared in chat show up here."
                        />
                      ) : (
                        <ul className="space-y-2">
                          {linkItems.map((l) => (
                            <li key={l.id}>
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-200 hover:border-[#8338EC]/50 hover:bg-zinc-900/80"
                              >
                                <LinkIcon className="h-4 w-4 shrink-0 text-[#8338EC]/80 mt-0.5" aria-hidden />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[#c4b5fd]">{l.url}</p>
                                  <p className="text-[11px] text-zinc-500 mt-0.5">{l.timestamp}</p>
                                </div>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  {activeTab === 'files' && (
                    <section role="tabpanel" aria-label="Files">
                      {fileItems.length === 0 ? (
                        <EmptyTabState
                          Icon={Paperclip}
                          title="No shared files"
                          body="Attachments sent in chat will appear here."
                        />
                      ) : (
                        <ul className="space-y-2">
                          {fileItems.map((f) => (
                            <li
                              key={f.id}
                              className="flex items-start gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5"
                            >
                              <FileText className="h-4 w-4 shrink-0 text-sky-400/90 mt-0.5" aria-hidden />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white">{f.fileName}</p>
                                <p className="text-[11px] text-zinc-500 mt-0.5">
                                  {formatFileSize(f.sizeBytes)} · {f.mimeType}
                                </p>
                                <p className="text-[11px] text-zinc-500">{f.timestamp}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  )}

                  {activeTab === 'timeline' && (
                  <>

                  {hasMoment && momentLines && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                        When you connected
                      </h3>
                      <div className="space-y-3 text-sm text-zinc-200">
                        {momentLines.context && (
                          <div className="flex gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5">
                            <Sparkles className="h-4 w-4 shrink-0 text-[#8338EC]/80 mt-0.5" aria-hidden />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Moment</p>
                              <p className="mt-0.5 leading-snug">{momentLines.context}</p>
                            </div>
                          </div>
                        )}
                        {(momentLines.place || momentLines.addressDetail) && (
                          <div className="flex gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5">
                            <MapPin className="h-4 w-4 shrink-0 text-sky-400/90 mt-0.5" aria-hidden />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Place</p>
                              <p className="mt-0.5 leading-snug">
                                {[momentLines.place, momentLines.addressDetail].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </div>
                        )}
                        {momentLines.when && (
                          <div className="flex gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5">
                            <Clock className="h-4 w-4 shrink-0 text-amber-300/90 mt-0.5" aria-hidden />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Time</p>
                              <p className="mt-0.5 leading-snug">{momentLines.when}</p>
                            </div>
                          </div>
                        )}
                        {momentLines.weather && (
                          <div className="flex gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5">
                            <Cloud className="h-4 w-4 shrink-0 text-zinc-300 mt-0.5" aria-hidden />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Weather</p>
                              <p className="mt-0.5 leading-snug">{momentLines.weather}</p>
                            </div>
                          </div>
                        )}
                        {momentLines.noise && (
                          <div className="flex gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5">
                            <Volume2 className="h-4 w-4 shrink-0 text-emerald-400/85 mt-0.5" aria-hidden />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Ambience</p>
                              <p className="mt-0.5 leading-snug">{momentLines.noise}</p>
                            </div>
                          </div>
                        )}
                        {momentLines.elevation && (
                          <div className="flex gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5">
                            <Mountain className="h-4 w-4 shrink-0 text-sky-300/90 mt-0.5" aria-hidden />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Elevation</p>
                              <p className="mt-0.5 leading-snug">{momentLines.elevation}</p>
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

                  {!!data.sharedInterestTags?.length && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                        Shared interests
                      </h3>
                      <p className="text-[11px] text-zinc-500 mb-2">
                        Conversation starters you both listed
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {data.sharedInterestTags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                      Availability
                    </h3>
                    <CurrentAvailabilitySection
                      availability={data.availability}
                      availabilityIntents={data.availabilityIntents}
                    />
                  </section>

                  {encounterTimeline && (
                    <section className="relative">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                        Our timeline
                      </h3>
                      <p className="text-[11px] text-zinc-500 mb-4">
                        Every time and place you’ve crossed paths
                      </p>
                      {encounterTimeline.rows.length === 0 ? (
                        <p className="text-sm text-zinc-500">
                          No crossing history on file yet.
                        </p>
                      ) : (
                        <div className="relative pl-1">
                          <div
                            className="absolute left-[15px] top-2 bottom-3 w-px bg-zinc-700/85 pointer-events-none"
                            aria-hidden
                          />
                          <ul className="space-y-0">
                            {encounterTimeline.rows.map((enc) => {
                              const isOrigin = enc.id === encounterTimeline.originId;
                              const pills = encounterMetricPills(enc);
                              const place =
                                formatDetailedEncounterLocation({
                                  locationName: enc.locationName,
                                  displayLocation: enc.displayLocation,
                                  semanticLocation: enc.semanticLocation,
                                }) ?? 'A new location';
                              const momentTags = Array.from(
                                new Set(
                                  (enc.contextTags ?? [])
                                    .map((t) => (typeof t === 'string' ? t.trim() : ''))
                                    .filter(Boolean),
                                ),
                              );
                              return (
                                <li key={enc.id} className="relative pb-9 last:pb-1">
                                  <div
                                    className="absolute left-[10px] top-[7px] z-[1] h-3 w-3 rounded-full border-2 border-zinc-950 bg-gradient-to-br from-[#8338EC] to-[#3A86FF] shadow-sm"
                                    aria-hidden
                                  />
                                  <div className="pl-8">
                                    {isOrigin && (
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-400/95 mb-1">
                                        Where it started
                                      </p>
                                    )}
                                    <p className="text-xs text-zinc-500 tabular-nums">
                                      {formatEncounterWhen(enc.encounteredAt)}
                                    </p>
                                    <p className="text-sm font-semibold text-white mt-1 leading-snug">
                                      {place}
                                    </p>
                                    {momentTags.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {momentTags.map((tag) => (
                                          <span
                                            key={`${enc.id}-${tag}`}
                                            className="inline-flex items-center gap-1 rounded-full border border-[#8338EC]/35 bg-[#8338EC]/12 px-2.5 py-0.5 text-[11px] text-[#c4b5fd]"
                                          >
                                            <Sparkles className="h-3 w-3 shrink-0 text-[#8338EC]/90" aria-hidden />
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {pills.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                        {pills.map(({ key, Icon, label }) => (
                                          <span
                                            key={key}
                                            className="inline-flex items-center gap-1 rounded-full border border-zinc-700/70 bg-zinc-900/55 px-2.5 py-0.5 text-[11px] text-zinc-300"
                                          >
                                            <Icon
                                              className="h-3 w-3 shrink-0 text-zinc-400"
                                              aria-hidden
                                            />
                                            {label}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </section>
                  )}
                  </>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EmptyTabState({
  Icon,
  title,
  body,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800/90 bg-zinc-900/30 px-6 py-12 text-center">
      <Icon className="h-10 w-10 text-zinc-600" aria-hidden />
      <p className="mt-3 text-sm font-semibold text-zinc-200">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{body}</p>
    </div>
  );
}
