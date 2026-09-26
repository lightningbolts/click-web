import { NextRequest, NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { buildMessageInsertRow, parseLocalSentAtMs } from '@/lib/chat/messages';
import type { MessageType } from '@/lib/chat/types';
import {
  assertChatWritable,
  createChatGatekeeperAdmin,
  requireBearerUser,
} from '@/lib/server/chatGatekeeper';
import { isActiveChatListStatus, normalizeConnectionStatus } from '@/lib/dashboard/connectionStatus';
import { runtimeEnv } from '@/lib/server/runtimeEnv';
import { parseBody } from '@/lib/api/parseBody';
import { runAfterResponse } from '@/lib/server/afterResponse';
import { cronPushBearer, pushFunctionUrl } from '@/lib/server/cronAuth';
import { chatMessagePostBodySchema } from '@/lib/api/schemas/chat';
import {
  assertE2eeV2MessageWrite,
  assertE2eeV2MediaMessageWrite,
  messageBodyV2Field,
} from '@/lib/server/e2eeV2Gate';

/** A validated message, ready to insert now or at its scheduled time. */
export type PreparedChatMessage = {
  chatId: string;
  userId: string;
  /** The sender's JWT (push authorization for an immediate send). */
  bearer: string;
  content: string;
  messageType: MessageType;
  metadata: unknown;
  localSentAtMs: number | null;
  body: Record<string, unknown>;
};

const CHAT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function chatPushFunctionUrl(): string | null {
  const base = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  return base ? `${base}/functions/v1/send-push-notification` : null;
}

async function notifyChatMessagePush(token: string | null, chatId: string, messageId: string, senderUserId: string) {
  const pushFunctionUrl = chatPushFunctionUrl();
  if (!token || !pushFunctionUrl) return;

  const response = await fetch(pushFunctionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'chat_message',
        chat_id: chatId,
        message_id: messageId,
        sender_user_id: senderUserId,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`send-push-notification returned ${response.status}: ${errorText}`);
  }
}

async function getOrCreateChatAdmin(admin: SupabaseClient, connectionId: string) {
  const { data: existing, error: findErr } = await admin
    .from('chats')
    .select('*')
    .eq('connection_id', connectionId)
    .limit(1)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) return existing;

  const now = Date.now();
  const { data: created, error: createErr } = await admin
    .from('chats')
    .insert({ connection_id: connectionId, created_at: now, updated_at: now })
    .select()
    .single();

  if (createErr) throw createErr;
  return created;
}

function parsePostMessageType(raw: unknown): MessageType {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'call_log') return 'call_log';
  if (s === 'beacon') return 'beacon';
  if (s === 'image') return 'image';
  if (s === 'audio') return 'audio';
  if (s === 'file') return 'file';
  return 'text';
}

/**
 * Everything `POST /api/chat/messages` checks before writing: body, sender, chat access
 * (resolving a connection to its chat) and the E2EE v2 gates. Shared by sending now and
 * scheduling, so a scheduled message is exactly as valid as a sent one.
 */
export async function prepareChatMessageWrite(req: NextRequest): Promise<NextResponse | PreparedChatMessage> {
  const parsed = await parseBody(req, chatMessagePostBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const chatId = typeof body.chat_id === 'string' ? body.chat_id : '';
  const connectionId = typeof body.connection_id === 'string' ? body.connection_id : '';
  const { content, metadata } = body;
  const rawMessageType =
    (body as Record<string, unknown>).message_type ??
    (body as Record<string, unknown>).messageType;
  let messageType = parsePostMessageType(rawMessageType);
  const meta =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  // Infer beacon when clients send structured beacon metadata under message_type=text.
  if (
    messageType === 'text' &&
    (typeof meta.beacon_id === 'string' || typeof meta.beaconId === 'string')
  ) {
    messageType = 'beacon';
  }
  const isCallLog = messageType === 'call_log';
  const isBeacon = messageType === 'beacon';
  const isMedia = messageType === 'image' || messageType === 'audio';

  if (!chatId && !connectionId) {
    return NextResponse.json({ error: 'chatId or connectionId is required' }, { status: 400 });
  }

  const mediaUrl = typeof meta.media_url === 'string' ? meta.media_url.trim() : '';
  const isV2Content = typeof content === 'string' && content.startsWith('e2e2:');

  if (isCallLog || isBeacon) {
    // call_log / beacon rows may use empty or short plaintext content + metadata
  } else if (isMedia) {
    if (!mediaUrl && !isV2Content) {
      return NextResponse.json(
        { error: 'metadata.media_url is required for image and audio messages' },
        { status: 400 },
      );
    }
  } else {
    const c = typeof content === 'string' ? content : '';
    if (!c.trim()) {
      return NextResponse.json({ error: 'chatId or connectionId and content are required' }, { status: 400 });
    }
  }

  const jwt = await requireBearerUser(req);
  if (!jwt.ok) return jwt.response;
  const { user, bearer: token } = jwt;

  try {
    const admin = createChatGatekeeperAdmin();
    let resolvedChatId: string | null = null;
    const trimmedChatId = chatId.trim();
    const trimmedConnectionId = connectionId.trim();

    // Reject optimistic/temp client ids (e.g. temp-…) — fall through to connection_id.
    // If a UUID chat_id is stale/missing, also fall through when connection_id is present
    // (avoids "Chat not found" while the user is already inside the thread).
    if (trimmedChatId && CHAT_UUID_RE.test(trimmedChatId)) {
      const denied = await assertChatWritable(admin, user.id, trimmedChatId);
      if (!denied) {
        resolvedChatId = trimmedChatId;
      } else if (!trimmedConnectionId) {
        return denied;
      } else if (denied.status !== 404) {
        return denied;
      }
    }

    if (!resolvedChatId && trimmedConnectionId) {
      const { data: conn, error: connErr } = await admin
        .from('connections')
        .select('id, user_ids, status, expiry_state')
        .eq('id', trimmedConnectionId)
        .maybeSingle();

      if (connErr) throw connErr;
      const ids =
        (conn?.user_ids as string[] | null)?.map((id) => id.trim()).filter((id) => id.length > 0) ?? [];
      if (!conn || !ids.includes(user.id)) {
        return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
      }
      const st = normalizeConnectionStatus(conn as Record<string, unknown>);
      if (!isActiveChatListStatus(st)) {
        return NextResponse.json({ error: 'Connection not active for chat' }, { status: 403 });
      }

      const chat = await getOrCreateChatAdmin(admin, trimmedConnectionId);
      resolvedChatId = chat.id as string;
    }

    if (!resolvedChatId) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    const bodyRecord = body as Record<string, unknown>;
    const v2Gate = await assertE2eeV2MessageWrite(admin, {
      chatId: resolvedChatId,
      requestedChatId: trimmedChatId || undefined,
      userId: user.id,
      content,
      epoch: messageBodyV2Field(bodyRecord, 'epoch', 'epoch', meta),
      senderDeviceId: messageBodyV2Field(bodyRecord, 'sender_device_id', 'senderDeviceId', meta),
      clientMessageId: messageBodyV2Field(bodyRecord, 'client_message_id', 'clientMessageId', meta),
      allowLegacy: isCallLog || isBeacon,
    });
    if (!v2Gate.ok) return v2Gate.response;
    if (isV2Content && (isMedia || messageType === 'file')) {
      if (!v2Gate.envelope) return NextResponse.json({ error: 'Invalid E2EE v2 message envelope' }, { status: 400 });
      const mediaMessageGate = assertE2eeV2MediaMessageWrite({
        chatId: resolvedChatId,
        userId: user.id,
        messageEnvelope: v2Gate.envelope,
        metadata: meta,
      });
      if (!mediaMessageGate.ok) return mediaMessageGate.response;
    }

    const localSentAtMs = parseLocalSentAtMs(
      (body as Record<string, unknown>).local_sent_at ?? (body as Record<string, unknown>).localSentAt,
    );
    const rawContent = typeof content === 'string' ? content : '';
    const wireContent = rawContent.startsWith('e2e:')
      ? rawContent
      : isCallLog
        ? rawContent
        : isMedia
          ? rawContent.trim()
          : rawContent.trim();

    return {
      chatId: resolvedChatId,
      userId: user.id,
      bearer: token,
      content: wireContent,
      messageType,
      metadata,
      localSentAtMs,
      body: bodyRecord,
    };
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to send message' }, { status: 500 });
  }
}

/** Call logs and encrypted media don't push (encrypted media pushes from its own upload path). */
function skipsPush(messageType: MessageType, metadata: unknown): boolean {
  if (messageType === 'call_log') return true;
  const meta = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const isMedia = messageType === 'image' || messageType === 'audio';
  return isMedia && (meta.is_encrypted_media === true || meta.is_encrypted_media === 'true');
}

/**
 * Group messages: one push per other member (the push function's user path only knows
 * one-to-one chats). The service path attaches the ciphertext, which the iOS extension
 * decrypts for the preview; the group's name rides along as the subtitle.
 */
async function notifyGroupMessagePush(
  admin: SupabaseClient,
  groupId: string,
  chatId: string,
  messageId: string,
  senderUserId: string,
  messageType: MessageType,
) {
  const url = pushFunctionUrl();
  const bearer = cronPushBearer();
  if (!url || !bearer) return;
  const [{ data: members }, { data: group }, { data: sender }] = await Promise.all([
    admin.from('group_members').select('user_id').eq('group_id', groupId),
    admin.from('groups').select('name').eq('id', groupId).maybeSingle(),
    admin.from('users').select('first_name, name').eq('id', senderUserId).maybeSingle(),
  ]);
  const groupName = (group as { name?: string | null } | null)?.name?.trim() || 'Group';
  const senderRow = sender as { first_name?: string | null; name?: string | null } | null;
  const senderName = senderRow?.first_name?.trim() || senderRow?.name?.trim() || 'Someone';
  const recipients = ((members ?? []) as Array<{ user_id: string }>).map((row) => row.user_id).filter((id) => id !== senderUserId);
  await Promise.all(
    recipients.map(async (recipientUserId) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_user_id: recipientUserId,
          title: `${senderName} in ${groupName}`,
          body: 'New message',
          data: {
            type: 'chat_message',
            chat_id: chatId,
            message_id: messageId,
            sender_user_id: senderUserId,
            group_id: groupId,
            group_name: groupName,
            message_type: messageType,
          },
        }),
      });
      if (!response.ok) console.warn('Group push failed', { chatId, recipientUserId, status: response.status });
    }),
  );
}

/** Inserts the message at `now`, bumps the chat, and pushes after the response (failures are logged only). */
export async function insertChatMessage(
  admin: SupabaseClient,
  m: Omit<PreparedChatMessage, 'bearer' | 'body'>,
  now: number,
  pushBearer: string | null,
): Promise<{ message: Record<string, unknown> } | { error: string }> {
  const insertRow = buildMessageInsertRow({
    chatId: m.chatId,
    userId: m.userId,
    content: m.content,
    now,
    messageType: m.messageType,
    metadata: m.metadata,
    localSentAtMs: m.localSentAtMs,
  });

  const { data: message, error: insertErr } = await admin.from('messages').insert(insertRow).select().single();

  if (insertErr) {
    console.error('Message insert failed', { chatId: m.chatId, userId: m.userId, error: insertErr.message });
    return { error: insertErr.message };
  }

  await admin.from('chats').update({ updated_at: now }).eq('id', message.chat_id);

  if (!skipsPush(m.messageType, m.metadata)) {
    // Push delivery is not part of message durability. Keep it attached to the request
    // lifecycle via Next.js `after`/Cloudflare `waitUntil`, but do not hold the sender's
    // 201 response open while the Supabase Edge Function runs.
    runAfterResponse('chat push dispatch', async () => {
      try {
        const { data: chat } = await admin.from('chats').select('group_id').eq('id', message.chat_id).maybeSingle();
        const groupId = (chat as { group_id?: string | null } | null)?.group_id;
        if (groupId) {
          await notifyGroupMessagePush(admin, groupId, message.chat_id, message.id, m.userId, m.messageType);
        } else {
          await notifyChatMessagePush(pushBearer, message.chat_id, message.id, m.userId);
        }
      } catch (pushError) {
        console.error('Chat push dispatch failed', {
          chatId: message.chat_id,
          messageId: message.id,
          userId: m.userId,
          error: pushError instanceof Error ? pushError.message : String(pushError),
        });
      }
    });
  }
  return { message: message as Record<string, unknown> };
}
