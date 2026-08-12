/**
 * POST /api/chat/attachments/sign
 * application/json: { path }
 *
 * Mints a fresh short-lived signed URL for an existing `chat-attachments` object. Gated by
 * JWT + chat participant membership (segment 1 of the path is the chat UUID). Keeps signed
 * URLs out of the permanent message envelope so old messages stay readable without leaving
 * long-lived public-ish URLs in the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';
import { parseBody } from '@/lib/api/parseBody';
import { chatAttachmentSignBodySchema } from '@/lib/api/schemas/chat';

export const maxDuration = 30;
export const runtime = 'nodejs';

const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes — just enough to download

const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBearerUser(request);
    if (!auth.ok) return auth.response;

    const parsedBody = await parseBody(request, chatAttachmentSignBodySchema);
    if (!parsedBody.ok) return parsedBody.response;

    const path = parsedBody.data.path.trim();
    if (path.includes('..') || path.startsWith('/')) {
      return NextResponse.json({ error: 'Invalid attachment path' }, { status: 400 });
    }

    const segments = path.split('/');
    if (segments.length < 3) {
      return NextResponse.json({ error: 'Invalid attachment path layout' }, { status: 400 });
    }
    const chatId = segments[0];
    if (!UUID_REGEX.test(chatId)) {
      return NextResponse.json({ error: 'Invalid chat segment in path' }, { status: 400 });
    }

    const admin = createChatGatekeeperAdmin();
    const denied = await assertChatWritable(admin, auth.user.id, chatId);
    if (denied) return denied;

    const { data, error } = await admin.storage
      .from(CHAT_ATTACHMENTS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.error('[chat/attachments/sign] signed url creation failed', {
        message: error.message,
        path,
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ url: data?.signedUrl ?? null, ttl_seconds: SIGNED_URL_TTL_SECONDS });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error('[chat/attachments/sign] POST unhandled error', {
      message: e.message,
      stack: e.stack,
      name: e.name,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
