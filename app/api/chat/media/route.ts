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

const CHAT_MEDIA_BUCKET = 'chat-media';

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const chatId = String(form.get('chat_id') ?? form.get('chatId') ?? '').trim();
  const objectPath = String(form.get('object_path') ?? form.get('objectPath') ?? '').trim();
  const file = form.get('file');

  if (!chatId) {
    return NextResponse.json({ error: 'chat_id is required' }, { status: 400 });
  }
  if (!objectPath) {
    return NextResponse.json({ error: 'object_path is required' }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
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

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }

  const declaredType = typeof form.get('mime_type') === 'string' ? String(form.get('mime_type')).trim() : '';
  const contentType =
    declaredType.length > 0 ? declaredType : 'application/octet-stream';

  const { error: uploadError } = await admin.storage.from(CHAT_MEDIA_BUCKET).upload(objectPath, buffer, {
    contentType,
    upsert: true,
  });

  if (uploadError) {
    console.error('[chat/media] upload:', uploadError.message);
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  return NextResponse.json({ path: objectPath }, { status: 201 });
}
