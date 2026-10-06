'use client';

import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronDown, Lock, Paperclip, Pin } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import type { Message } from '@/lib/chat/types';
import { notifyMessagesDelivered } from '@/lib/chat/messages';
import { isAnyE2eeWireContent } from '@/lib/chat/crypto';
import MessageBubble, { type MessageSender } from './MessageBubble';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { useAuth } from '@/lib/AuthContext';
import { bubbleStableListKey } from '@/lib/chat/clientOptimistic';
import { buildTimelineEntries, messageRuns } from '@/lib/chat/conversationTimeline';
import { ConversationDaySeparator, NewMessagesSeparator } from './ConversationDaySeparator';
import { ChatBackground } from './ChatBackground';
import { ChatHeader } from './ChatHeader';
import { ChatDialogs, type ChatDialogState } from './ChatDialogs';
import { ChatComposer } from './ChatComposer';
import { klipyAppKey, klipyCustomerId } from '@/lib/chat/klipy';
import { useChatEncryption } from './useChatEncryption';
import { useChatConnectionMeta } from './useChatConnectionMeta';
import { useMessageLoading } from './useMessageLoading';
import { useChatRealtime } from './useChatRealtime';
import { useMessageActions } from './useMessageActions';
import { useVoiceMessages } from './useVoiceMessages';
import { useChatAttachments } from './useChatAttachments';
import { useChatMutes, useConversationExtras } from './useConversationExtras';
import { useConversationActions } from './useConversationActions';
import { useThreadDrops } from './useThreadDrops';
import { useE2eeNotice } from './useE2eeNotice';
import { ThreadSearchBar } from './ThreadSearchBar';
import { SayHiPanel, sayHiOpeners } from './SayHiPanel';
import { ConversationDetailsPanel } from './ConversationDetailsPanel';
import { PlanDialog } from './PlanDialog';
import { ScheduleSendDialog } from './ScheduleSendDialog';
import { chatNotify } from './chatNotify';
import { useClickDrop } from '@/components/people/useClickDrop';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Button } from '@/components/ds/Button';
import { Skeleton } from '@/components/ds/Skeleton';
import { Spinner } from '@/components/ds/Spinner';
import { PLAN_DECLINED_REACTION, PLAN_GOING_REACTION } from '@/lib/chat/plans';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import { replySnippetForSend } from '@/lib/chat/reply';
import { readSessionCache } from '@/lib/dashboard/sessionCache';
import { connectionRecordToArchiveRow, getArchiveCountdown } from '@/lib/dashboard/connectionStatus';
import { chatThreadCacheKey, type ChatThreadSnapshot } from '@/components/chat/useMessageLoading';
import { cn } from '@/lib/cn';

const DETAILS_PREF_KEY = 'click:chat-details-open';
const WIDE_QUERY = '(min-width: 1280px)';
/** Say Hi shows until the conversation has this many messages (spec §7.2). */
const SAY_HI_MAX_MESSAGES = 5;

/** Details panel defaults open on wide screens; the reader's last choice wins after that. */
function readDetailsPreference(): boolean {
  if (typeof window === 'undefined') return false;
  // Below xl the panel is a sheet over the thread: never open it unasked.
  if (!window.matchMedia(WIDE_QUERY).matches) return false;
  try {
    const stored = window.localStorage.getItem(DETAILS_PREF_KEY);
    if (stored === 'true' || stored === 'false') return stored === 'true';
  } catch {
    /* ignore */
  }
  return true;
}

function writeDetailsPreference(open: boolean) {
  try {
    window.localStorage.setItem(DETAILS_PREF_KEY, String(open));
  } catch {
    /* ignore */
  }
}

function firstUnreadPeerMessage(messages: Message[], currentUserId: string): string | null {
  return messages.find((m) => m.user_id !== currentUserId && m.message_type !== 'call_log' && m.read_at == null)?.id ?? null;
}

interface ChatViewProps {
  connection: ConnectionRecord;
  currentUserId: string;
  /** Display name for the other participant */
  otherUserName: string;
  isArchived: boolean;
  isBlocked: boolean;
  isCore?: boolean;
  onAddToCore?: () => Promise<boolean> | boolean;
  onRemoveFromCore?: () => Promise<boolean> | boolean;
  onArchive: () => Promise<boolean> | boolean;
  onUnarchive: () => Promise<boolean> | boolean;
  onRemove: () => Promise<boolean> | boolean;
  onReport: (reason: string) => Promise<boolean> | boolean;
  onBlock: () => Promise<boolean> | boolean;
  onUnblock: () => Promise<boolean> | boolean;
  onClose: () => void;
  /** False while the chat pane is hidden (tab kept alive in the background). */
  active?: boolean;
  /** Load a window around a message that is not in the current timeline. */
  onRequestJump?: (messageId: string) => void;
  /** Open profile sheet for the given user (e.g. peer avatar tap). */
  onOpenProfile?: (userId: string) => void;
  /** After leave/delete verified click; parent should refresh group list. */
  onGroupChatChanged?: () => void;
  /** Reports the current locally-decrypted messages so the parent can feed them
   *  into the profile sheet's Media / Links / Files tabs (E2EE content). */
  onMessagesSnapshot?: (messages: Message[]) => void;
  /** Global-search deep link: scroll this message into view and pulse-highlight it. */
  targetMessageId?: string | null;
}

/**
 * ChatView — the open conversation (spec §7.2): header, timeline over the conversation's
 * backdrop, one top banner at a time, the composer, and the details column.
 *
 * Data: GET /api/chat?connectionId → chat row; GET /api/chat/messages → pages; Supabase Realtime
 * on `messages` / `message_reactions` for live updates. The E2EE, loading, realtime and action
 * layers live in the sibling useChat* hooks.
 */
export default function ChatView({
  connection,
  currentUserId,
  otherUserName,
  isArchived,
  isBlocked,
  isCore = false,
  onAddToCore,
  onRemoveFromCore,
  onArchive,
  onUnarchive,
  onRemove,
  onReport,
  onBlock,
  onUnblock,
  onClose,
  active = true,
  onRequestJump,
  onOpenProfile,
  onGroupChatChanged,
  onMessagesSnapshot,
  targetMessageId = null,
}: ChatViewProps) {
  const { onlineUserIds } = useAuth();
  const isGroupClique = connection.chatKind === 'group_clique';

  const peerUserId = useMemo(() => {
    if (isGroupClique) return undefined;
    if (connection.otherUserId) return connection.otherUserId;
    const ids = connection.userIds;
    if (!ids?.length) return undefined;
    return ids.find((id) => id !== currentUserId);
  }, [connection.otherUserId, connection.userIds, currentUserId, isGroupClique]);
  const peerIsOnline = !!(peerUserId && onlineUserIds.has(peerUserId));

  // Reopening a thread paints its last page from the session cache; loading revalidates it.
  const [restoredThread] = useState(() => {
    if (targetMessageId?.trim()) return undefined;
    const snap = readSessionCache<ChatThreadSnapshot>(currentUserId, chatThreadCacheKey(connection.id));
    return snap && (!isGroupClique || !connection.groupChatId || snap.chatId === connection.groupChatId)
      ? snap
      : undefined;
  });
  const [chatId, setChatId] = useState<string | null>(restoredThread?.chatId ?? null);
  const [messages, setMessages] = useState<Message[]>(restoredThread?.messages ?? []);
  useEffect(() => { onMessagesSnapshot?.(messages); }, [messages, onMessagesSnapshot]);
  const [loading, setLoading] = useState(!restoredThread);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(restoredThread?.hasMore ?? true);
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const [dialog, setDialog] = useState<ChatDialogState>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);
  const searchFocusConsumedRef = useRef<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /** Set in layout when the thread identity changes; cleared after an open snap session completes. */
  const snapScrollToLatestOnOpenRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputTextRef = useRef('');
  const programmaticListScrollRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof getSupabaseClient> extends null ? never : any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => getFreshAuthHeaders(), []);

  /** Recipient device receipt for peer-authored rows (true “Delivered” for the sender). */
  const firePeerDeliveredAck = useCallback(
    async (messageIds: string[]) => {
      if (!chatId || messageIds.length === 0) return;
      const uniq = [...new Set(messageIds)].slice(0, 120);
      try {
        await notifyMessagesDelivered(getAuthHeaders, chatId, uniq);
      } catch (err) {
        console.error('delivered ack failed:', err);
      }
    },
    [chatId, getAuthHeaders],
  );

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  const {
    e2eKeys,
    groupMasterKey,
    groupKeyError,
    replyBannerText,
    decryptWireMessageContent,
    appendReplyToMetadata,
    getE2eeV2Session,
  } = useChatEncryption({ connection, currentUserId, isGroupClique, chatId, getAuthHeaders, replyingTo });

  const {
    groupHeaderSubtitle,
    groupCreatorId,
    displayGroupName,
    setDisplayGroupName,
    groupMemberProfileRows,
    sharedInterestTags,
  } = useChatConnectionMeta({ isGroupClique, connection, otherUserName, peerUserId, getAuthHeaders });

  const {
    scrollToBottom,
    isNearBottom,
    snapThreadViewportToBottom,
    handleScroll,
  } = useMessageLoading({
    connection,
    currentUserId,
    isGroupClique,
    targetMessageId,
    e2eKeys,
    groupMasterKey,
    groupKeyError,
    getE2eeV2Session,
    chatId,
    setChatId,
    messages,
    setMessages,
    loading,
    setLoading,
    loadingMore,
    setLoadingMore,
    hasMore,
    setHasMore,
    setError,
    setShowScrollBtn,
    setHighlightedMessageId,
    scrollContainerRef,
    messagesEndRef,
    inputRef,
    programmaticListScrollRef,
    snapScrollToLatestOnOpenRef,
    searchFocusConsumedRef,
    readReceiptsEnabled: active,
    getAuthHeaders,
    firePeerDeliveredAck,
    restored: Boolean(restoredThread),
  });

  useChatRealtime({
    chatId,
    currentUserId,
    isGroupClique,
    e2eKeys,
    groupMasterKey,
    getE2eeV2Session,
    setMessages,
    setTypingIndicator,
    typingTimeoutRef,
    channelRef,
    scrollContainerRef,
    scrollToBottom,
    firePeerDeliveredAck,
  });

  // KLIPY GIF search is enabled only when the public app key is configured.
  const [gifCustomer, setGifCustomer] = useState<{ userId: string; id: string } | null>(null);
  useEffect(() => {
    if (!klipyAppKey() || !currentUserId) return;
    let cancelled = false;
    void klipyCustomerId(currentUserId).then((id) => {
      if (!cancelled) setGifCustomer({ userId: currentUserId, id });
    });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);
  const gifCustomerId = gifCustomer?.userId === currentUserId ? gifCustomer.id : null;

  const {
    sendMessage,
    sendGif,
    sendPlan,
    scheduleMessage,
    broadcastTyping,
    startEdit,
    submitEdit,
    deleteMessage,
    handleReact,
  } = useMessageActions({
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
    inputRef,
    getAuthHeaders,
    appendReplyToMetadata,
    snapThreadViewportToBottom,
    gifCustomerId,
  });

  const { beginVoiceRecording, stopVoiceRecording, cancelVoiceRecording } = useVoiceMessages({
    connection,
    currentUserId,
    isGroupClique,
    chatId,
    e2eKeys,
    groupMasterKey,
    mediaBusy,
    setMediaBusy,
    isRecording,
    setIsRecording,
    setRecordingMs,
    setMessages,
    setReplyingTo,
    notify: chatNotify,
    setInputText,
    inputTextRef,
    getAuthHeaders,
    getE2eeV2Session,
    appendReplyToMetadata,
    decryptWireMessageContent,
    isNearBottom,
    scrollToBottom,
  });

  const {
    onPhotoSelected,
    onAttachmentSelected,
    onAttachmentDrop,
    onAttachmentDragOver,
    onAttachmentDragLeave,
  } = useChatAttachments({
    connection,
    currentUserId,
    isGroupClique,
    chatId,
    e2eKeys,
    groupMasterKey,
    mediaBusy,
    setMediaBusy,
    isRecording,
    setReplyingTo,
    notify: chatNotify,
    setInputText,
    setIsDraggingAttachment,
    inputTextRef,
    inputRef,
    photoInputRef,
    getAuthHeaders,
    getE2eeV2Session,
    appendReplyToMetadata,
  });

  // Click Drop: direct chats only — a photo into the pair's shared roll that develops later.
  const {
    inputRef: dropInputRef,
    status: dropStatus,
    busy: dropBusy,
    pick: pickDrop,
    onFile: onDropFile,
  } = useClickDrop(isGroupClique ? null : connection.id, currentUserId);
  useEffect(() => {
    if (dropStatus === 'error') chatNotify({ type: 'error', message: 'Couldn’t send that Click Drop. Try again.' });
    if (dropStatus === 'done') chatNotify({ type: 'success', message: 'Dropped. It develops for you both later.' });
  }, [dropStatus]);
  const dropStateFor = useThreadDrops(messages);

  // ── Conversation extras: mute, pins, plans, scheduled, hangouts ──
  const { muteFor, setMuted } = useChatMutes();
  const mute = muteFor([chatId, connection.id]);
  const onSetMuted = useCallback(
    (muted: boolean, ms: number | null) => setMuted(chatId ?? connection.id, muted, ms),
    [chatId, connection.id, setMuted],
  );
  const extras = useConversationExtras({
    chatId,
    connectionId: isGroupClique ? null : connection.id,
    isGroupClique,
    decryptForDisplay: decryptWireMessageContent,
  });
  const [detailsOpen, setDetailsOpen] = useState(() => readDetailsPreference());
  const toggleDetails = useCallback(() => {
    setDetailsOpen((open) => {
      writeDetailsPreference(!open);
      return !open;
    });
  }, []);
  const [planOpen, setPlanOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const headerTitle = isGroupClique ? (displayGroupName ?? otherUserName) : otherUserName;
  const firstName = otherUserName.split(/\s+/)[0] || otherUserName;
  const actions = useConversationActions({
    connection,
    title: headerTitle,
    isGroupCreator: Boolean(groupCreatorId && groupCreatorId === currentUserId),
    onClose,
    onGroupChatChanged,
    onAddToCore,
    onRemoveFromCore,
    onArchive,
    onUnarchive,
    onRemove,
    onBlock,
    onUnblock,
  });

  const jumpToMessage = useCallback(
    (messageId: string) => {
      const el = scrollContainerRef.current?.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setHighlightedMessageId(messageId);
        window.setTimeout(() => setHighlightedMessageId((cur) => (cur === messageId ? null : cur)), 1200);
      } else {
        onRequestJump?.(messageId);
      }
      if (!window.matchMedia(WIDE_QUERY).matches) setDetailsOpen(false);
    },
    [onRequestJump],
  );

  const handlePlanRsvp = useCallback(
    async (message: Message, going: boolean) => {
      const want = going ? PLAN_GOING_REACTION : PLAN_DECLINED_REACTION;
      const other = going ? PLAN_DECLINED_REACTION : PLAN_GOING_REACTION;
      const mine = (emoji: string) => (message.reactions?.[emoji] ?? []).some((r) => r.user_id === currentUserId);
      if (mine(other)) await handleReact(message.id, other);
      await handleReact(message.id, want);
    },
    [currentUserId, handleReact],
  );

  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const replySnippetById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) map.set(m.id, replySnippetForSend(previewLabelForMessage(m), 140));
    return map;
  }, [messages]);
  const resolveReplySnippet = useCallback((id: string) => replySnippetById.get(id) ?? null, [replySnippetById]);

  const memberById = useMemo(
    () => new Map(groupMemberProfileRows.map((row) => [row.userId, row.label])),
    [groupMemberProfileRows],
  );
  const nameFor = useCallback(
    (userId: string) =>
      userId === currentUserId ? 'You' : isGroupClique ? (memberById.get(userId) ?? 'Member') : otherUserName,
    [currentUserId, isGroupClique, memberById, otherUserName],
  );
  const resolveReplyAuthor = useCallback(
    (id: string) => {
      const m = messageById.get(id);
      return m ? nameFor(m.user_id) : null;
    },
    [messageById, nameFor],
  );
  const senderFor = (m: Message): MessageSender | null =>
    isGroupClique && m.user_id !== currentUserId ? { id: m.user_id, name: memberById.get(m.user_id) ?? 'Member' } : null;

  const handleTogglePin = useCallback(
    async (message: Message) => {
      try {
        const pinned = await extras.togglePin(message.id, currentUserId);
        chatNotify({ type: 'success', message: pinned ? 'Message pinned' : 'Message unpinned' });
      } catch {
        chatNotify({ type: 'error', message: "Couldn't update the pin. Try again." });
      }
    },
    [currentUserId, extras],
  );

  const replyTo = useCallback((m: Message) => {
    setEditingId(null);
    setEditText('');
    setReplyingTo(m);
    inputRef.current?.focus();
  }, []);
  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);
  const editLast = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.user_id !== currentUserId || m.message_type !== 'text') continue;
      if (typeof m.content !== 'string' || isAnyE2eeWireContent(m.content)) return;
      startEdit(m.id, m.content);
      return;
    }
  }, [currentUserId, messages, startEdit]);

  const e2eeNotice = useE2eeNotice({
    chatId,
    isGroupClique,
    e2eKeys,
    groupMasterKey,
    groupKeyError,
    getE2eeV2Session,
    getAuthHeaders,
  });

  // "New messages" marks the first unread message from the other side, captured once per open
  // conversation so it stays put while read receipts go out.
  const [unreadAnchor, setUnreadAnchor] = useState<{ chatId: string; id: string | null } | null>(null);
  if (!loading && chatId && unreadAnchor?.chatId !== chatId) {
    setUnreadAnchor({ chatId, id: firstUnreadPeerMessage(messages, currentUserId) });
  }
  const unreadId = unreadAnchor?.chatId === chatId ? unreadAnchor.id : null;

  // Jump-to-latest counts what arrived from others since the reader scrolled away.
  const lastId = messages.at(-1)?.id ?? null;
  const [scrollBaseline, setScrollBaseline] = useState<string | null>(null);
  if (showScrollBtn && scrollBaseline === null && lastId) setScrollBaseline(lastId);
  if (!showScrollBtn && scrollBaseline !== null) setScrollBaseline(null);
  const unseenCount = useMemo(() => {
    if (!scrollBaseline) return 0;
    const at = messages.findIndex((m) => m.id === scrollBaseline);
    return at < 0 ? 0 : messages.slice(at + 1).filter((m) => m.user_id !== currentUserId).length;
  }, [currentUserId, messages, scrollBaseline]);

  // Say Hi: a fresh direct connection that hasn't really started talking yet.
  const [openedAtMs] = useState(() => Date.now());
  const countdown = useMemo(
    () => getArchiveCountdown(connectionRecordToArchiveRow(connection), openedAtMs),
    [connection, openedAtMs],
  );
  const openers = useMemo(
    () => sayHiOpeners(firstName, connection.location, sharedInterestTags),
    [connection.location, firstName, sharedInterestTags],
  );
  const showSayHi =
    !isGroupClique &&
    !isBlocked &&
    !loading &&
    messages.length < SAY_HI_MAX_MESSAGES &&
    countdown?.kind === 'initial_message' &&
    countdown.remainingMs > 0;

  const latestPin = useMemo(
    () => [...extras.pins].sort((a, b) => Date.parse(b.pinned_at) - Date.parse(a.pinned_at))[0] ?? null,
    [extras.pins],
  );

  const timelineEntries = useMemo(() => buildTimelineEntries(messages), [messages]);
  const runs = useMemo(() => messageRuns(messages), [messages]);
  const subtitle = isGroupClique
    ? (groupHeaderSubtitle ?? `${connection.userIds?.length ?? 0} members`)
    : connection.location
      ? `Met at ${connection.location}`
      : `Met ${connection.dateMet.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  // ─────────────────────────── render ──────────────────────────────────────

  let banner: React.ReactNode = null;
  if (error) {
    banner = <InlineNotice variant="destructive" live>{error}</InlineNotice>;
  } else if (searchOpen) {
    banner = <ThreadSearchBar messages={messages} onJump={jumpToMessage} onClose={() => setSearchOpen(false)} />;
  } else if (e2eeNotice) {
    banner = (
      <InlineNotice
        key={e2eeNotice.key}
        variant={e2eeNotice.variant}
        icon={Lock}
        live
        className="shadow-overlay"
        action={
          e2eeNotice.action ? (
            <Button size="sm" variant="plain" onClick={e2eeNotice.action.onClick}>
              {e2eeNotice.action.label}
            </Button>
          ) : null
        }
      >
        {e2eeNotice.text}
      </InlineNotice>
    );
  } else if (showSayHi && countdown) {
    banner = (
      <SayHiPanel
        hoursLeft={Math.max(1, Math.ceil(countdown.remainingMs / 3_600_000))}
        openers={openers}
        onPick={(text) => {
          setInputText(text);
          inputRef.current?.focus();
        }}
      />
    );
  } else if (latestPin) {
    banner = (
      <button
        type="button"
        onClick={() => jumpToMessage(latestPin.message_id)}
        className="material-glass press flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left shadow-overlay"
      >
        <Pin size={16} aria-hidden className="shrink-0 rotate-45 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="type-badge block text-accent">
            Pinned{extras.pins.length > 1 ? ` · ${extras.pins.length}` : ''}
          </span>
          <span className="type-meta block truncate text-fg">
            {replySnippetById.get(latestPin.message_id) ?? 'Pinned message'}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      data-testid="chat-panel"
      className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-bg"
      onDragOver={onAttachmentDragOver}
      onDragLeave={onAttachmentDragLeave}
      onDrop={onAttachmentDrop}
    >
      <section aria-label={`Conversation with ${headerTitle}`} className="relative flex min-w-0 flex-1 flex-col">
        <ChatBackground seed={connection.id} />
        {isDraggingAttachment ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-4 z-50 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-accent bg-selection/80 text-accent"
          >
            <Paperclip size={28} aria-hidden />
            <span className="type-body-strong">Drop to send</span>
            <span className="type-meta">Encrypted end to end · up to 2 MB</span>
          </div>
        ) : null}

        <ChatHeader
          connection={connection}
          isGroupClique={isGroupClique}
          title={headerTitle}
          peerUserId={peerUserId}
          peerIsOnline={peerIsOnline}
          typing={typingIndicator}
          subtitle={subtitle}
          isCore={isCore}
          isArchived={isArchived}
          isBlocked={isBlocked}
          mute={mute}
          onSetMuted={onSetMuted}
          detailsOpen={detailsOpen}
          onToggleDetails={toggleDetails}
          searchOpen={searchOpen}
          onToggleSearch={() => setSearchOpen((open) => !open)}
          onPlan={() => setPlanOpen(true)}
          onClose={onClose}
          onOpenProfile={onOpenProfile}
          openDialog={setDialog}
          actions={actions}
        />

        <div className="relative min-h-0 flex-1">
          {banner ? <div className="absolute inset-x-3 top-3 z-20 mx-auto max-w-[720px]">{banner}</div> : null}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="chat-thread-scroll relative h-full"
          >
            <div className={cn('mx-auto flex min-h-full max-w-[720px] flex-col px-3 pb-3 md:px-6', banner ? 'pt-20' : 'pt-4')}>
              {loadingMore ? (
                <div className="flex justify-center py-2" role="status">
                  <Spinner size={16} />
                  <span className="sr-only">Loading older messages</span>
                </div>
              ) : null}

              {loading ? (
                <div aria-busy aria-label="Loading messages" className="flex flex-1 flex-col justify-end gap-2 py-4">
                  <Skeleton className="h-9 w-48 rounded-bubble" />
                  <Skeleton className="ml-auto h-9 w-40 rounded-bubble" />
                  <Skeleton className="h-14 w-64 rounded-bubble" />
                  <Skeleton className="ml-auto h-9 w-56 rounded-bubble" />
                </div>
              ) : null}

              {!loading && !error && messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-end gap-1 pb-6 text-center">
                  <p className="type-meta inline-flex items-center gap-1.5 text-fg-tertiary">
                    <Lock size={12} aria-hidden />
                    Messages are end-to-end encrypted.
                  </p>
                </div>
              ) : null}

              {!loading && messages.length > 0 ? <div className="flex-1" aria-hidden /> : null}

              {timelineEntries.map((entry) => {
                if (entry.kind === 'separator') {
                  return <ConversationDaySeparator key={entry.key} label={entry.label} />;
                }
                const m = entry.message;
                const run = runs.get(m.id) ?? { first: true, last: true };
                return (
                  <Fragment key={bubbleStableListKey(m)}>
                    {m.id === unreadId ? <NewMessagesSeparator /> : null}
                    <MessageBubble
                      message={m}
                      isMine={m.user_id === currentUserId}
                      currentUserId={currentUserId}
                      first={run.first}
                      last={run.last}
                      sender={senderFor(m)}
                      mediaChatKey={isGroupClique ? groupMasterKey : e2eKeys}
                      getAuthHeaders={getAuthHeaders}
                      getE2eeV2Session={getE2eeV2Session}
                      highlighted={highlightedMessageId === m.id || editingId === m.id}
                      onReact={handleReact}
                      onEdit={startEdit}
                      onReply={isBlocked ? undefined : replyTo}
                      onDelete={(messageId) => setDialog({ kind: 'delete-message', messageId })}
                      pinned={extras.pinnedIds.has(m.id)}
                      onTogglePin={(msg) => void handleTogglePin(msg)}
                      onPlanRsvp={(msg, going) => void handlePlanRsvp(msg, going)}
                      resolveReplySnippet={resolveReplySnippet}
                      resolveReplyAuthor={resolveReplyAuthor}
                      onJumpTo={jumpToMessage}
                      drop={dropStateFor(m)}
                    />
                  </Fragment>
                );
              })}

              {typingIndicator ? (
                <div className="mt-2 flex" role="status" aria-label={`${isGroupClique ? 'Someone' : firstName} is typing`}>
                  <div className="flex h-9 items-center gap-1 rounded-bubble rounded-bl-xs bg-bubble-in px-3.5">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="ds-typing-dot size-[7px] rounded-full bg-fg-tertiary" style={{ animationDelay: `${i * 160}ms` }} />
                    ))}
                  </div>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {showScrollBtn ? (
            <button
              type="button"
              onClick={() => scrollToBottom()}
              aria-label={unseenCount ? `Jump to latest, ${unseenCount} new` : 'Jump to latest'}
              className="material-glass press absolute bottom-3 right-4 z-20 flex h-9 items-center gap-1 rounded-pill px-3 text-fg shadow-overlay"
            >
              {unseenCount ? <span className="type-badge tabular text-accent">{unseenCount}</span> : null}
              <ChevronDown size={18} aria-hidden />
            </button>
          ) : null}
        </div>

        <ChatComposer
          disabled={isBlocked || !chatId}
          placeholder={isBlocked ? 'You blocked this conversation' : `Message ${isGroupClique ? headerTitle : firstName}`}
          value={editingId ? editText : inputText}
          onChange={(value) => {
            if (editingId) {
              setEditText(value);
            } else {
              setInputText(value);
              if (value) broadcastTyping();
            }
          }}
          inputRef={inputRef}
          reply={replyingTo ? (replyBannerText ?? replySnippetById.get(replyingTo.id) ?? 'Message') : null}
          onCancelReply={() => setReplyingTo(null)}
          editing={Boolean(editingId)}
          onCancelEdit={cancelEdit}
          onSubmit={() => void (editingId ? submitEdit() : sendMessage())}
          onEditLast={editLast}
          mediaBusy={mediaBusy || dropBusy}
          isRecording={isRecording}
          recordingMs={recordingMs}
          photoInputRef={photoInputRef}
          attachmentInputRef={attachmentInputRef}
          onPhotoSelected={onPhotoSelected}
          onAttachmentSelected={onAttachmentSelected}
          beginVoiceRecording={beginVoiceRecording}
          stopVoiceRecording={stopVoiceRecording}
          cancelVoiceRecording={cancelVoiceRecording}
          gifCustomerId={gifCustomerId}
          sendGif={sendGif}
          onPlan={() => setPlanOpen(true)}
          onSchedule={() => setScheduleOpen(true)}
          onClickDrop={isGroupClique ? undefined : pickDrop}
        />
        {!isGroupClique ? (
          <input
            ref={dropInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void onDropFile(e)}
          />
        ) : null}
      </section>

      {detailsOpen ? (
        <>
          <button
            type="button"
            aria-label="Close details"
            className="absolute inset-0 z-[55] bg-black/25 xl:hidden"
            onClick={toggleDetails}
          />
          <aside
            id="conversation-details"
            aria-label="Conversation details"
            className="absolute inset-y-0 right-0 z-[60] w-[min(100%,22.5rem)] border-l border-hairline bg-surface shadow-overlay xl:static xl:z-auto xl:w-[20rem] xl:shrink-0 xl:shadow-none"
          >
            <ConversationDetailsPanel
              connection={connection}
              isGroupClique={isGroupClique}
              title={headerTitle}
              subtitle={subtitle}
              peerUserId={peerUserId}
              currentUserId={currentUserId}
              messages={messages}
              mute={mute}
              onSetMuted={onSetMuted}
              pins={extras.pins}
              onUnpin={(id) => {
                const message = messageById.get(id);
                if (message) void handleTogglePin(message);
                else void extras.togglePin(id, currentUserId);
              }}
              scheduled={extras.scheduled}
              onCancelScheduled={extras.cancelScheduled}
              hangouts={extras.hangouts}
              onAnswerHangout={extras.answerHangout}
              onLogHangout={() => extras.requestHangout(null)}
              onJumpToMessage={jumpToMessage}
              onPlan={() => setPlanOpen(true)}
              onSearch={() => {
                setSearchOpen(true);
                if (!window.matchMedia(WIDE_QUERY).matches) setDetailsOpen(false);
              }}
              onOpenProfile={onOpenProfile}
              onShowMembers={
                isGroupClique && groupMemberProfileRows.length > 0 ? () => setDialog({ kind: 'members' }) : undefined
              }
              members={groupMemberProfileRows}
              sharedInterests={sharedInterestTags}
              isCore={isCore}
              isArchived={isArchived}
              isBlocked={isBlocked}
              onReport={() => setDialog({ kind: 'report' })}
              actions={actions}
              mediaChatKey={isGroupClique ? groupMasterKey : e2eKeys}
              getAuthHeaders={getAuthHeaders}
              getE2eeV2Session={getE2eeV2Session}
              onClose={toggleDetails}
            />
          </aside>
        </>
      ) : null}

      <PlanDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        withName={isGroupClique ? null : firstName}
        onSend={sendPlan}
      />
      <ScheduleSendDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        preview={inputText.trim()}
        onSchedule={async (sendAt) => {
          try {
            const row = await scheduleMessage(sendAt);
            if (!row) return false;
            extras.addScheduled(row);
            chatNotify({
              type: 'success',
              message: `Scheduled for ${new Date(sendAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`,
            });
            return true;
          } catch {
            return false;
          }
        }}
      />

      <ChatDialogs
        state={dialog}
        onClose={() => setDialog(null)}
        connection={connection}
        otherUserName={otherUserName}
        onConfirmDeleteMessage={deleteMessage}
        onReport={onReport}
        onRenamed={setDisplayGroupName}
        onGroupChatChanged={onGroupChatChanged}
        members={groupMemberProfileRows}
        onOpenProfile={onOpenProfile}
      />
      {actions.confirmNode}
    </div>
  );
}
