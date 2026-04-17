/**
 * Shared helpers for normalizing DB message rows and building insert payloads.
 */

import type { Message, MessageType } from '@/lib/chat/types';

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
  return {
    id: String(row.id),
    chat_id: String(row.chat_id),
    user_id: String(row.user_id),
    content: typeof row.content === 'string' ? row.content : '',
    time_created: Number(row.time_created),
    time_edited: row.time_edited != null ? Number(row.time_edited) : null,
    is_read: Boolean(row.is_read),
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

export function buildMessageInsertRow(params: {
  chatId: string;
  userId: string;
  content: string;
  now: number;
  messageType?: MessageType;
  metadata?: unknown;
}): MessageInsertRow {
  return {
    chat_id: params.chatId,
    user_id: params.userId,
    content: params.content,
    time_created: params.now,
    message_type: params.messageType ?? 'text',
    metadata: coerceMetadata(params.metadata),
  };
}
