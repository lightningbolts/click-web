import { ENVELOPE_PREFIX, E2EE_V2_ATTACHMENT_PREFIX } from '@/lib/chat/attachmentCrypto';
import type { Message, MessageMediaMetadata, MessageType } from '@/lib/chat/types';

/** Public URL for image/audio from `metadata.media_url` (camelCase fallback for older rows). */
export function mediaUrlFromMetadata(metadata: MessageMediaMetadata | undefined | null): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const u = metadata.media_url ?? (metadata as { mediaUrl?: string }).mediaUrl;
  return typeof u === 'string' && u.trim() ? u.trim() : null;
}

/** Private storage path for v2 media; callers must mint a fresh signed URL before downloading. */
export function mediaPathFromMetadata(metadata: MessageMediaMetadata | undefined | null): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata.media_path ?? (metadata as { mediaPath?: unknown }).mediaPath;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export function durationSecondsFromMetadata(metadata: MessageMediaMetadata | undefined | null): number | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = metadata.duration_seconds ?? (metadata as { durationSeconds?: number }).durationSeconds;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return undefined;
}

export function isEncryptedMediaFromMetadata(
  metadata: MessageMediaMetadata | undefined | null,
): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const raw = metadata.is_encrypted_media ?? (metadata as { isEncryptedMedia?: unknown }).isEncryptedMedia;
  if (raw === true) return true;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
}

export function originalMimeTypeFromMetadata(
  metadata: MessageMediaMetadata | undefined | null,
): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw =
    metadata.original_mime_type ??
    (metadata as { originalMimeType?: unknown }).originalMimeType;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Short preview label (list / reply banner), aligned with KMP `Message.previewLabel()`. */
export function previewLabelForMessage(
  message: Pick<Message, 'message_type' | 'content'> & { metadata?: Message['metadata'] },
): string {
  const cap = message.content.replace(/\n/g, ' ').trim();
  const t = message.message_type as MessageType;
  if (t === 'image') return cap || 'Photo';
  if (t === 'audio') return cap || 'Voice message';
  if (t === 'call_log') return 'Call';
  if (t === 'beacon') {
    const meta = message.metadata && typeof message.metadata === 'object' ? message.metadata : null;
    const title =
      meta && typeof (meta as { title?: unknown }).title === 'string'
        ? String((meta as { title: string }).title).trim()
        : '';
    const beaconType =
      meta && typeof (meta as { beacon_type?: unknown }).beacon_type === 'string'
        ? String((meta as { beacon_type: string }).beacon_type).trim().toLowerCase()
        : '';
    if (title && (beaconType === 'event' || beaconType === 'social' || beaconType === 'social_vibe')) {
      return `Event: ${title}`;
    }
    if (title) return title;
    return 'Beacon';
  }
  // C6 regression fix: attachment envelopes (`ccx:v1:{...}`) must never bleed into
  // the chat list / reply banner as raw JSON. Render a neutral "📎 Attachment"
  // placeholder — the full preview is only materialised after client-side decryption.
  if (cap.startsWith(ENVELOPE_PREFIX) || cap.startsWith(E2EE_V2_ATTACHMENT_PREFIX)) return '📎 Attachment';
  return message.content;
}
