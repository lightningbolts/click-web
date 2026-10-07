import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { deriveKeysForConnection, encryptContent, encryptGroupMessageContent, type DerivedKeys } from '@/lib/chat/crypto';
import {
  encryptWebE2eeV2Message,
  invalidateWebE2eeV2Session,
  resolveWebE2eeV2Session,
  type E2eeV2Session,
} from '@/lib/chat/e2eeV2Client';

/** The keys a conversation can encrypt with, best first: v2 epoch, v1 group master, v1 pairwise. */
export type ChatTextKeys = {
  v2Session: E2eeV2Session | null;
  groupMasterKey?: ArrayBuffer | null;
  e2eKeys?: DerivedKeys | null;
};

/** Text encrypted with the conversation's current scheme, and the v2 fields its row carries. */
export async function encryptChatText(
  chatId: string,
  content: string,
  { v2Session, groupMasterKey, e2eKeys }: ChatTextKeys,
  clientMessageId?: string,
): Promise<{ wireContent: string; v2Metadata: Record<string, unknown> | null }> {
  if (v2Session) {
    const v2 = await encryptWebE2eeV2Message(v2Session, chatId, content, clientMessageId);
    return { wireContent: v2.wireContent, v2Metadata: v2.metadata };
  }
  const wireContent = groupMasterKey
    ? await encryptGroupMessageContent(content, groupMasterKey)
    : e2eKeys
      ? await encryptContent(content, e2eKeys)
      : content;
  return { wireContent, v2Metadata: null };
}

/**
 * `POST /api/chat/messages` with the keys at hand (no re-check round trips first). The server
 * validates the epoch, so if they went stale the session is re-read and the body sent once more.
 * `build(staleOk)` encrypts the body; it runs again for the retry.
 */
export async function postChatText(
  chatId: string,
  headers: HeadersInit,
  build: (staleOk: boolean) => Promise<Record<string, unknown>>,
): Promise<Response> {
  const post = async (staleOk: boolean) =>
    fetch('/api/chat/messages', { method: 'POST', headers, body: JSON.stringify(await build(staleOk)) });
  const res = await post(true);
  if (res.ok || (res.status !== 400 && res.status !== 409)) return res;
  const { code } = (await res.clone().json().catch(() => ({}))) as { code?: unknown };
  if (code !== 'E2EE_V2_INVALID' && code !== 'E2EE_V2_REQUIRED') return res;
  invalidateWebE2eeV2Session(chatId);
  return post(false);
}

/**
 * Sends one encrypted text into your 1-1 chat with a connection from outside the thread (a drop
 * reply from Home), exactly as the thread would. Throws if it can't be sent.
 */
export async function sendDirectText({
  connectionId,
  viewerId,
  peerId,
  content,
  metadata,
}: {
  connectionId: string;
  viewerId: string;
  peerId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const headers = await getFreshAuthHeaders();
  const chatRes = await fetch(`/api/chat?connectionId=${encodeURIComponent(connectionId)}`, { headers });
  const chatId = ((await chatRes.json().catch(() => ({}))) as { chat?: { id?: unknown } }).chat?.id;
  if (!chatRes.ok || typeof chatId !== 'string') throw new Error('Couldn’t open that chat.');

  const participantUserIds = [viewerId, peerId];
  const sentAt = Date.now();
  const res = await postChatText(chatId, headers, async (staleOk) => {
    const v2Session = await resolveWebE2eeV2Session({
      chatId,
      participantUserIds,
      getAuthHeaders: getFreshAuthHeaders,
      allowUpgrade: true,
      forceRefresh: true,
      staleWhileRevalidate: staleOk,
    });
    const e2eKeys = v2Session ? null : await deriveKeysForConnection(connectionId, participantUserIds);
    const { wireContent, v2Metadata } = await encryptChatText(chatId, content, { v2Session, e2eKeys });
    return {
      chatId,
      connectionId,
      content: wireContent,
      local_sent_at: sentAt,
      metadata: { ...(metadata ?? {}), ...(v2Metadata ?? {}) },
    };
  });
  if (!res.ok) throw new Error('Couldn’t send it. Try again.');
}
