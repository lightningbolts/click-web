/**
 * POST /api/chat/media
 * application/json: { chat_id, mime_type, file_b64 }
 *
 * Verifies JWT and chat write access, then uploads with the service role (opaque bytes, no decryption).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { chatMediaBodySchema } from '@/lib/api/schemas/chat';
import {
  assertE2eeV2MediaUpload,
  messageBodyV2Field,
} from '@/lib/server/e2eeV2Gate';
import { createHash } from 'node:crypto';

export const maxDuration = 60;
export const runtime = 'nodejs';

const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_MEDIA_BASE64_CHARS = Math.ceil(MAX_MEDIA_BYTES / 3) * 4 + 4;

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

function mediaFilename(mimeType: string): string {
  return `media.${extForMime(mimeType)}`;
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('heic')) return 'heic';
  if (m.includes('heif')) return 'heif';
  if (m.includes('aac') || m.includes('m4a') || m.includes('mp4')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'bin';
}

function stripDataUriPrefix(raw: string): string {
  const trimmed = raw.trim();
  const marker = 'base64,';
  const idx = trimmed.toLowerCase().indexOf(marker);
  if (idx >= 0) {
    return trimmed.slice(idx + marker.length).trim();
  }
  return trimmed;
}

function isStrictBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value) &&
    !value.slice(0, -2).includes('=');
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBearerUser(request);
    if (!auth.ok) return auth.response;

    const parsedBody = await parseBody(request, chatMediaBodySchema);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = parsedBody.data;
    const chatId = parsed.chat_id.trim();
    const mimeType =
      typeof parsed.mime_type === 'string' && parsed.mime_type.trim().length > 0
        ? parsed.mime_type.trim()
        : 'application/octet-stream';
    const fileB64Raw = parsed.file_b64;
    const fileB64 = stripDataUriPrefix(fileB64Raw);
    const bodyRecord = parsed as unknown as Record<string, unknown>;

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_BASE64_CHARS * 2) {
      return NextResponse.json({ error: 'Media payload exceeds 25 MiB limit' }, { status: 413 });
    }

    if (!fileB64) {
      return NextResponse.json({ error: 'file_b64 is required' }, { status: 400 });
    }

    const admin = createChatGatekeeperAdmin();
    const denied = await assertChatWritable(admin, auth.user.id, chatId);
    if (denied) return denied;

    const v2 = v2EnvelopeAndMetadata(bodyRecord);
    const mediaDigest = messageBodyV2Field(bodyRecord, 'media_ciphertext_sha256', 'mediaCiphertextSha256', v2.metadata);
    if (fileB64.length > MAX_MEDIA_BASE64_CHARS || !isStrictBase64(fileB64)) {
      return NextResponse.json({ error: 'Invalid or oversized file_b64 payload' }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileB64, 'base64');
    } catch {
      return NextResponse.json({ error: 'Failed to decode file_b64 bytes' }, { status: 400 });
    }
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Empty or invalid file_b64 payload' }, { status: 400 });
    }
    if (buffer.length > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: 'Media payload exceeds 25 MiB limit' }, { status: 413 });
    }

    const computedDigest = createHash('sha256').update(buffer).digest('base64');
    const v2Gate = await assertE2eeV2MediaUpload(admin, {
      chatId,
      userId: auth.user.id,
      content: v2.envelope,
      mediaCiphertextSha256: mediaDigest ?? computedDigest,
    });
    if (!v2Gate.ok) return v2Gate.response;

    const objectPath = `${chatId}/${auth.user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${mediaFilename(mimeType)}`;

    if (v2Gate.currentEpoch !== null && computedDigest !== v2Gate.envelope.mediaCiphertextSha256) {
      return NextResponse.json({ error: 'Uploaded bytes do not match the E2EE v2 authorization envelope' }, { status: 400 });
    }

    // Opaque E2EE ciphertext may be wrapped from media bytes; keep caller-declared mime for extension/content-type consistency.
    const contentType = mimeType;

    const { error: uploadError } = await admin.storage.from(CHAT_ATTACHMENTS_BUCKET).upload(objectPath, buffer, {
      contentType,
      upsert: false,
    });

    if (uploadError) {
      console.error('[chat/media] Supabase storage upload failed', {
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
      console.error('[chat/media] signed url creation failed', {
        message: signedError.message,
        objectPath,
      });
      return NextResponse.json({ error: signedError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        url: signed?.signedUrl ?? null,
        path: objectPath,
        ttl_seconds: SIGNED_URL_TTL_SECONDS,
      },
      { status: 201 },
    );
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error('[chat/media] POST unhandled error', {
      message: e.message,
      stack: e.stack,
      name: e.name,
      cause: e.cause,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
