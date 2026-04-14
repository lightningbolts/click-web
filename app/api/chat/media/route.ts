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

export const maxDuration = 60;
export const runtime = 'nodejs';

const CHAT_MEDIA_BUCKET = 'chat-media';

interface ChatMediaUploadBody {
  chat_id: string;
  mime_type: string;
  file_b64: string;
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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBearerUser(request);
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseErr) {
      const e = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
      console.error('[chat/media] json parse failed', {
        message: e.message,
        stack: e.stack,
        name: e.name,
        cause: e.cause,
      });
      return NextResponse.json({ error: 'Expected valid application/json body' }, { status: 400 });
    }

    const parsed = body as Partial<ChatMediaUploadBody> | null;
    const chatId = typeof parsed?.chat_id === 'string' ? parsed.chat_id.trim() : '';
    const mimeType =
      typeof parsed?.mime_type === 'string' && parsed.mime_type.trim().length > 0
        ? parsed.mime_type.trim()
        : 'application/octet-stream';
    const fileB64Raw = typeof parsed?.file_b64 === 'string' ? parsed.file_b64 : '';
    const fileB64 = stripDataUriPrefix(fileB64Raw);

    if (!chatId) {
      return NextResponse.json({ error: 'chat_id is required' }, { status: 400 });
    }
    if (!fileB64) {
      return NextResponse.json({ error: 'file_b64 is required' }, { status: 400 });
    }

    const admin = createChatGatekeeperAdmin();
    const denied = await assertChatWritable(admin, auth.user.id, chatId);
    if (denied) return denied;

    const ext = extForMime(mimeType);
    const objectPath = `${auth.user.id}/${chatId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileB64, 'base64');
    } catch (bufErr) {
      const e = bufErr instanceof Error ? bufErr : new Error(String(bufErr));
      console.error('[chat/media] base64 decode failed', {
        message: e.message,
        stack: e.stack,
        name: e.name,
        cause: e.cause,
      });
      return NextResponse.json({ error: 'Failed to decode file_b64 bytes' }, { status: 400 });
    }

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Empty or invalid file_b64 payload' }, { status: 400 });
    }

    // Opaque E2EE ciphertext may be wrapped from media bytes; keep caller-declared mime for extension/content-type consistency.
    const contentType = mimeType;

    const { error: uploadError } = await admin.storage.from(CHAT_MEDIA_BUCKET).upload(objectPath, buffer, {
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

    const { data: pub } = admin.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(objectPath);

    return NextResponse.json({ url: pub.publicUrl, path: objectPath }, { status: 201 });
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
