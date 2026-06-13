/**
 * Shared helpers for normalizing DB message rows and building insert payloads.
 */

import type { Message, MessageType } from '@/lib/chat/types';
import { computeClickDropRevealTtlIso } from '@/lib/collaboration/clickDropReveal';

export function coerceMessageType(value: unknown): MessageType {
  const s = typeof value === 'string' ? value.toLowerCase() : '';
  if (s === 'call_log') return 'call_log';
  if (s === 'image') return 'image';
  if (s === 'audio') return 'audio';
  if (s === 'file') return 'file';
  return 'text';
}

export function coerceMetadata(value: unknown): Message['metadata'] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Message['metadata'];
  }
  return {};
}

/** Normalize a row from PostgREST / Realtime into a [Message] (safe defaults for new columns). */
export function normalizeDbMessage(row: Record<string, unknown>): Message {
  const localSentRaw = row.local_sent_at;
  const readAtRaw = row.read_at;
  const deliveredAtRaw = row.delivered_at;
  return {
    id: String(row.id),
    chat_id: String(row.chat_id),
    user_id: String(row.user_id),
    content: typeof row.content === 'string' ? row.content : '',
    time_created: Number(row.time_created),
    time_edited: row.time_edited != null ? Number(row.time_edited) : null,
    is_read: Boolean(row.is_read),
    local_sent_at:
      localSentRaw != null && Number.isFinite(Number(localSentRaw)) ? Number(localSentRaw) : null,
    read_at: readAtRaw != null && Number.isFinite(Number(readAtRaw)) ? Number(readAtRaw) : null,
    delivered_at:
      deliveredAtRaw != null && Number.isFinite(Number(deliveredAtRaw))
        ? Number(deliveredAtRaw)
        : null,
    message_type: coerceMessageType(row.message_type),
    metadata: coerceMetadata(row.metadata),
    ...(row.reactions !== undefined
      ? { reactions: row.reactions as Message['reactions'] }
      : {}),
  };
}

export type MessageInsertRow = {
  chat_id: string;
  user_id: string;
  content: string;
  time_created: number;
  message_type: MessageType;
  metadata: Message['metadata'];
  local_sent_at?: number | null;
};

export type CallLogStateKey = 'missed' | 'declined' | 'completed';

/** POST a call_log row via the Next.js messages API (caller-only for missed/declined/completed per app rules). */
export async function insertCallLogMessage(
  getAuthHeaders: () => Promise<HeadersInit>,
  connectionId: string,
  callState: CallLogStateKey,
  durationSeconds: number,
): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/chat/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      connectionId,
      content: '',
      message_type: 'call_log',
      metadata: { call_state: callState, duration_seconds: durationSeconds },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`insertCallLogMessage failed: ${res.status} ${text}`);
  }
}

/** Parses optional client `local_sent_at` (ms). Returns null if absent or invalid. */
/** Fire-and-forget: recipient tells server which peer-authored rows reached this device. */
export async function notifyMessagesDelivered(
  getAuthHeaders: () => Promise<HeadersInit>,
  chatId: string,
  messageIds: string[],
): Promise<void> {
  if (!chatId || messageIds.length === 0) return;
  const headers = await getAuthHeaders();
  const res = await fetch('/api/chat/messages/delivered', {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chat_id: chatId, message_ids: messageIds }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`notifyMessagesDelivered failed: ${res.status} ${text}`);
  }
}

export function parseLocalSentAtMs(raw: unknown): number | null {
  if (typeof raw !== 'number') return null;
  if (!Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  if (raw > 1e15) return null;
  return Math.trunc(raw);
}

export function buildMessageInsertRow(params: {
  chatId: string;
  userId: string;
  content: string;
  now: number;
  messageType?: MessageType;
  metadata?: unknown;
  localSentAtMs?: number | null;
}): MessageInsertRow {
  const metadata = coerceMetadata(params.metadata);
  if (metadata.disposable_roll === true) {
    const revealAt = computeClickDropRevealTtlIso(params.now);
    metadata.collaboration_ttl = revealAt;
    metadata.reveal_at = revealAt;
  }
  const row: MessageInsertRow = {
    chat_id: params.chatId,
    user_id: params.userId,
    content: params.content,
    time_created: params.now,
    message_type: params.messageType ?? 'text',
    metadata,
  };
  const local = params.localSentAtMs;
  if (local != null) {
    row.local_sent_at = local;
  }
  return row;
}
