/**
 * POST /api/chat/attachments
 * application/json: { chat_id, mime_type, file_name, file_b64 }
 *
 * Gatekeeper for the private `chat-attachments` bucket (Phase 2 — B3). Verifies JWT + chat
 * write access, then uploads the caller-supplied ciphertext under
 *   `{chat_uuid}/{uploader_uid}/{safe_filename}`
 * so the Storage RLS policies accept the INSERT. The bucket is PRIVATE — we return a
 * short-lived signed URL for the uploader to share via the E2EE envelope.
 *
 * Bytes are already ciphertext (per-file AES-256-CBC + HMAC-SHA256 from the client); the
 * server never touches plaintext or the per-file master key.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';

export const maxDuration = 60;
export const runtime = 'nodejs';

const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';
/** Matches `ChatAttachmentValidator.MAX_ATTACHMENT_BYTES` (KMP) and `MAX_ATTACHMENT_BYTES` (web). */
const MAX_PLAINTEXT_BYTES = 2 * 1024 * 1024;
/** Modest ciphertext overhead budget: IV(16) + HMAC(32) + AES-CBC padding. 256 bytes is generous. */
const MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + 256;
/** Signed URLs expire after 1 hour — enough for receivers to download + decrypt without long-lived exposure. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'video/quicktime',
  'video/mp4',
  'application/zip',
  'application/x-zip-compressed',
  'text/csv',
  'application/csv',
]);

interface ChatAttachmentUploadBody {
  chat_id: string;
  mime_type: string;
  file_name: string;
  file_b64: string;
}

function stripDataUriPrefix(raw: string): string {
  const trimmed = raw.trim();
  const marker = 'base64,';
  const idx = trimmed.toLowerCase().indexOf(marker);
  if (idx >= 0) return trimmed.slice(idx + marker.length).trim();
  return trimmed;
}

/**
 * Collapse the filename down to a Storage-safe slug while keeping the original extension so
 * receivers can render the correct icon. Storage path never exposes PII or arbitrary user text.
 */
function sanitizeFilename(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'attachment.bin';
  const lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const base = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1) : '';
  const cleanStem = stem.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'attachment';
  const cleanExt = ext.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase().slice(0, 8);
  return cleanExt.length > 0 ? `${cleanStem}.${cleanExt}` : cleanStem;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBearerUser(request);
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseErr) {
      const e = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
      console.error('[chat/attachments] json parse failed', { message: e.message, name: e.name });
      return NextResponse.json({ error: 'Expected valid application/json body' }, { status: 400 });
    }

    const parsed = body as Partial<ChatAttachmentUploadBody> | null;
    const chatId = typeof parsed?.chat_id === 'string' ? parsed.chat_id.trim() : '';
    const rawMime = typeof parsed?.mime_type === 'string' ? parsed.mime_type.trim().toLowerCase() : '';
    const mimeType = rawMime.length > 0 ? rawMime : 'application/octet-stream';
    const rawName = typeof parsed?.file_name === 'string' ? parsed.file_name : '';
    const fileB64Raw = typeof parsed?.file_b64 === 'string' ? parsed.file_b64 : '';
    const fileB64 = stripDataUriPrefix(fileB64Raw);

    if (!chatId) {
      return NextResponse.json({ error: 'chat_id is required' }, { status: 400 });
    }
    if (!fileB64) {
      return NextResponse.json({ error: 'file_b64 is required' }, { status: 400 });
    }
    if (!rawName.trim()) {
      return NextResponse.json({ error: 'file_name is required' }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `MIME type ${mimeType} is not permitted for chat attachments` },
        { status: 400 },
      );
    }

    const admin = createChatGatekeeperAdmin();
    const denied = await assertChatWritable(admin, auth.user.id, chatId);
    if (denied) return denied;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileB64, 'base64');
    } catch (bufErr) {
      const e = bufErr instanceof Error ? bufErr : new Error(String(bufErr));
      console.error('[chat/attachments] base64 decode failed', { message: e.message, name: e.name });
      return NextResponse.json({ error: 'Failed to decode file_b64 bytes' }, { status: 400 });
    }
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Empty file_b64 payload' }, { status: 400 });
    }
    if (buffer.length > MAX_CIPHERTEXT_BYTES) {
      return NextResponse.json(
        { error: 'Attachment ciphertext exceeds 2 MiB + envelope overhead' },
        { status: 413 },
      );
    }

    const safeName = sanitizeFilename(rawName);
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const objectPath = `${chatId}/${auth.user.id}/${stamp}-${safeName}`;

    const { error: uploadError } = await admin.storage
      .from(CHAT_ATTACHMENTS_BUCKET)
      .upload(objectPath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[chat/attachments] Supabase storage upload failed', {
        message: uploadError.message,
        name: uploadError.name,
        objectPath,
        chatId,
        byteLength: buffer.length,
      });
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from(CHAT_ATTACHMENTS_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
    if (signedError) {
      console.error('[chat/attachments] signed url creation failed', {
        message: signedError.message,
        objectPath,
      });
      return NextResponse.json({ error: signedError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        path: objectPath,
        url: signed?.signedUrl ?? null,
        ttl_seconds: SIGNED_URL_TTL_SECONDS,
      },
      { status: 201 },
    );
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error('[chat/attachments] POST unhandled error', {
      message: e.message,
      stack: e.stack,
      name: e.name,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
