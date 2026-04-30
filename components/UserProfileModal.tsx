'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  ExternalLink,
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
  Maximize2,
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
import useSWR, { useSWRConfig } from 'swr';
import Image from 'next/image';
import { coerceMessageType } from '@/lib/chat/messages';
import {
  decodeFileMasterKeyBase64,
  decryptFileBytes,
  sha256Base64,
  tryDecodeEnvelope,
  type AttachmentEnvelope,
} from '@/lib/chat/attachmentCrypto';
import {
  decryptContent,
  deriveKeysForConnection,
  isEncrypted,
  type DerivedKeys,
} from '@/lib/chat/crypto';
import { createSecureMediaObjectUrl } from '@/lib/chat/useSecureMedia';
import { downloadAttachmentCiphertext, signChatAttachmentUrl } from '@/lib/chat/chatAttachmentStorage';
import { stableKeysForStringList } from '@/lib/react/stableKeysForStringList';

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

function encounterMetricPills(enc: ConnectionEncounterRow): { metricKey: string; Icon: LucideIcon; label: string }[] {
  const out: { metricKey: string; Icon: LucideIcon; label: string }[] = [];
  const ws = normalizeWeatherSnapshot(enc.weatherSnapshot);
  if (ws) {
    const cond =
      typeof ws.condition === 'string' && ws.condition.trim()
        ? ws.condition.trim()
        : typeof ws.iconCode === 'string' && ws.iconCode.trim()
          ? ws.iconCode.trim().replace(/^./, (c) => c.toUpperCase())
          : null;
    if (cond) out.push({ metricKey: 'wx-cond', Icon: Cloud, label: cond });

    const temp = typeof ws.temperatureCelsius === 'number' && Number.isFinite(ws.temperatureCelsius)
      ? ws.temperatureCelsius
      : null;
    if (temp != null) {
      const f = Math.round((temp * 9) / 5 + 32);
      out.push({ metricKey: 'temp', Icon: Thermometer, label: `${f}°F (${Math.round(temp)}°C)` });
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
      out.push({ metricKey: 'wind', Icon: Wind, label: `${Math.round(windKph)} km/h${suffix}` });
    }
    const p = typeof ws.pressureMslHpa === 'number' && Number.isFinite(ws.pressureMslHpa) ? ws.pressureMslHpa : null;
    if (p != null) {
      out.push({ metricKey: 'hpa', Icon: Gauge, label: `${Math.round(p)} hPa` });
    }
  }
  const noiseCat = enc.noiseLevel?.trim();
  if (noiseCat) {
    out.push({ metricKey: 'noise-cat', Icon: Volume2, label: prettyNoiseCategoryKey(noiseCat) });
  }
  const dbRaw = enc.exactNoiseLevelDb;
  if (dbRaw !== null && dbRaw !== undefined && typeof dbRaw === 'number' && Number.isFinite(dbRaw)) {
    out.push({ metricKey: 'db', Icon: Volume2, label: `${Math.round(dbRaw)} dB` });
  }
  const elCat = enc.elevationCategory?.trim();
  if (elCat) {
    out.push({ metricKey: 'el-cat', Icon: Mountain, label: prettyElevationCategoryKey(elCat) });
  }
  const elRaw = enc.exactBarometricElevationM;
  if (elRaw !== null && elRaw !== undefined && typeof elRaw === 'number' && Number.isFinite(elRaw)) {
    out.push({ metricKey: 'el', Icon: Mountain, label: `${Math.round(elRaw)} m` });
  }
  const luxRaw = enc.luxLevel;
  if (luxRaw !== null && luxRaw !== undefined && typeof luxRaw === 'number' && Number.isFinite(luxRaw) && luxRaw >= 0) {
    const I = luxRaw < 15 ? Moon : Sun;
    out.push({ metricKey: 'lux', Icon: I, label: `${Math.round(luxRaw)} lx` });
  }
  const bat = enc.batteryLevel;
  if (bat !== null && bat !== undefined && typeof bat === 'number' && Number.isFinite(bat) && bat >= 0 && bat <= 100) {
    out.push({ metricKey: 'bat', Icon: Battery, label: `${Math.round(bat)}%` });
  }
  const az = enc.compassAzimuth;
  if (az !== null && az !== undefined && typeof az === 'number' && Number.isFinite(az)) {
    const d = Math.round(((az % 360) + 360) % 360);
    out.push({ metricKey: 'az', Icon: Compass, label: `${d}°` });
  }
  const mv = enc.motionVariance;
  if (mv !== null && mv !== undefined && typeof mv === 'number' && Number.isFinite(mv) && mv >= 0) {
    out.push({ metricKey: 'mv', Icon: Activity, label: mv.toFixed(2) });
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
   * When true (own profile only), the sheet cannot be dismissed until birthday is saved to
   * `public.users` — backdrop taps and the header close control are disabled.
   */
  forceOwnProfileBirthdayCompletion?: boolean;
  /** Optional parent context for call sites opening from a specific chat row. */
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
  chatId: string | null;
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

type ChatMessagesPayload = {
  messages: Array<{
    id: string;
    content: string;
    time_created: number;
    message_type: string;
    metadata: Record<string, unknown> | null;
  }>;
};

type MediaItem = {
  id: string;
  mediaType: 'image' | 'audio';
  sourceUrl: string | null;
  storagePath: string | null;
  caption: string | null;
  mimeType: string | null;
  isEncrypted: boolean;
};
type FileItem = {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  timestamp: string;
  downloadUrl: string | null;
  storagePath: string | null;
  envelope: AttachmentEnvelope | null;
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

function pickBoolean(meta: Record<string, unknown> | null | undefined, keys: string[]): boolean | null {
  if (!meta) return null;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const lowered = v.trim().toLowerCase();
      if (lowered === 'true') return true;
      if (lowered === 'false') return false;
    }
    if (typeof v === 'number') {
      if (v === 1) return true;
      if (v === 0) return false;
    }
  }
  return null;
}

function formatTimestamp(raw: number | string | undefined, fallback: string): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return fallback;
}

function mapMediaFromRow(row: {
  id: string;
  content: string;
  message_type: string;
  metadata: Record<string, unknown> | null;
}): MediaItem | null {
  const mediaType = coerceMessageType(row.message_type);
  if (mediaType !== 'image' && mediaType !== 'audio') return null;
  const sourceUrl = pickString(row.metadata, [
    'signed_url',
    'public_url',
    'url',
    'storage_url',
    'image_url',
    'media_url',
  ]);
  const storagePath = pickString(row.metadata, ['path', 'storage_path', 'object_path', 'media_path']);
  const mimeType = pickString(row.metadata, ['original_mime_type', 'mime_type', 'content_type']);
  const isEncrypted =
    pickBoolean(row.metadata, ['is_encrypted_media', 'encrypted_media']) ??
    false;
  const caption = row.content && !row.content.startsWith('ccx:v1:') ? row.content : null;
  return {
    id: row.id,
    mediaType,
    sourceUrl,
    storagePath,
    caption,
    mimeType,
    isEncrypted,
  };
}

function mapFilesFromRow(row: {
  id: string;
  content: string;
  time_created?: number | string;
  message_type: string;
  metadata: Record<string, unknown> | null;
}): FileItem {
  const envelope = tryDecodeEnvelope(row.content);
  const fileName =
    pickString(row.metadata, ['attachment_name', 'file_name', 'filename', 'name']) ??
    envelope?.name ??
    (row.content && !row.content.startsWith('e2e:') && !row.content.startsWith('ccx:v1:')
      ? maskEncryptedSnippet(row.content)
      : 'Attachment');
  const sizeBytes = pickNumber(row.metadata, ['attachment_size', 'file_size', 'size_bytes', 'size']) ?? envelope?.size ?? 0;
  const mimeType =
    pickString(row.metadata, ['attachment_mime', 'original_mime_type', 'mime_type', 'content_type']) ??
    envelope?.mime ??
    'application/octet-stream';
  const downloadUrl = pickString(row.metadata, [
    'signed_url',
    'public_url',
    'url',
    'storage_url',
    'media_url',
    'attachment_url',
  ]);
  const storagePath =
    pickString(row.metadata, ['attachment_path', 'path', 'storage_path', 'object_path', 'media_path']) ??
    envelope?.path ??
    null;
  return {
    id: row.id,
    fileName,
    sizeBytes,
    mimeType,
    timestamp: formatTimestamp(row.time_created, ''),
    downloadUrl,
    storagePath,
    envelope,
  };
}

function mapMedia(rows: ConnectionTabsPayload['media']): MediaItem[] {
  return rows
    .map((row) => mapMediaFromRow(row))
    .filter((row): row is MediaItem => row != null);
}

function mapFiles(rows: ConnectionTabsPayload['files']): FileItem[] {
  return rows.map((row) => mapFilesFromRow(row));
}

function mergeMediaItems(localItems: MediaItem[], bffItems: MediaItem[]): MediaItem[] {
  const merged = new Map<string, MediaItem>();
  for (const item of bffItems) merged.set(item.id, item);
  for (const item of localItems) {
    const prev = merged.get(item.id);
    if (!prev) {
      merged.set(item.id, item);
      continue;
    }
    merged.set(item.id, {
      ...prev,
      ...item,
      sourceUrl: item.sourceUrl ?? prev.sourceUrl,
      storagePath: item.storagePath ?? prev.storagePath,
      caption: item.caption ?? prev.caption,
      mimeType: item.mimeType ?? prev.mimeType,
      isEncrypted: item.isEncrypted || prev.isEncrypted,
    });
  }
  return Array.from(merged.values());
}

function mergeFileItems(localItems: FileItem[], bffItems: FileItem[]): FileItem[] {
  const merged = new Map<string, FileItem>();
  for (const item of bffItems) merged.set(item.id, item);
  for (const item of localItems) {
    const prev = merged.get(item.id);
    if (!prev) {
      merged.set(item.id, item);
      continue;
    }
    merged.set(item.id, {
      ...prev,
      ...item,
      fileName: item.fileName !== 'Attachment' ? item.fileName : prev.fileName,
      sizeBytes: item.sizeBytes > 0 ? item.sizeBytes : prev.sizeBytes,
      mimeType: item.mimeType !== 'application/octet-stream' ? item.mimeType : prev.mimeType,
      downloadUrl: item.downloadUrl ?? prev.downloadUrl,
      storagePath: item.storagePath ?? prev.storagePath,
      envelope: item.envelope ?? prev.envelope,
      timestamp: item.timestamp || prev.timestamp,
    });
  }
  return Array.from(merged.values());
}

function mergeLinkItems(primary: LinkItem[], fallback: LinkItem[]): LinkItem[] {
  const merged = new Map<string, LinkItem>();
  for (const item of fallback) merged.set(item.url, item);
  for (const item of primary) merged.set(item.url, item);
  return Array.from(merged.values());
}

const URL_REGEX = /https?:\/\/\S+/gi;
const ENCRYPTED_ATTACHMENT_SNIPPET = /ccx:v1:[^\s]+/gi;

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

function maskEncryptedSnippet(value: string): string {
  return value.replace(ENCRYPTED_ATTACHMENT_SNIPPET, '[encrypted attachment]');
}

function sanitizeDownloadName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]+/g, '_');
  return cleaned || 'Attachment';
}

function extensionFromMime(mimeType: string | null | undefined): string {
  const mt = (mimeType ?? '').toLowerCase();
  if (mt.includes('jpeg')) return 'jpg';
  if (mt.includes('png')) return 'png';
  if (mt.includes('webp')) return 'webp';
  if (mt.includes('gif')) return 'gif';
  if (mt.includes('mp3')) return 'mp3';
  if (mt.includes('wav')) return 'wav';
  if (mt.includes('webm')) return 'webm';
  if (mt.includes('ogg')) return 'ogg';
  if (mt.includes('mpeg') || mt.includes('m4a') || mt.includes('mp4')) return 'm4a';
  return 'bin';
}

function triggerBlobDownload(bytes: Uint8Array, fileName: string, mimeType: string): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = sanitizeDownloadName(fileName);
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
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
  forceOwnProfileBirthdayCompletion = false,
  connectionId = null,
  decryptedMessages = [],
}: UserProfileModalProps) {
  const { mutate } = useSWRConfig();
  const requestedUserId = userId?.trim() || null;
  const [activeTab, setActiveTab] = useState<ProfileTabKey>('timeline');
  const [birthdayDraft, setBirthdayDraft] = useState('');
  const [birthdaySaveError, setBirthdaySaveError] = useState<string | null>(null);
  const [birthdaySaving, setBirthdaySaving] = useState(false);
  const [derivedKeys, setDerivedKeys] = useState<DerivedKeys | null>(null);
  const [resolvedMediaUrls, setResolvedMediaUrls] = useState<Record<string, string>>({});
  const [signedFileUrls, setSignedFileUrls] = useState<Record<string, string>>({});
  const profilePath = requestedUserId ? `/api/users/${encodeURIComponent(requestedUserId)}/profile` : null;
  const { data, error } = useSWR<UserProfilePayload>(
    profilePath,
    async (path: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(path, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' && json.error.trim()
            ? json.error
            : res.statusText || 'Failed to load profile',
        );
      }
      return json as UserProfilePayload;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: false,
    },
  );

  const profileData = useMemo(() => {
    if (!requestedUserId || !data?.user?.id) return null;
    return data.user.id === requestedUserId ? data : null;
  }, [data, requestedUserId]);

  const interestTagKeys = useMemo(() => {
    if (!profileData) return [];
    return stableKeysForStringList(profileData.tags, `interest:${profileData.user.id}`);
  }, [profileData]);

  const sharedInterestTagKeys = useMemo(() => {
    if (!profileData) return [];
    return stableKeysForStringList(profileData.sharedInterestTags ?? [], `shared:${profileData.user.id}`);
  }, [profileData]);

  const effectiveConnectionId = useMemo(() => {
    const fromProp = connectionId?.trim();
    if (fromProp) return fromProp;
    const fromProfile = (profileData?.sharedConnection as Record<string, unknown> | null)?.id;
    return typeof fromProfile === 'string' && fromProfile.trim() ? fromProfile.trim() : null;
  }, [connectionId, profileData?.sharedConnection]);

  const tabsPath = effectiveConnectionId
    ? `/api/connections/${encodeURIComponent(effectiveConnectionId)}/tabs?limit=200`
    : null;
  const { data: tabsPayload, isLoading: tabsLoading } = useSWR<ConnectionTabsPayload>(
    tabsPath,
    async (path: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(path, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' && json.error.trim()
            ? json.error
            : res.statusText || 'Failed to load profile tabs',
        );
      }
      return json as ConnectionTabsPayload;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: false,
    },
  );

  const chatMessagesPath = tabsPayload?.chatId
    ? `/api/chat/messages?chatId=${encodeURIComponent(tabsPayload.chatId)}&limit=200`
    : null;
  const { data: chatMessagesPayload, isLoading: chatMessagesLoading } = useSWR<ChatMessagesPayload>(
    chatMessagesPath,
    async (path: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(path, { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' && json.error.trim()
            ? json.error
            : res.statusText || 'Failed to load chat messages',
        );
      }
      return json as ChatMessagesPayload;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: false,
    },
  );

  const connectionUserIds = useMemo(() => {
    const raw = (profileData?.sharedConnection as Record<string, unknown> | null)?.user_ids;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v.length > 0);
  }, [profileData?.sharedConnection]);
  const connectionUserIdsKey = connectionUserIds.join(':');

  useEffect(() => {
    let cancelled = false;
    setDerivedKeys(null);
    if (!effectiveConnectionId || connectionUserIds.length < 2) return;

    void deriveKeysForConnection(effectiveConnectionId, connectionUserIds)
      .then((keys) => {
        if (!cancelled) setDerivedKeys(keys);
      })
      .catch(() => {
        if (!cancelled) setDerivedKeys(null);
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveConnectionId, connectionUserIdsKey]);

  const localMediaItems = useMemo(() => {
    return decryptedMessages
      .map((m) =>
        mapMediaFromRow({
          id: m.id,
          content: m.content,
          message_type: coerceMessageType(m.messageType),
          metadata: m.metadata ?? null,
        }),
      )
      .filter((row): row is MediaItem => row != null);
  }, [decryptedMessages]);

  const bffMediaItems = useMemo(() => mapMedia(tabsPayload?.media ?? []), [tabsPayload]);
  const mediaItems = useMemo(
    () => mergeMediaItems(localMediaItems, bffMediaItems),
    [localMediaItems, bffMediaItems],
  );
  const imageItems = useMemo(() => mediaItems.filter((m) => m.mediaType === 'image'), [mediaItems]);
  const audioItems = useMemo(() => mediaItems.filter((m) => m.mediaType === 'audio'), [mediaItems]);

  const localFileItems = useMemo(() => {
    const fileMessages = decryptedMessages.filter(
      (m) =>
        coerceMessageType(m.messageType) === 'file' ||
        (m.metadata != null &&
          (typeof m.metadata['attachment_v'] === 'number' ||
            typeof m.metadata['attachment_v'] === 'string' ||
            typeof m.metadata['attachment_path'] === 'string' ||
            typeof m.metadata['attachment_name'] === 'string' ||
            typeof m.metadata['file_name'] === 'string' ||
            typeof m.metadata['filename'] === 'string')),
    );
    return fileMessages.map((m): FileItem =>
      mapFilesFromRow({
        id: m.id,
        content: m.content,
        message_type: coerceMessageType(m.messageType),
        metadata: m.metadata ?? null,
        time_created: m.timestamp,
      }),
    );
  }, [decryptedMessages]);
  const bffFileItems = useMemo(() => mapFiles(tabsPayload?.files ?? []), [tabsPayload]);
  const fileItems = useMemo(
    () => mergeFileItems(localFileItems, bffFileItems),
    [localFileItems, bffFileItems],
  );

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    setResolvedMediaUrls({});

    const resolveAll = async () => {
      const next: Record<string, string> = {};
      for (const item of mediaItems) {
        try {
          let sourceUrl = item.sourceUrl;
          if (!sourceUrl && item.storagePath) {
            sourceUrl = await signChatAttachmentUrl(item.storagePath, getAuthHeaders);
          }
          if (!sourceUrl) continue;

          if (item.isEncrypted) {
            if (!derivedKeys) continue;
            const objectUrl = await createSecureMediaObjectUrl({
              storageUrl: sourceUrl,
              chatKey: derivedKeys,
              mimeType: item.mimeType ?? undefined,
            });
            objectUrls.push(objectUrl);
            next[item.id] = objectUrl;
          } else {
            next[item.id] = sourceUrl;
          }
        } catch {
          // Keep this media tile hidden when we cannot resolve/decrypt its source.
        }
      }
      if (!cancelled) setResolvedMediaUrls(next);
    };

    void resolveAll();
    return () => {
      cancelled = true;
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [derivedKeys, getAuthHeaders, mediaItems]);

  const localLinkItems = useMemo(
    () =>
      extractLinks(
        decryptedMessages.filter(
          (m) =>
            coerceMessageType(m.messageType) === 'text' &&
            (m.content.includes('http://') || m.content.includes('https://')),
        ),
      ),
    [decryptedMessages],
  );
  const [fallbackLinkItems, setFallbackLinkItems] = useState<LinkItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const sourceRows = chatMessagesPayload?.messages ?? [];
    if (sourceRows.length === 0) {
      setFallbackLinkItems([]);
      return;
    }

    const hydrate = async () => {
      const decryptedRows: DecryptedProfileMessage[] = [];
      for (const row of sourceRows) {
        if (coerceMessageType(row.message_type) !== 'text') continue;

        let content = row.content;
        if (isEncrypted(content) && derivedKeys) {
          content = await decryptContent(content, derivedKeys);
        }

        decryptedRows.push({
          id: row.id,
          content,
          timestamp: new Date(row.time_created).toISOString(),
          messageType: row.message_type,
          metadata: row.metadata,
        });
      }

      if (!cancelled) {
        setFallbackLinkItems(extractLinks(decryptedRows));
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [chatMessagesPayload?.messages, derivedKeys, localLinkItems.length]);

  const linkItems = useMemo(
    () => mergeLinkItems(localLinkItems, fallbackLinkItems),
    [localLinkItems, fallbackLinkItems],
  );

  const downloadUrl = useCallback(async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objUrl;
      anchor.download = sanitizeDownloadName(filename);
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objUrl);
      return;
    } catch {
      // Fallback: trigger a direct navigation/download via anchor (popup-safe).
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = sanitizeDownloadName(filename);
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  }, []);

  const openMediaItem = useCallback(
    (item: MediaItem) => {
      const url = resolvedMediaUrls[item.id];
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [resolvedMediaUrls],
  );

  const downloadMediaItem = useCallback(
    async (item: MediaItem) => {
      const url = resolvedMediaUrls[item.id];
      if (!url) return;
      const ext = extensionFromMime(item.mimeType);
      await downloadUrl(url, `${item.mediaType}-${item.id}.${ext}`);
    },
    [downloadUrl, resolvedMediaUrls],
  );

  const resolveFileUrl = useCallback(
    async (item: FileItem): Promise<string | null> => {
      if (item.downloadUrl) return item.downloadUrl;
      const cached = signedFileUrls[item.id];
      if (cached) return cached;
      if (!item.storagePath) return null;
      try {
        const signed = await signChatAttachmentUrl(item.storagePath, getAuthHeaders);
        setSignedFileUrls((prev) => ({ ...prev, [item.id]: signed }));
        return signed;
      } catch {
        return null;
      }
    },
    [getAuthHeaders, signedFileUrls],
  );

  const openFileItem = useCallback(
    async (item: FileItem) => {
      const popup = window.open('', '_blank', 'noopener,noreferrer');
      const url = await resolveFileUrl(item);
      if (!url) {
        popup?.close();
        return;
      }
      if (popup) {
        popup.location.href = url;
      } else {
        window.location.assign(url);
      }
    },
    [resolveFileUrl],
  );

  const downloadFileItem = useCallback(
    async (item: FileItem) => {
      const url = await resolveFileUrl(item);
      if (!url) return;
      if (item.envelope) {
        try {
          const ciphertext = await downloadAttachmentCiphertext(url);
          const fileKey = decodeFileMasterKeyBase64(item.envelope.key);
          const plaintext = await decryptFileBytes(ciphertext, fileKey);
          const digest = await sha256Base64(plaintext);
          if (digest !== item.envelope.sha256) {
            throw new Error('Attachment integrity check failed (SHA-256 mismatch)');
          }
          triggerBlobDownload(plaintext, item.fileName, item.mimeType);
          return;
        } catch {
          // If decryption fails, fall back to raw download path for legacy/non-envelope rows.
        }
      }
      await downloadUrl(url, item.fileName);
    },
    [downloadUrl, resolveFileUrl],
  );

  useEffect(() => {
    // Reset derived state whenever the sheet opens for a new user.
    if (!requestedUserId) return;
    setActiveTab('timeline');
    setResolvedMediaUrls({});
    setSignedFileUrls({});
    setFallbackLinkItems([]);
    setBirthdayDraft('');
    setBirthdaySaveError(null);
    setBirthdaySaving(false);
  }, [requestedUserId]);

  useEffect(() => {
    if (!forceOwnProfileBirthdayCompletion || !profileData?.user) return;
    const u = profileData.user;
    const existing = u.birthday?.trim();
    if (existing) {
      setBirthdayDraft(existing.slice(0, 10));
    } else {
      setBirthdayDraft('');
    }
  }, [forceOwnProfileBirthdayCompletion, profileData?.user?.birthday, profileData?.user?.id]);

  const open = !!requestedUserId;
  const errorMessage = error instanceof Error ? error.message : error ? 'Failed to load' : null;
  const loading = Boolean(requestedUserId) && !profileData && !errorMessage;

  const momentLines = useMemo(() => {
    const sc = profileData?.sharedConnection;
    const payload = coerceSharedConnection(sc);
    if (!payload) return null;
    return buildProfileConnectionLines(payload);
  }, [profileData?.sharedConnection]);

  const hasMoment =
    !!momentLines &&
    Object.values(momentLines).some((v) => typeof v === 'string' && v.trim().length > 0);

  const encounterTimeline = useMemo(() => {
    const raw = profileData?.sharedConnection;
    if (!raw || typeof raw !== 'object') return null;
    const conn = raw as Record<string, unknown>;
    const rows = parseConnectionEncounters(conn);
    const origin = originEncounter(conn);
    return { rows, originId: origin?.id ?? null };
  }, [profileData?.sharedConnection]);

  const blockingBirthday =
    forceOwnProfileBirthdayCompletion &&
    !!profileData &&
    (profileData.user.birthday == null || !String(profileData.user.birthday).trim());

  const saveOwnBirthday = async () => {
    if (!requestedUserId || !profilePath) return;
    setBirthdaySaveError(null);
    const raw = birthdayDraft.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      setBirthdaySaveError('Use format YYYY-MM-DD.');
      return;
    }
    const age = ageFromBirthday(raw);
    if (age == null || age < 13) {
      setBirthdaySaveError('You must be at least 13 years old.');
      return;
    }
    setBirthdaySaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(profilePath, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthday: raw.slice(0, 10) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === 'string' && json.error.trim()
            ? json.error.trim()
            : res.statusText || 'Could not save',
        );
      }
      await mutate(profilePath);
      onClose();
    } catch (e) {
      setBirthdaySaveError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBirthdaySaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key={requestedUserId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 p-4 backdrop-blur-sm transform-gpu translate-z-0 will-change-[opacity]"
          onClick={blockingBirthday ? () => {} : onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320, mass: 0.85 }}
            className="w-full max-w-md max-h-[min(88vh,640px)] overflow-y-auto overscroll-y-contain rounded-3xl border border-zinc-700/80 bg-zinc-950 shadow-2xl transform-gpu translate-z-0 will-change-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 isolate flex items-center justify-between border-b border-zinc-800/90 bg-zinc-950/95 px-4 pt-6 pb-3 backdrop-blur-md transform-gpu translate-z-0 will-change-transform supports-[backdrop-filter]:bg-zinc-950/80">
              <h2 className="text-lg font-semibold text-white">
                {blockingBirthday ? 'Add your birthday' : 'Profile'}
              </h2>
              {!blockingBirthday ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : (
                <span className="w-10" aria-hidden />
              )}
            </div>

            <div className="p-5">
              {blockingBirthday && (
                <div className="mb-5 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4">
                  <p className="text-sm text-amber-100/95 mb-3">
                    To keep Click age-appropriate, please confirm your date of birth. This modal stays open until you save.
                  </p>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5" htmlFor="profile-gate-birthday">
                    Birthday
                  </label>
                  <input
                    id="profile-gate-birthday"
                    type="date"
                    autoComplete="bday"
                    value={birthdayDraft}
                    onChange={(e) => setBirthdayDraft(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#8338EC]"
                    max={new Date().toISOString().slice(0, 10)}
                  />
                  {birthdaySaveError ? (
                    <p className="mt-2 text-xs text-red-400">{birthdaySaveError}</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={birthdaySaving}
                    onClick={() => {
                      void saveOwnBirthday();
                    }}
                    className="mt-4 w-full rounded-xl bg-[#8338EC] py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {birthdaySaving ? 'Saving…' : 'Save birthday'}
                  </button>
                </div>
              )}
              {loading && <ProfileLoadingSkeleton />}
              {errorMessage && !loading && (
                <p className="text-sm text-red-400 text-center py-6">{errorMessage}</p>
              )}
              {profileData && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-5"
                >
                  <div className="flex flex-col items-center gap-3">
                    {profileData.user.image ? (
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-2 ring-[#8338EC]/40 transform-gpu translate-z-0">
                        <Image
                          src={profileData.user.image}
                          alt=""
                          width={96}
                          height={96}
                          priority
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] text-3xl font-bold text-white"
                      >
                        {displayName(profileData.user).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-xl font-semibold text-white">
                        {displayName(profileData.user)}
                        {ageFromBirthday(profileData.user.birthday) != null && (
                          <span className="text-zinc-400 font-normal">, {ageFromBirthday(profileData.user.birthday)}</span>
                        )}
                      </p>
                      {profileData.user.email && (
                        <p className="text-xs text-zinc-500 mt-1">{profileData.user.email}</p>
                      )}
                    </div>
                  </div>

                  {/*
                    Four-tab secondary nav mirroring the KMP [ProfileBottomSheet]
                    subtabs: Timeline · Media · Links · Files. Tab content is derived
                    from local decrypted message state to preserve E2EE integrity.
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
                      {mediaItems.length === 0 && tabsLoading ? (
                        <EmptyTabState
                          Icon={ImageIcon}
                          title="Loading shared media"
                          body="Pulling image and audio history for this conversation."
                        />
                      ) : mediaItems.length === 0 ? (
                        <EmptyTabState
                          Icon={ImageIcon}
                          title="No shared media"
                          body="Photos and voice notes you exchange in chat will appear here."
                        />
                      ) : (
                        <div className="space-y-4">
                          {imageItems.length > 0 && (
                            <div className="grid grid-cols-3 gap-2">
                              {imageItems.map((m) => (
                                <div key={m.id} className="group relative">
                                  {resolvedMediaUrls[m.id] ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openMediaItem(m)}
                                        className="block w-full"
                                        aria-label="Expand image"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={resolvedMediaUrls[m.id]}
                                          alt={m.caption ?? ''}
                                          width={400}
                                          height={112}
                                          decoding="async"
                                          className="h-28 w-full rounded-lg object-cover ring-1 ring-zinc-800"
                                        />
                                      </button>
                                      <div className="pointer-events-none absolute inset-0 rounded-lg bg-black/0 transition group-hover:bg-black/30" />
                                      <div className="absolute bottom-1 right-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                                        <button
                                          type="button"
                                          onClick={() => openMediaItem(m)}
                                          className="pointer-events-auto rounded-md bg-black/65 p-1 text-zinc-100 hover:bg-black/80"
                                          aria-label="Open image"
                                        >
                                          <Maximize2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => downloadMediaItem(m)}
                                          className="pointer-events-auto rounded-md bg-black/65 p-1 text-zinc-100 hover:bg-black/80"
                                          aria-label="Download image"
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex h-28 w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-400">
                                      Secured image
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {audioItems.length > 0 && (
                            <ul className="flex flex-col gap-2">
                              {audioItems.map((m) => {
                                const audioUrl = resolvedMediaUrls[m.id];
                                return (
                                  <li key={m.id} className="rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-medium text-zinc-300">Voice note</p>
                                      <div className="flex items-center gap-1">
                                        {audioUrl && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => openMediaItem(m)}
                                              className="rounded-md p-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                              aria-label="Open audio"
                                            >
                                              <ExternalLink className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => downloadMediaItem(m)}
                                              className="rounded-md p-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                              aria-label="Download audio"
                                            >
                                              <Download className="h-3.5 w-3.5" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    {audioUrl ? (
                                      <audio controls preload="metadata" src={audioUrl} className="mt-2 w-full" />
                                    ) : (
                                      <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-500">
                                        Secured audio
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                  {activeTab === 'links' && (
                    <section role="tabpanel" aria-label="Links">
                      {linkItems.length === 0 && chatMessagesLoading ? (
                        <EmptyTabState
                          Icon={LinkIcon}
                          title="Loading shared links"
                          body="Scanning chat history for URLs."
                        />
                      ) : linkItems.length === 0 ? (
                        <EmptyTabState
                          Icon={LinkIcon}
                          title="No shared links"
                          body="URLs shared in chat show up here."
                        />
                      ) : (
                        <ul className="flex flex-col gap-2">
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
                      {fileItems.length === 0 && tabsLoading ? (
                        <EmptyTabState
                          Icon={Paperclip}
                          title="Loading shared files"
                          body="Fetching attachment metadata for this chat."
                        />
                      ) : fileItems.length === 0 ? (
                        <EmptyTabState
                          Icon={Paperclip}
                          title="No shared files"
                          body="Attachments sent in chat will appear here."
                        />
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {fileItems.map((f) => (
                            <li key={f.id}>
                              <div className="flex w-full items-start gap-3 rounded-xl border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5 text-left hover:border-sky-400/50 hover:bg-zinc-900/80">
                                <FileText className="h-4 w-4 shrink-0 text-sky-400/90 mt-0.5" aria-hidden />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-white">{f.fileName}</p>
                                  <p className="text-[11px] text-zinc-500 mt-0.5">
                                    {formatFileSize(f.sizeBytes)} · {f.mimeType}
                                  </p>
                                  <p className="text-[11px] text-zinc-500">{f.timestamp}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void openFileItem(f);
                                    }}
                                    className="rounded-md p-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                    aria-label="Open file"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void downloadFileItem(f);
                                    }}
                                    className="rounded-md p-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                    aria-label="Download file"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </div>
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
                    {profileData.tags.length === 0 ? (
                      <p className="text-sm text-zinc-500">No interests shared yet</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {profileData.tags.map((t, i) => (
                          <span
                            key={interestTagKeys[i]}
                            className="rounded-full border border-[#8338EC]/35 bg-[#8338EC]/10 px-3 py-1 text-xs text-[#c4b5fd]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>

                  {!!profileData.sharedInterestTags?.length && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                        Shared interests
                      </h3>
                      <p className="text-[11px] text-zinc-500 mb-2">
                        Conversation starters you both listed
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(profileData.sharedInterestTags ?? []).map((t, i) => (
                          <span
                            key={sharedInterestTagKeys[i]}
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
                      availability={profileData.availability}
                      availabilityIntents={profileData.availabilityIntents}
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
                            className="absolute left-[15px] top-2 bottom-3 w-px bg-zinc-700/85 pointer-events-none transform-gpu translate-z-0"
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
                                    className="absolute left-[10px] top-[7px] z-[1] h-3 w-3 rounded-full border-2 border-zinc-950 bg-gradient-to-br from-[#8338EC] to-[#3A86FF] shadow-sm transform-gpu translate-z-0"
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
                                        {pills.map(({ metricKey, Icon, label }) => (
                                          <span
                                            key={`${enc.id}-${metricKey}`}
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
