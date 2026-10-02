import type { Message } from '@/lib/chat/types';

/**
 * GIF messages (KLIPY picker). Contract shared with iOS `ChatGif` (click-ios
 * `Click/Core/Chat/ChatGif.swift`):
 *
 * - `message_type: 'text'`; the (encrypted) content is the KLIPY media URL, so the server never
 *   learns which GIF was sent and clients without GIF support still show a link.
 * - `metadata.gif = { provider: 'klipy', width, height }` — layout hints only, no URL or slug.
 *
 * KLIPY's terms require media to load straight from the URL the API returned (no re-hosting),
 * so GIFs are never uploaded to chat storage.
 */
export const GIF_METADATA_KEY = 'gif';

export type ChatGifMetadata = {
  provider: 'klipy';
  width: number;
  height: number;
};

export type ChatGif = ChatGifMetadata & { url: string };

/** KLIPY serves media from `static.klipy.com` and numbered shards (`static1`, `static2`, …). */
export function isKlipyMediaUrl(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && /^static\d*\.klipy\.com$/i.test(url.hostname);
}

function positiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function gifMetadataFromMessage(metadata: Message['metadata'] | null | undefined): ChatGifMetadata | null {
  const raw = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)[GIF_METADATA_KEY] : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const gif = raw as Record<string, unknown>;
  if (gif.provider !== 'klipy') return null;
  const width = positiveInt(gif.width);
  const height = positiveInt(gif.height);
  if (!width || !height) return null;
  return { provider: 'klipy', width, height };
}

/**
 * The GIF a decrypted message carries, or null. Requires both the metadata marker and a KLIPY
 * URL body, so a GIF bubble can never be pointed at an arbitrary host.
 */
export function chatGifFromMessage(
  message: Pick<Message, 'message_type' | 'content' | 'metadata'>,
): ChatGif | null {
  if (message.message_type !== 'text') return null;
  const meta = gifMetadataFromMessage(message.metadata);
  if (!meta) return null;
  const url = message.content.trim();
  return isKlipyMediaUrl(url) ? { ...meta, url } : null;
}

export function gifMessageMetadata(gif: ChatGifMetadata): Record<string, unknown> {
  return { [GIF_METADATA_KEY]: { provider: gif.provider, width: gif.width, height: gif.height } };
}
