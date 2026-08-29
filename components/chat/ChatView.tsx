'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, ChevronDown, Paperclip } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import type { Message } from '@/lib/chat/types';
import { notifyMessagesDelivered } from '@/lib/chat/messages';
import MessageBubble from './MessageBubble';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { useAuth } from '@/lib/AuthContext';
import { bubbleStableListKey } from '@/lib/chat/clientOptimistic';
import { buildTimelineEntries } from '@/lib/chat/conversationTimeline';
import { ConversationDaySeparator } from './ConversationDaySeparator';
import { ChatHeader } from './ChatHeader';
import { ChatDialogs } from './ChatDialogs';
import { ChatComposer } from './ChatComposer';
import { ChatSharedInterestsBanner } from './ChatSharedInterestsBanner';
import { useChatEncryption } from './useChatEncryption';
import { useChatConnectionMeta } from './useChatConnectionMeta';
import { useMessageLoading } from './useMessageLoading';
import { useChatRealtime } from './useChatRealtime';
import { useMessageActions } from './useMessageActions';
import { useVoiceMessages } from './useVoiceMessages';
import { useChatAttachments } from './useChatAttachments';

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
  onStartCall: (videoEnabled: boolean) => void;
  onClose: () => void;
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
 * ChatView - full realtime chat experience for a single connection.
 *
 * Architecture:
 *  1. On mount → GET /api/chat?connectionId to get/create the chat row.
 *  2. GET /api/chat/messages?chatId to load initial messages.
 *  3. Subscribe to Supabase Realtime on `messages` and `message_reactions`
 *     filtered by chat_id for live updates.
 *  4. Send, edit, delete via POST/PATCH/DELETE to /api/chat/messages.
 *  5. React via POST /api/chat/reactions (add) or DELETE (remove own).
 *
 * The E2EE/data/action layers live in the sibling useChat* hooks; the header,
 * composer, dialogs, and banners are sibling components.
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
  onStartCall,
  onClose,
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

  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => { onMessagesSnapshot?.(messages); }, [messages, onMessagesSnapshot]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const [showRenameGroupModal, setShowRenameGroupModal] = useState(false);
  const [renameGroupInput, setRenameGroupInput] = useState('');
  const [showGroupMemberPicker, setShowGroupMemberPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<string | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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
  /** Glass messages card — clip portaled message menus to this region. */
  const messagesPanelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputTextRef = useRef('');
  const programmaticListScrollRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof getSupabaseClient> extends null ? never : any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!actionToast) return;
    const timeout = setTimeout(() => setActionToast(null), 2200);
    return () => clearTimeout(timeout);
  }, [actionToast]);

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
  } = useChatEncryption({ connection, currentUserId, isGroupClique, replyingTo });

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
    getAuthHeaders,
    firePeerDeliveredAck,
  });

  useChatRealtime({
    chatId,
    currentUserId,
    isGroupClique,
    e2eKeys,
    groupMasterKey,
    setMessages,
    setTypingIndicator,
    typingTimeoutRef,
    channelRef,
    scrollContainerRef,
    scrollToBottom,
    firePeerDeliveredAck,
  });

  const {
    sendMessage,
    broadcastTyping,
    startEdit,
    submitEdit,
    handleReact,
    confirmDeleteMessage,
  } = useMessageActions({
    connection,
    currentUserId,
    isGroupClique,
    chatId,
    e2eKeys,
    groupMasterKey,
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
    setActionToast,
    setInputText,
    inputTextRef,
    getAuthHeaders,
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
    setActionToast,
    setInputText,
    setIsDraggingAttachment,
    inputTextRef,
    inputRef,
    photoInputRef,
    getAuthHeaders,
    appendReplyToMetadata,
  });

  // ─────────────────────────── render ──────────────────────────────────────

  const otherInitial = otherUserName.charAt(0).toUpperCase();
  const headerTitle = isGroupClique ? (displayGroupName ?? otherUserName) : otherUserName;
  const metDate = connection.dateMet.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const timelineEntries = useMemo(() => buildTimelineEntries(messages), [messages]);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden"
      onDragOver={onAttachmentDragOver}
      onDragLeave={onAttachmentDragLeave}
      onDrop={onAttachmentDrop}
    >
      {isDraggingAttachment && (
        <div
          className="pointer-events-none absolute inset-2 z-50 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 text-primary "
          aria-hidden="true"
        >
          <Paperclip className="w-7 h-7 mb-1.5" />
          <span className="text-sm font-medium">Drop to encrypt and send</span>
          <span className="text-xs text-primary/80">2 MB max · E2EE per-file key</span>
        </div>
      )}
      {/* ── Header (safe-area only; IME resizes the message column in the parent layout) ── */}
      <ChatHeader
        connection={connection}
        currentUserId={currentUserId}
        isGroupClique={isGroupClique}
        otherUserName={otherUserName}
        headerTitle={headerTitle}
        metDate={metDate}
        peerUserId={peerUserId}
        peerIsOnline={peerIsOnline}
        groupKeyError={groupKeyError}
        groupHeaderSubtitle={groupHeaderSubtitle}
        groupCreatorId={groupCreatorId}
        groupMemberProfileRows={groupMemberProfileRows}
        isCore={isCore}
        isArchived={isArchived}
        isBlocked={isBlocked}
        onClose={onClose}
        onOpenProfile={onOpenProfile}
        onStartCall={onStartCall}
        onGroupChatChanged={onGroupChatChanged}
        onAddToCore={onAddToCore}
        onRemoveFromCore={onRemoveFromCore}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onRemove={onRemove}
        onBlock={onBlock}
        onUnblock={onUnblock}
        setActionToast={setActionToast}
        setShowReportDialog={setShowReportDialog}
        setShowGroupMemberPicker={setShowGroupMemberPicker}
        openRenameGroupModal={(currentTitle) => {
          setRenameGroupInput(currentTitle);
          setShowRenameGroupModal(true);
        }}
      />

      <ChatSharedInterestsBanner
        isGroupClique={isGroupClique}
        sharedInterestTags={sharedInterestTags}
        peerUserId={peerUserId}
      />

      {/* ── Messages area ── */}
      <div
        ref={messagesPanelRef}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
      >
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="chat-thread-scroll relative z-[1] min-h-0 flex-1"
        >
          <div className="mx-auto w-full max-w-5xl space-y-4 px-6 py-6 md:px-10">
          {loadingMore && (
            <div className="flex justify-center py-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-border-hard">
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                <span className="text-xs text-on-surface-variant">Loading older messages…</span>
              </div>
            </div>
          )}

          {/* Initial load */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-on-surface-variant">
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
              <p className="text-sm">Loading messages…</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-3 text-sm text-error py-8">
              <div className="p-3 rounded-2xl border border-error/20 bg-error/10">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p>{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/20 text-3xl">
                👋
              </div>
              <div>
                <p className="text-lg font-semibold text-on-surface">
                  {isGroupClique ? `Welcome to ${otherUserName}` : `Say hello to ${otherUserName}!`}
                </p>
                <p className="mt-1 max-w-xs text-sm text-on-surface-variant">
                  {isGroupClique ? (
                    <>
                      Everyone here is part of a <span className="font-medium text-emerald-700 dark:text-emerald-300">mathematically verified</span>{' '}
                      clique — start the thread.
                    </>
                  ) : (
                    <>
                      You met at <span className="font-medium text-primary">{connection.location}</span>. Start the conversation!
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Message list */}
          <AnimatePresence initial={false}>
            {timelineEntries.map((entry) => (
              entry.kind === 'separator' ? (
                <ConversationDaySeparator key={entry.key} label={entry.label} />
              ) : editingId === entry.message.id ? (
                /* Inline edit form */
                <motion.div
                  key={`edit-${entry.message.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`flex ${entry.message.user_id === currentUserId ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="flex gap-2 max-w-[72%]">
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitEdit();
                        if (e.key === 'Escape') { setEditingId(null); setEditText(''); }
                      }}
                      className="flex-1 rounded-[8px] border-2 border-primary bg-surface-container px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      onClick={submitEdit}
                      className="fc-btn-primary px-3 py-2 text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditText(''); }}
                      className="fc-btn-secondary px-3 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              ) : (
                <MessageBubble
                  key={bubbleStableListKey(entry.message)}
                  message={entry.message}
                  isMine={entry.message.user_id === currentUserId}
                  currentUserId={currentUserId}
                  mediaChatKey={isGroupClique ? groupMasterKey : e2eKeys}
                  getAuthHeaders={getAuthHeaders}
                  highlighted={highlightedMessageId === entry.message.id}
                  senderInitial={otherInitial}
                  senderLabel={
                    isGroupClique && entry.message.user_id !== currentUserId
                      ? entry.message.user_id.replace(/-/g, '').slice(0, 2).toUpperCase()
                      : undefined
                  }
                  showSenderOnline={!isGroupClique && peerIsOnline && entry.message.user_id === peerUserId}
                  portalsBoundsRef={messagesPanelRef}
                  onReact={handleReact}
                  onEdit={startEdit}
                  onReply={(msg) => {
                    setEditingId(null);
                    setEditText('');
                    setReplyingTo(msg);
                  }}
                  onDelete={(messageId) => {
                    setPendingDeleteMessageId(messageId);
                    setShowDeleteConfirm(true);
                  }}
                />
              )
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {typingIndicator && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex items-center gap-2"
              >
                <div className="relative h-6 w-6 shrink-0">
                  <div
                    className="flex h-full w-full items-center justify-center rounded-full bg-primary
                    text-[10px] font-bold text-on-primary"
                  >
                    {isGroupClique ? '⋯' : otherInitial}
                  </div>
                  {!isGroupClique && peerIsOnline && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background"
                      aria-hidden
                    />
                  )}
                </div>
                <div className="rounded-2xl rounded-bl-sm border border-border-hard bg-surface-container px-4 py-2.5">
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Scroll-to-bottom button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => scrollToBottom()}
              className="absolute right-5 bottom-20 bg-primary/90 
                rounded-full p-2.5 shadow-lg hover:bg-primary transition-colors z-10 "
            >
              <ChevronDown className="w-4 h-4 text-on-primary" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Input area (overflow visible so portaled pickers align; chrome stacks above messages) ── */}
      <ChatComposer
        chatId={chatId}
        isGroupClique={isGroupClique}
        otherUserName={otherUserName}
        inputText={inputText}
        setInputText={setInputText}
        inputRef={inputRef}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        replyBannerText={replyBannerText}
        editingId={editingId}
        mediaBusy={mediaBusy}
        isRecording={isRecording}
        recordingMs={recordingMs}
        photoInputRef={photoInputRef}
        attachmentInputRef={attachmentInputRef}
        onPhotoSelected={onPhotoSelected}
        onAttachmentSelected={onAttachmentSelected}
        beginVoiceRecording={beginVoiceRecording}
        stopVoiceRecording={stopVoiceRecording}
        cancelVoiceRecording={cancelVoiceRecording}
        broadcastTyping={broadcastTyping}
        sendMessage={sendMessage}
      />

      <ChatDialogs
        connection={connection}
        showDeleteConfirm={showDeleteConfirm}
        setShowDeleteConfirm={setShowDeleteConfirm}
        setPendingDeleteMessageId={setPendingDeleteMessageId}
        confirmDeleteMessage={confirmDeleteMessage}
        showReportDialog={showReportDialog}
        setShowReportDialog={setShowReportDialog}
        reportReason={reportReason}
        setReportReason={setReportReason}
        onReport={onReport}
        showRenameGroupModal={showRenameGroupModal}
        setShowRenameGroupModal={setShowRenameGroupModal}
        renameGroupInput={renameGroupInput}
        setRenameGroupInput={setRenameGroupInput}
        setDisplayGroupName={setDisplayGroupName}
        onGroupChatChanged={onGroupChatChanged}
        showGroupMemberPicker={showGroupMemberPicker}
        setShowGroupMemberPicker={setShowGroupMemberPicker}
        groupMemberProfileRows={groupMemberProfileRows}
        onOpenProfile={onOpenProfile}
        actionToast={actionToast}
        setActionToast={setActionToast}
      />
    </div>
  );
}
