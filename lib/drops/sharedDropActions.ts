import { sendDirectText } from '@/lib/chat/chatTextSend';
import { homeRequest, postHomeAction } from '@/lib/home/postHomeAction';
import type { DropReplyMeta } from '@/lib/drops/dropReply';
import type { DropReactions, HomeDrop } from '@/lib/home/types';

type DevelopResponse = {
  drops: ({ id: string; status: 'developed'; developed_at: string; url: string | null } | { id: string; status: 'pending' | 'not_found' })[];
};

/**
 * Develops a shared drop for this viewer (idempotent: an already developed one just gets a fresh
 * signed original). `pending` before its reveal; null if it's gone or no longer shared with you.
 */
export async function developSharedDrop(
  id: string,
): Promise<{ status: 'developed'; developed_at: string; url: string | null } | { status: 'pending' } | null> {
  const res = await postHomeAction<DevelopResponse>('/api/drops/develop', { drops: [{ kind: 'shared', id }] });
  const hit = res.drops.find((d) => d.id === id);
  if (hit?.status === 'developed') return hit;
  return hit?.status === 'pending' ? { status: 'pending' } : null;
}

export function loadDropReactions(id: string): Promise<DropReactions> {
  return homeRequest<DropReactions>('GET', `/api/reactions/shared_drop/${encodeURIComponent(id)}`);
}

/** React (replacing any earlier reaction) or, with null, take it back. */
export function reactToDrop(id: string, emoji: string | null): Promise<DropReactions> {
  return homeRequest<DropReactions>('PUT', `/api/reactions/shared_drop/${encodeURIComponent(id)}`, { emoji });
}

export function deleteSharedDrop(id: string): Promise<unknown> {
  return homeRequest('DELETE', `/api/me/shared-drops/${encodeURIComponent(id)}`);
}

export function reportSharedDrop(id: string, reason: string): Promise<unknown> {
  return postHomeAction('/api/drops/report', { kind: 'shared', id, reason });
}

/** The strip as `GET /api/me/shared-drops` returns it (newest first). */
export async function loadSharedDropStrip(): Promise<HomeDrop[]> {
  return (await homeRequest<{ drops?: HomeDrop[] }>('GET', '/api/me/shared-drops')).drops ?? [];
}

/**
 * A reply (or a reaction's emoji) into your 1-1 chat with the poster, carrying the drop with it,
 * so it's there when that chat opens.
 */
export function sendDropReply(drop: HomeDrop, viewerId: string, text: string, reaction: boolean): Promise<void> {
  if (!drop.connection_id) return Promise.reject(new Error('There’s no chat to reply in.'));
  const dropReply: DropReplyMeta = { kind: 'shared', id: drop.id, reaction };
  return sendDirectText({
    connectionId: drop.connection_id,
    viewerId,
    peerId: drop.user.id,
    content: text,
    metadata: { drop_reply: dropReply },
  });
}
