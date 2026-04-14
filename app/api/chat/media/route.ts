/**
 * POST /api/chat/media
 * multipart/form-data: chat_id (uuid), object_path (relative storage path), file (opaque ciphertext bytes)
 *
 * Verifies JWT and chat write access, then uploads with the service role (opaque bytes — no decryption).
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

function formBlobEntry(value: FormDataEntryValue | null): Blob | null {
  if (value == null) return null;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBearerUser(request);
    if (!auth.ok) return auth.response;

    let form: FormData;
    try {
      form = await request.formData();
    } catch (parseErr) {
      const e = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
      console.error('[chat/media] formData parse failed', {
        message: e.message,
        stack: e.stack,
        name: e.name,
        cause: e.cause,
      });
      return NextResponse.json({ error: 'Expected valid multipart/form-data' }, { status: 400 });
    }

    const chatId = String(form.get('chat_id') ?? form.get('chatId') ?? '').trim();
    const objectPath = String(form.get('object_path') ?? form.get('objectPath') ?? '').trim();
    const file = formBlobEntry(form.get('file'));

    if (!chatId) {
      return NextResponse.json({ error: 'chat_id is required' }, { status: 400 });
    }
    if (!objectPath) {
      return NextResponse.json({ error: 'object_path is required' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json(
        { error: 'file is required (must be a Blob/File part with a filename)' },
        { status: 400 },
      );
    }

    const admin = createChatGatekeeperAdmin();
    const denied = await assertChatWritable(admin, auth.user.id, chatId);
    if (denied) return denied;

    const firstSeg = objectPath.split('/')[0]?.trim();
    if (firstSeg !== auth.user.id) {
      return NextResponse.json({ error: 'object_path must start with the authenticated user id' }, { status: 403 });
    }
    const secondSeg = objectPath.split('/')[1]?.trim();
    if (secondSeg?.toLowerCase() !== chatId.toLowerCase()) {
      return NextResponse.json({ error: 'object_path must include chat_id as the second segment' }, { status: 403 });
    }

    let buffer: Buffer;
    try {
      const ab = await file.arrayBuffer();
      buffer = Buffer.from(ab);
    } catch (bufErr) {
      const e = bufErr instanceof Error ? bufErr : new Error(String(bufErr));
      console.error('[chat/media] file.arrayBuffer failed', {
        message: e.message,
        stack: e.stack,
        name: e.name,
        cause: e.cause,
        fileSize: typeof (file as File).size === 'number' ? (file as File).size : undefined,
        fileType: file.type,
      });
      return NextResponse.json({ error: 'Failed to read uploaded file bytes' }, { status: 400 });
    }

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }

    // Opaque E2EE ciphertext — always store as binary (declared image/* from client is not meaningful here).
    const contentType = 'application/octet-stream';

    const { error: uploadError } = await admin.storage.from(CHAT_MEDIA_BUCKET).upload(objectPath, buffer, {
      contentType,
      upsert: true,
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

    return NextResponse.json({ path: objectPath }, { status: 201 });
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
