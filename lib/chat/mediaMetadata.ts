import type { Message, MessageMediaMetadata, MessageType } from '@/lib/chat/types';

/** Public URL for image/audio from `metadata.media_url` (camelCase fallback for older rows). */
export function mediaUrlFromMetadata(metadata: MessageMediaMetadata | undefined | null): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const u = metadata.media_url ?? (metadata as { mediaUrl?: string }).mediaUrl;
  return typeof u === 'string' && u.trim() ? u.trim() : null;
}

export function durationSecondsFromMetadata(metadata: MessageMediaMetadata | undefined | null): number | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = metadata.duration_seconds ?? (metadata as { durationSeconds?: number }).durationSeconds;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return undefined;
}

/** Short preview label (list / reply banner), aligned with KMP `Message.previewLabel()`. */
export function previewLabelForMessage(message: Pick<Message, 'message_type' | 'content'>): string {
  const cap = message.content.replace(/\n/g, ' ').trim();
  const t = message.message_type as MessageType;
  if (t === 'image') return cap || 'Photo';
  if (t === 'audio') return cap || 'Voice message';
  if (t === 'call_log') return 'Call';
  return message.content;
}
