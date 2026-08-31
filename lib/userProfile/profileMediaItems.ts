import { coerceMessageType } from '@/lib/chat/messages';
import { tryDecodeEnvelope } from '@/lib/chat/attachmentCrypto';
import { beaconHeroImageUrl } from '@/lib/ui/beaconHeroImageUrl';
import type {
  BeaconPreviewItem,
  ConnectionTabsPayload,
  DecryptedProfileMessage,
  FileItem,
  LinkItem,
  MediaItem,
} from '@/lib/userProfile/profileModalTypes';

export function pickString(meta: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!meta) return null;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function pickNumber(meta: Record<string, unknown> | null | undefined, keys: string[]): number | null {
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

export function pickBoolean(meta: Record<string, unknown> | null | undefined, keys: string[]): boolean | null {
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

export function formatTimestamp(raw: number | string | undefined, fallback: string): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return fallback;
}

export function mapMediaFromRow(row: {
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

export function mapFilesFromRow(row: {
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

export function mapMedia(rows: ConnectionTabsPayload['media']): MediaItem[] {
  return rows
    .map((row) => mapMediaFromRow(row))
    .filter((row): row is MediaItem => row != null);
}

export function mapFiles(rows: ConnectionTabsPayload['files']): FileItem[] {
  return rows.map((row) => mapFilesFromRow(row));
}

export function mergeMediaItems(localItems: MediaItem[], bffItems: MediaItem[]): MediaItem[] {
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

export function mergeFileItems(localItems: FileItem[], bffItems: FileItem[]): FileItem[] {
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

export function mergeLinkItems(primary: LinkItem[], fallback: LinkItem[]): LinkItem[] {
  const merged = new Map<string, LinkItem>();
  for (const item of [...fallback, ...primary]) {
    if (!merged.has(item.url)) merged.set(item.url, item);
  }
  return Array.from(merged.values());
}

export function metaString(meta: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!meta) return null;
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) {
      const t = v.trim();
      if (t.toLowerCase() === 'current location') return null;
      return t;
    }
  }
  return null;
}

export function mapBeaconPreview(row: {
  id: string;
  content: string;
  message_type?: string;
  metadata: Record<string, unknown> | null;
}): BeaconPreviewItem | null {
  const meta = row.metadata;
  const beaconId =
    metaString(meta, 'beacon_id', 'beaconId') ??
    (typeof meta?.id === 'string' ? meta.id.trim() : null);
  if (!beaconId) return null;
  const title =
    metaString(meta, 'title', 'event_title', 'eventTitle', 'label', 'name') ??
    (row.content.replace(/^Beacon:\s*/i, '').trim() || 'Beacon');
  return {
    id: row.id,
    beaconId,
    title,
    description: metaString(meta, 'description', 'body', 'subtitle') ?? undefined,
    scheduleLabel: metaString(meta, 'schedule_label', 'scheduleLabel') ?? undefined,
    locationLabel:
      metaString(meta, 'formatted_address', 'formattedAddress', 'location_name', 'locationName') ??
      undefined,
    imageUrl: beaconHeroImageUrl(meta),
  };
}

export function mergeBeaconItems(localItems: BeaconPreviewItem[], bffItems: BeaconPreviewItem[]): BeaconPreviewItem[] {
  const merged = new Map<string, BeaconPreviewItem>();
  for (const item of [...bffItems, ...localItems]) {
    if (!merged.has(item.beaconId)) merged.set(item.beaconId, item);
  }
  return Array.from(merged.values());
}

const URL_REGEX = /https?:\/\/\S+/gi;
const ENCRYPTED_ATTACHMENT_SNIPPET = /ccx:v1:[^\s]+/gi;

export function extractLinks(messages: DecryptedProfileMessage[]): LinkItem[] {
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${((bytes / (1024 * 1024)) * 10 >> 0) / 10} MB`;
}

export function maskEncryptedSnippet(value: string): string {
  return value.replace(ENCRYPTED_ATTACHMENT_SNIPPET, '[encrypted attachment]');
}

export function sanitizeDownloadName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]+/g, '_');
  return cleaned || 'Attachment';
}

export function extensionFromMime(mimeType: string | null | undefined): string {
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

export function triggerBlobDownload(bytes: Uint8Array, fileName: string, mimeType: string): void {
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
