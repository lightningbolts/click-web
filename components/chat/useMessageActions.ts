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
import { encryptWebE2eeV2Message, type E2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { replySnippetForSend } from '@/lib/chat/reply';
import { CLIENT_OPTIMISTIC_MESSAGE_ID_PREFIX } from '@/lib/chat/clientOptimistic';

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
}: {
  connection: ConnectionRecord;
  currentUserId: string;
  isGroupClique: boolean;
  chatId: string | null;
  e2eKeys: DerivedKeys | null;
  groupMasterKey: ArrayBuffer | null;
  getE2eeV2Session: (allowUpgrade?: boolean, forceRefresh?: boolean) => Promise<E2eeV2Session | null>;
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
}) {
  const sendMessage = useCallback(async () => {
    const content = inputText.trim();
    if (!content || !chatId || mediaBusy || isRecording) return;

    const optimisticId = `${CLIENT_OPTIMISTIC_MESSAGE_ID_PREFIX}${crypto.randomUUID()}`;
    const optimisticMeta: Message['metadata'] = {
      _bubbleKey: optimisticId,
    };
    if (replyingTo && replyingTo.message_type !== 'call_log') {
      const replyLabel =
        replyingTo.message_type === 'image' || replyingTo.message_type === 'audio'
          ? previewLabelForMessage(replyingTo)
          : replyingTo.content;
      optimisticMeta.reply_to_id = replyingTo.id;
      optimisticMeta.reply_to_content = replySnippetForSend(replyLabel, 140);
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

    setInputText('');
    inputRef.current?.focus();
    setMessages((prev) => [...prev, optimisticMsg]);
    requestAnimationFrame(() => {
      snapThreadViewportToBottom();
      requestAnimationFrame(() => snapThreadViewportToBottom());
    });

    try {
      const v2Session = await getE2eeV2Session(true, true);
      const encryptedV2 = v2Session
        ? await encryptWebE2eeV2Message(v2Session, chatId, content)
        : null;
      const wireContent = encryptedV2
        ? encryptedV2.wireContent
        : isGroupClique && groupMasterKey
          ? await encryptGroupMessageContent(content, groupMasterKey)
          : e2eKeys
            ? await encryptContent(content, e2eKeys)
            : content;
      const headers = await getAuthHeaders();
      const replyMetadata =
        replyingTo && replyingTo.message_type !== 'call_log'
          ? await appendReplyToMetadata({})
          : undefined;
      const metadata = encryptedV2
        ? { ...(replyMetadata ?? {}), ...encryptedV2.metadata }
        : replyMetadata;
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chatId,
          ...(!isGroupClique ? { connectionId: connection.id } : {}),
          content: wireContent,
          local_sent_at: sentAt,
          ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
        }),
      });
      if (!res.ok) throw new Error('Send failed');
      await res.json().catch(() => ({}));
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
    } catch (err) {
      console.error('Send error:', err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInputText(content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inputText,
    chatId,
    mediaBusy,
    isRecording,
    e2eKeys,
    groupMasterKey,
    isGroupClique,
    replyingTo,
    connection.id,
    currentUserId,
    getAuthHeaders,
    appendReplyToMetadata,
    snapThreadViewportToBottom,
    getE2eeV2Session,
  ]);

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
    broadcastTyping,
    startEdit,
    submitEdit,
    deleteMessage,
    handleReact,
    confirmDeleteMessage,
  };
}
