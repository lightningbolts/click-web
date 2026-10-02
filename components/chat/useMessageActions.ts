'use client';

import {
  useCallback,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Message } from '@/lib/chat/types';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import {
  encryptContent,
  encryptGroupMessageContent,
  type DerivedKeys,
} from '@/lib/chat/crypto';
import { encryptWebE2eeV2Message, invalidateWebE2eeV2Session, type E2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { replySnippetForSend } from '@/lib/chat/reply';
import { CLIENT_OPTIMISTIC_MESSAGE_ID_PREFIX } from '@/lib/chat/clientOptimistic';
import { gifMessageMetadata, isKlipyMediaUrl } from '@/lib/chat/gif';
import { klipySendRendition, triggerKlipyShare, type KlipyGifItem } from '@/lib/chat/klipy';
import { PLAN_GOING_REACTION, planSummary, planWire, type HangoutPlan } from '@/lib/chat/plans';
import { createScheduled, type ScheduledRow } from '@/lib/chat/conversationApi';

/**
 * Send / edit / delete / react / typing-broadcast actions for one chat.
 * Extracted verbatim from ChatView.
 */
export function useMessageActions({
  connection,
  currentUserId,
  isGroupClique,
  chatId,
  e2eKeys,
  groupMasterKey,
  getE2eeV2Session,
  messages,
  setMessages,
  inputText,
  setInputText,
  editingId,
  setEditingId,
  editText,
  setEditText,
  replyingTo,
  setReplyingTo,
  mediaBusy,
  isRecording,
  pendingDeleteMessageId,
  setPendingDeleteMessageId,
  setShowDeleteConfirm,
  inputRef,
  getAuthHeaders,
  appendReplyToMetadata,
  snapThreadViewportToBottom,
  gifCustomerId,
}: {
  connection: ConnectionRecord;
  currentUserId: string;
  isGroupClique: boolean;
  chatId: string | null;
  e2eKeys: DerivedKeys | null;
  groupMasterKey: ArrayBuffer | null;
  getE2eeV2Session: (
    allowUpgrade?: boolean,
    forceRefresh?: boolean,
    staleWhileRevalidate?: boolean,
  ) => Promise<E2eeV2Session | null>;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  inputText: string;
  setInputText: Dispatch<SetStateAction<string>>;
  editingId: string | null;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  editText: string;
  setEditText: Dispatch<SetStateAction<string>>;
  replyingTo: Message | null;
  setReplyingTo: Dispatch<SetStateAction<Message | null>>;
  mediaBusy: boolean;
  isRecording: boolean;
  pendingDeleteMessageId: string | null;
  setPendingDeleteMessageId: Dispatch<SetStateAction<string | null>>;
  setShowDeleteConfirm: Dispatch<SetStateAction<boolean>>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  getAuthHeaders: () => Promise<HeadersInit>;
  appendReplyToMetadata: (meta: Record<string, unknown>) => Promise<Record<string, unknown>>;
  snapThreadViewportToBottom: () => void;
  gifCustomerId: string | null;
}) {
  /**
   * Encrypts a text body with the conversation's current scheme (v2 epoch, v1 group, v1
   * pairwise) and returns the `POST /api/chat/messages` body. Scheduling reuses it so a
   * scheduled message is stored exactly as if it had been sent then.
   */
  const buildTextPost = useCallback(
    async (content: string, extraMetadata: Record<string, unknown> | null, sentAt: number, staleOk = false) => {
      if (!chatId) throw new Error('Chat is not ready');
      const v2Session = await getE2eeV2Session(true, true, staleOk);
      const encryptedV2 = v2Session ? await encryptWebE2eeV2Message(v2Session, chatId, content) : null;
      const wireContent = encryptedV2
        ? encryptedV2.wireContent
        : isGroupClique && groupMasterKey
          ? await encryptGroupMessageContent(content, groupMasterKey)
          : e2eKeys
            ? await encryptContent(content, e2eKeys)
            : content;
      const replyMetadata =
        replyingTo && replyingTo.message_type !== 'call_log' ? await appendReplyToMetadata({}) : undefined;
      const metadata = {
        ...(extraMetadata ?? {}),
        ...(replyMetadata ?? {}),
        ...(encryptedV2?.metadata ?? {}),
      };
      return {
        chatId,
        ...(!isGroupClique ? { connectionId: connection.id } : {}),
        content: wireContent,
        local_sent_at: sentAt,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      } as Record<string, unknown>;
    },
    [chatId, getE2eeV2Session, isGroupClique, groupMasterKey, e2eKeys, replyingTo, appendReplyToMetadata, connection.id],
  );

  /**
   * Optimistic insert, encrypt, and POST for a text-type row (plain text, GIFs, plans). The
   * optimistic row is removed on failure and `onFailure` runs. Resolves to the server id.
   */
  const sendTextPayload = useCallback(async (
    content: string,
    extraMetadata: Record<string, unknown> | null,
    onFailure: () => void,
  ): Promise<string | null> => {
    if (!chatId) return null;
    const optimisticId = `${CLIENT_OPTIMISTIC_MESSAGE_ID_PREFIX}${crypto.randomUUID()}`;
    const optimisticMeta: Message['metadata'] = {
      ...(extraMetadata ?? {}),
      _bubbleKey: optimisticId,
    };
    if (replyingTo && replyingTo.message_type !== 'call_log') {
      // Local only (never sent): lets the optimistic bubble show its quote immediately.
      optimisticMeta.reply_to_id = replyingTo.id;
      optimisticMeta.reply_to_content = replySnippetForSend(previewLabelForMessage(replyingTo), 140);
    }

    const sentAt = Date.now();
    const optimisticMsg: Message = {
      id: optimisticId,
      chat_id: chatId,
      user_id: currentUserId,
      content,
      time_created: sentAt,
      time_edited: null,
      is_read: false,
      local_sent_at: sentAt,
      read_at: null,
      delivered_at: null,
      message_type: 'text',
      metadata: optimisticMeta,
      reactions: {},
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    requestAnimationFrame(() => {
      snapThreadViewportToBottom();
      requestAnimationFrame(() => snapThreadViewportToBottom());
    });

    try {
      const headers = await getAuthHeaders();
      const post = async (staleOk: boolean) =>
        fetch('/api/chat/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify(await buildTextPost(content, extraMetadata, sentAt, staleOk)),
        });
      // Send with the keys at hand (no re-check round trips first); the server validates the
      // epoch, so if they went stale, re-read them and send once more.
      let res = await post(true);
      if (!res.ok && (res.status === 400 || res.status === 409)) {
        const { code } = (await res.json().catch(() => ({}))) as { code?: unknown };
        if (code === 'E2EE_V2_INVALID' || code === 'E2EE_V2_REQUIRED') {
          invalidateWebE2eeV2Session(chatId);
          res = await post(false);
        }
      }
      if (!res.ok) throw new Error('Send failed');
      const payload = (await res.json().catch(() => ({}))) as { id?: unknown; message?: { id?: unknown } };
      const serverId =
        typeof payload.message?.id === 'string' ? payload.message.id : typeof payload.id === 'string' ? payload.id : null;
      setMessages((prev) =>
        prev.map((m) => {
          const meta =
            m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata)
              ? (m.metadata as Record<string, unknown>)
              : {};
          const bubbleKey = typeof meta._bubbleKey === 'string' ? meta._bubbleKey : null;
          const matchesBubble = bubbleKey === optimisticId;
          const matchesPending = m.id === optimisticId;
          if (!matchesPending && !matchesBubble) return m;
          if (meta._webPostAck === true) return m;
          const prevMeta = { ...meta };
          return { ...m, metadata: { ...prevMeta, _webPostAck: true } };
        }),
      );
      setReplyingTo(null);
      return serverId;
    } catch (err) {
      console.error('Send error:', err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      onFailure();
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chatId,
    replyingTo,
    currentUserId,
    getAuthHeaders,
    buildTextPost,
    snapThreadViewportToBottom,
  ]);

  /** Sends a hangout plan; whoever proposes it is going (iOS `ConversationModel.sendPlan`). */
  const sendPlan = useCallback(
    async (plan: HangoutPlan): Promise<boolean> => {
      if (!chatId) return false;
      let failed = false;
      const serverId = await sendTextPayload(planSummary(plan), { plan: planWire(plan) }, () => {
        failed = true;
      });
      if (failed || !serverId) return !failed;
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/chat/reactions', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: serverId, reactionType: PLAN_GOING_REACTION }),
        });
      } catch {
        /* The plan is sent; the RSVP can be set from the card. */
      }
      return true;
    },
    [chatId, getAuthHeaders, sendTextPayload],
  );

  /** Schedules the composer text for `sendAt` (ms). Clears the composer on success. */
  const scheduleMessage = useCallback(
    async (sendAt: number): Promise<ScheduledRow | null> => {
      const content = inputText.trim();
      if (!content || !chatId) return null;
      const body = await buildTextPost(content, null, Date.now());
      delete body.local_sent_at;
      const row = await createScheduled({ ...body, send_at: Math.trunc(sendAt) });
      setInputText((current) => (current.trim() === content ? '' : current));
      setReplyingTo(null);
      return row;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputText, chatId, buildTextPost],
  );

  const sendMessage = useCallback(async () => {
    const content = inputText.trim();
    if (!content || !chatId || mediaBusy || isRecording) return;
    setInputText('');
    inputRef.current?.focus();
    await sendTextPayload(content, null, () => setInputText(content));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, chatId, mediaBusy, isRecording, sendTextPayload]);

  /** Sends a KLIPY GIF: its media URL as the encrypted body plus `metadata.gif` layout hints. */
  const sendGif = useCallback(
    async (item: KlipyGifItem, query: string) => {
      const rendition = klipySendRendition(item);
      if (!rendition || !isKlipyMediaUrl(rendition.url) || !chatId || isRecording) return;
      if (gifCustomerId) triggerKlipyShare(item.slug, gifCustomerId, query);
      inputRef.current?.focus();
      await sendTextPayload(
        rendition.url,
        gifMessageMetadata({ provider: 'klipy', width: rendition.width, height: rendition.height }),
        () => {},
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId, isRecording, gifCustomerId, sendTextPayload],
  );

  // Broadcast typing indicator
  const broadcastTyping = useCallback(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !chatId) return;
    supabase.channel(`chat:${chatId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId },
    });
  }, [chatId, currentUserId]);

  const startEdit = useCallback((messageId: string, currentContent: string) => {
    setReplyingTo(null);
    setEditingId(messageId);
    setEditText(currentContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingId || !editText.trim()) return;

    const previous = messages.find((m) => m.id === editingId);
    if (!previous) return;

    const newContent = editText.trim();
    const editedAt = Date.now();

    setMessages((prev) => prev.map((m) => (
      m.id === editingId ? { ...m, content: newContent, time_edited: editedAt } : m
    )));
    setEditingId(null);
    setEditText('');

    const v2Session = await getE2eeV2Session(false);
    const previousMeta =
      previous.metadata && typeof previous.metadata === 'object' && !Array.isArray(previous.metadata)
        ? (previous.metadata as Record<string, unknown>)
        : {};
    const previousClientMessageId =
      typeof previousMeta.client_message_id === 'string' ? previousMeta.client_message_id : undefined;
    const encryptedV2 = v2Session
      ? await encryptWebE2eeV2Message(v2Session, previous.chat_id, newContent, previousClientMessageId)
      : null;
    const wireContent = encryptedV2
      ? encryptedV2.wireContent
      : isGroupClique && groupMasterKey
        ? await encryptGroupMessageContent(newContent, groupMasterKey)
        : e2eKeys
          ? await encryptContent(newContent, e2eKeys)
          : newContent;
    const headers = await getAuthHeaders();
    const res = await fetch('/api/chat/messages', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        messageId: editingId,
        content: wireContent,
        ...(encryptedV2 ? { metadata: { ...previousMeta, ...encryptedV2.metadata } } : {}),
      }),
    });

    if (!res.ok) {
      setMessages((prev) => prev.map((m) => (
        m.id === previous.id ? previous : m
      )));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, editText, getAuthHeaders, messages, e2eKeys, groupMasterKey, isGroupClique, getE2eeV2Session]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const index = messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    const removed = messages[index];

    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/chat/messages?messageId=${messageId}`, { method: 'DELETE', headers });
    if (!res.ok) {
      setMessages((prev) => {
        const next = [...prev];
        next.splice(index, 0, removed);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAuthHeaders, messages]);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    const current = messages.find((m) => m.id === messageId);
    if (!current) return;

    const currentList = current.reactions?.[emoji] ?? [];
    const alreadyMine = currentList.some((reaction) => reaction.user_id === currentUserId);

    setMessages((prev) => prev.map((message) => {
      if (message.id !== messageId) return message;
      const reactions = { ...(message.reactions ?? {}) };
      const list = reactions[emoji] ?? [];

      if (alreadyMine) {
        const filtered = list.filter((reaction) => reaction.user_id !== currentUserId);
        if (filtered.length > 0) reactions[emoji] = filtered;
        else delete reactions[emoji];
      } else {
        reactions[emoji] = [...list, {
          id: `temp-${messageId}-${emoji}-${Date.now()}`,
          message_id: messageId,
          user_id: currentUserId,
          reaction_type: emoji,
          created_at: Date.now(),
        }];
      }

      return { ...message, reactions };
    }));

    const headers = await getAuthHeaders();
    const method = alreadyMine ? 'DELETE' : 'POST';
    const res = await fetch('/api/chat/reactions', {
      method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messageId, reactionType: emoji }),
    });

    if (!res.ok) {
      setMessages((prev) => prev.map((message) => (
        message.id === messageId ? current : message
      )));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, getAuthHeaders, messages]);

  const confirmDeleteMessage = useCallback(async () => {
    if (!pendingDeleteMessageId) return;
    await deleteMessage(pendingDeleteMessageId);
    setPendingDeleteMessageId(null);
    setShowDeleteConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteMessage, pendingDeleteMessageId]);

  return {
    sendMessage,
    sendGif,
    sendPlan,
    scheduleMessage,
    broadcastTyping,
    startEdit,
    submitEdit,
    deleteMessage,
    handleReact,
    confirmDeleteMessage,
  };
}
