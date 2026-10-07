import { authFailureMessage, getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { normalizeDbMessage } from '@/lib/chat/messages';
import type { Message } from '@/lib/chat/types';

export const THREAD_PAGE_SIZE = 40;

/** A page warmed on hover must be this fresh to stand in for opening the thread. */
const WARM_TTL_MS = 10_000;

/** One page of a thread as stored (ciphertext, oldest first). Needs no keys. */
export async function fetchThreadPage(
  chatId: string,
  { cursor, aroundMessageId, getHeaders = getFreshAuthHeaders }: {
    cursor?: number;
    aroundMessageId?: string;
    getHeaders?: () => Promise<HeadersInit>;
  } = {},
): Promise<Message[]> {
  const params = new URLSearchParams({ chatId, limit: String(THREAD_PAGE_SIZE) });
  if (cursor) params.set('cursor', String(cursor));
  if (aroundMessageId) params.set('aroundMessageId', aroundMessageId);
  const res = await fetch(`/api/chat/messages?${params}`, { headers: await getHeaders() });
  const json = (await res.json().catch(() => ({}))) as { error?: string; messages?: Record<string, unknown>[] };
  if (!res.ok) throw new Error(authFailureMessage(res.status, json.error ?? 'Failed to load messages'));
  return (json.messages ?? []).reverse().map(normalizeDbMessage);
}

const warmed = new Map<string, { at: number; page: Promise<Message[]> }>();

/** Start loading a thread's latest page before it opens (inbox row hover, touch or focus). */
export function warmThreadFirstPage(chatId: string | null | undefined, nowMs = Date.now()): void {
  if (!chatId) return;
  const existing = warmed.get(chatId);
  if (existing && nowMs - existing.at < WARM_TTL_MS) return;
  const page = fetchThreadPage(chatId);
  page.catch(() => {
    if (warmed.get(chatId)?.page === page) warmed.delete(chatId);
  });
  warmed.set(chatId, { at: nowMs, page });
}

/** The warmed latest page, if fresh; taken once so a later reload fetches again. */
export function takeWarmThreadFirstPage(chatId: string, nowMs = Date.now()): Promise<Message[]> | null {
  const entry = warmed.get(chatId);
  warmed.delete(chatId);
  return entry && nowMs - entry.at < WARM_TTL_MS ? entry.page : null;
}
