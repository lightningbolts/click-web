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
import { parseBody } from '@/lib/api/parseBody';
import { chatAttachmentBodySchema } from '@/lib/api/schemas/chat';
import {
  assertE2eeV2MediaUpload,
  messageBodyV2Field,
} from '@/lib/server/e2eeV2Gate';
import { createHash } from 'node:crypto';

export const maxDuration = 60;
export const runtime = 'nodejs';

const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';
/** Matches `ChatAttachmentValidator.MAX_ATTACHMENT_BYTES` (KMP) and `MAX_ATTACHMENT_BYTES` (web). */
const MAX_PLAINTEXT_BYTES = 2 * 1024 * 1024;
/** Modest ciphertext overhead budget: IV(16) + HMAC(32) + AES-CBC padding. 256 bytes is generous. */
const MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + 256;
const MAX_BASE64_CHARS = Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4 + 4;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string') as string | undefined;
}

function v2EnvelopeAndMetadata(body: Record<string, unknown>): {
  envelope: string;
  metadata: Record<string, unknown>;
} {
  const bodyMetadata = isRecord(body.metadata) ? body.metadata : {};
  const nestedV2 = isRecord(body.e2ee_v2)
    ? body.e2ee_v2
    : isRecord(body.e2eeV2)
      ? body.e2eeV2
      : {};
  const metadata = { ...nestedV2, ...bodyMetadata };
  return {
    envelope:
      readString(
        body.e2ee_v2_envelope,
        body.e2eeV2Envelope,
        body.envelope,
        body.content,
        nestedV2.envelope,
        nestedV2.content,
        bodyMetadata.e2ee_v2_envelope,
        bodyMetadata.e2eeV2Envelope,
        bodyMetadata.envelope,
        bodyMetadata.content,
      ) ?? '',
    metadata,
  };
}

function stripDataUriPrefix(raw: string): string {
  const trimmed = raw.trim();
  const marker = 'base64,';
  const idx = trimmed.toLowerCase().indexOf(marker);
  if (idx >= 0) return trimmed.slice(idx + marker.length).trim();
  return trimmed;
}

function isStrictBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value) &&
    !value.slice(0, -2).includes('=');
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

    const parsedBody = await parseBody(request, chatAttachmentBodySchema);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = parsedBody.data;
    const chatId = parsed.chat_id.trim();
    const rawMime = typeof parsed.mime_type === 'string' ? parsed.mime_type.trim().toLowerCase() : '';
    const mimeType = rawMime.length > 0 ? rawMime : 'application/octet-stream';
    const rawName = typeof parsed.file_name === 'string' ? parsed.file_name : '';
    const fileB64Raw = parsed.file_b64;
    const fileB64 = stripDataUriPrefix(fileB64Raw);
    const bodyRecord = parsed as unknown as Record<string, unknown>;

    if (!fileB64) {
      return NextResponse.json({ error: 'file_b64 is required' }, { status: 400 });
    }
    if (!rawName.trim()) {
      return NextResponse.json({ error: 'file_name is required' }, { status: 400 });
    }
    if (fileB64.length > MAX_BASE64_CHARS || !isStrictBase64(fileB64)) {
      return NextResponse.json({ error: 'Invalid or oversized file_b64 payload' }, { status: 400 });
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

    const v2 = v2EnvelopeAndMetadata(bodyRecord);
    const mediaDigest = messageBodyV2Field(bodyRecord, 'media_ciphertext_sha256', 'mediaCiphertextSha256', v2.metadata);
    const v2Gate = await assertE2eeV2MediaUpload(admin, {
      chatId,
      userId: auth.user.id,
      content: v2.envelope,
      mediaCiphertextSha256: mediaDigest,
    });
    if (!v2Gate.ok) return v2Gate.response;

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
    if (v2Gate.currentEpoch !== null) {
      const computedDigest = createHash('sha256').update(buffer).digest('base64');
      if (computedDigest !== v2Gate.envelope.mediaCiphertextSha256) {
        return NextResponse.json(
          { error: 'Uploaded bytes do not match the E2EE v2 authorization envelope' },
          { status: 400 },
        );
      }
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
