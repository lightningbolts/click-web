/**
 * Helpers for uploading encrypted attachments to the private `chat-attachments` bucket
 * via the Next.js gatekeeper (`/api/chat/attachments`).
 *
 * The bucket is RLS-private, so we do NOT use the browser Supabase client directly here.
 * The server verifies JWT + participant membership, then writes under
 *   `{chat_uuid}/{uploader_uid}/{filename}`
 * so the Storage RLS policies from `chat_attachments_storage.sql` accept the INSERT.
 */

/** Matches KMP `ChatMediaConstants.CHAT_ATTACHMENTS_BUCKET`. */
export const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';

export interface ChatAttachmentUploadResult {
  /** Canonical object path inside the bucket (stored in the envelope). */
  path: string;
  /** Short-lived signed URL (ok to use immediately for preview; do not persist). */
  url: string | null;
  /** Lifetime of `url` in seconds. */
  ttlSeconds: number;
}

/**
 * Upload already-encrypted bytes for a chat attachment. The caller encrypts plaintext with a
 * per-file master key (see `encryptFileBytes`) and hands the ciphertext to this function; the
 * server stores it opaquely.
 *
 * @param chatId UUID of the chat the attachment belongs to; the path starts with this segment.
 * @param ciphertext `IV || HMAC || ciphertext` produced by `encryptFileBytes`.
 * @param mimeType Canonical plaintext MIME type (used for the Storage `content_type` only).
 * @param fileName Original filename — the server sanitises it before building the path.
 * @param getAuthHeaders Headers factory returning the `Authorization: Bearer …` tuple.
 */
export async function uploadChatAttachmentBlob(
  chatId: string,
  ciphertext: Uint8Array,
  mimeType: string,
  fileName: string,
  getAuthHeaders: () => Promise<HeadersInit>,
): Promise<ChatAttachmentUploadResult> {
  if (!chatId || !chatId.trim()) {
    throw new Error('chatId is required for chat attachment upload');
  }
  if (ciphertext.byteLength === 0) {
    throw new Error('Refusing to upload empty ciphertext');
  }

  const base64 = bytesToBase64(ciphertext);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...Object.fromEntries(new Headers(await getAuthHeaders()).entries()),
  };

  const res = await fetch('/api/chat/attachments', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      chat_id: chatId,
      mime_type: mimeType || 'application/octet-stream',
      file_name: fileName,
      file_b64: base64,
    }),
  });

  if (!res.ok) {
    const detail = await safeReadErr(res);
    throw new Error(`Attachment upload failed (${res.status}): ${detail}`);
  }

  const payload = (await res.json()) as {
    path?: unknown;
    url?: unknown;
    ttl_seconds?: unknown;
  };
  const path = typeof payload.path === 'string' ? payload.path : '';
  if (!path) {
    throw new Error('Attachment upload response missing path');
  }
  return {
    path,
    url: typeof payload.url === 'string' ? payload.url : null,
    ttlSeconds: typeof payload.ttl_seconds === 'number' ? payload.ttl_seconds : 0,
  };
}

/** Mint a fresh signed URL for an existing attachment path (used when opening old messages). */
export async function signChatAttachmentUrl(
  path: string,
  getAuthHeaders: () => Promise<HeadersInit>,
): Promise<string> {
  if (!path || !path.trim()) throw new Error('path is required');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...Object.fromEntries(new Headers(await getAuthHeaders()).entries()),
  };
  const res = await fetch('/api/chat/attachments/sign', {
    method: 'POST',
    headers,
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const detail = await safeReadErr(res);
    throw new Error(`Attachment sign failed (${res.status}): ${detail}`);
  }
  const payload = (await res.json()) as { url?: unknown };
  if (typeof payload.url !== 'string' || !payload.url) {
    throw new Error('Attachment sign response missing url');
  }
  return payload.url;
}

/** Download the ciphertext bytes for a signed attachment URL. */
export async function downloadAttachmentCiphertext(signedUrl: string): Promise<Uint8Array> {
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new Error(`Attachment download failed (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked to avoid RangeError on very large strings in some JS engines.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function safeReadErr(res: Response): Promise<string> {
  try {
    const txt = await res.text();
    return txt.slice(0, 400);
  } catch {
    return res.statusText;
  }
}
