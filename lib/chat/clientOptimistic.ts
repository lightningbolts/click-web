import type { Message } from '@/lib/chat/types';

/** Prefix for optimistic text rows before realtime supplies the server `id`. */
export const CLIENT_OPTIMISTIC_MESSAGE_ID_PREFIX = 'client-opt:';

export function isClientOptimisticMessageId(id: string): boolean {
  return id.startsWith(CLIENT_OPTIMISTIC_MESSAGE_ID_PREFIX);
}

/** Stable list key so the same DOM bubble survives optimistic → server merge. */
export function bubbleStableListKey(message: Message): string {
  const m = message.metadata;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    const bk = (m as Record<string, unknown>)._bubbleKey;
    if (typeof bk === 'string' && bk.length > 0) return bk;
  }
  return message.id;
}
