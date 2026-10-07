'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import { authFailureMessage } from '@/lib/auth/freshAuthHeaders';
import type { Message } from '@/lib/chat/types';
import { isBeaconChatMessage, shouldSkipChatDecrypt } from '@/lib/chat/messages';
import { THREAD_PAGE_SIZE, fetchThreadPage, takeWarmThreadFirstPage } from '@/lib/chat/threadPages';
import { CHAT_SEARCH_FOCUS_MS } from '@/lib/chat/searchSnippet';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import {
  decryptContent,
  isEncrypted,
  isGroupMessageEncrypted,
  decryptGroupMessageContent,
  type DerivedKeys,
} from '@/lib/chat/crypto';
import { decryptWebE2eeV2ForDisplay, type E2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { writeSessionCache } from '@/lib/dashboard/sessionCache';

const PAGE_SIZE = THREAD_PAGE_SIZE;

/** Last loaded page of a thread, kept in the memory-only session cache (cleared on sign-out). */
export type ChatThreadSnapshot = { chatId: string; messages: Message[]; hasMore: boolean };

export function chatThreadCacheKey(connectionId: string): string {
  return `chat-thread:${connectionId}`;
}

/**
 * Chat bootstrap and message loading: get/create the chat row, initial page,
 * older-page pagination, scroll management (open snap, scroll-to-bottom,
 * search focus), and read receipts. Extracted verbatim from ChatView.
 */
export function useMessageLoading({
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
  readReceiptsEnabled = true,
  getAuthHeaders,
  firePeerDeliveredAck,
  restored = false,
}: {
  connection: ConnectionRecord;
  currentUserId: string;
  isGroupClique: boolean;
  targetMessageId: string | null;
  e2eKeys: DerivedKeys | null;
  groupMasterKey: ArrayBuffer | null;
  groupKeyError: string | null;
  getE2eeV2Session: (allowUpgrade?: boolean, forceRefresh?: boolean) => Promise<E2eeV2Session | null>;
  chatId: string | null;
  setChatId: Dispatch<SetStateAction<string | null>>;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  loadingMore: boolean;
  setLoadingMore: Dispatch<SetStateAction<boolean>>;
  hasMore: boolean;
  setHasMore: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setShowScrollBtn: Dispatch<SetStateAction<boolean>>;
  setHighlightedMessageId: Dispatch<SetStateAction<string | null>>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  programmaticListScrollRef: MutableRefObject<boolean>;
  snapScrollToLatestOnOpenRef: MutableRefObject<boolean>;
  searchFocusConsumedRef: MutableRefObject<string | null>;
  /** False while the thread is not on screen (hidden tab pane); nothing is marked read then. */
  readReceiptsEnabled?: boolean;
  getAuthHeaders: () => Promise<HeadersInit>;
  firePeerDeliveredAck: (messageIds: string[]) => Promise<void>;
  /** State was seeded from a cached snapshot: skip the reset and chat lookup, just revalidate. */
  restored?: boolean;
}) {
  // Which groupChatId the restored snapshot belongs to; cleared once the thread resets.
  const restoredForRef = useRef<string | null | undefined>(restored ? connection.groupChatId ?? null : undefined);
  const isRestored = () => restoredForRef.current === (connection.groupChatId ?? null);

  const scrollToBottom = useCallback((smooth = true) => {
    programmaticListScrollRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        programmaticListScrollRef.current = false;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isRestored()) return;
    restoredForRef.current = undefined;
    setChatId(null);
    setLoading(true);
    setMessages([]);
    setError(null);
    setHasMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, connection.groupChatId, isGroupClique]);

  /** Must run in layout phase so it executes before the snap below on the same paint. */
  useLayoutEffect(() => {
    snapScrollToLatestOnOpenRef.current = !targetMessageId?.trim();
    searchFocusConsumedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, connection.groupChatId, isGroupClique, targetMessageId]);

  /** Scroll the messages scroller to the true bottom (dimension-safe; avoids document scroll). */
  const snapThreadViewportToBottom = useCallback(() => {
    const root = scrollContainerRef.current;
    if (!root) return;
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    root.scrollTop = max;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * After opening a thread, keep pinning to the bottom while layout settles (flex, dvh, images,
   * ResizeObserver). Does not re-run on every new message — only when `loading` becomes ready for this chat.
   */
  useEffect(() => {
    if (loading || !chatId || !snapScrollToLatestOnOpenRef.current) return;

    const root = scrollContainerRef.current;
    if (!root) return;

    const tick = () => {
      snapThreadViewportToBottom();
    };

    tick();
    const raf0 = requestAnimationFrame(tick);
    let rafInner = 0;
    const rafOuter = requestAnimationFrame(() => {
      rafInner = requestAnimationFrame(tick);
    });
    const timeouts = [0, 32, 96, 220, 420].map((ms) => window.setTimeout(tick, ms));

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        tick();
      });
      ro.observe(root);
    }

    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', tick);
    vv?.addEventListener('scroll', tick);

    let doneTimer: number | null = null;
    const finalize = () => {
      tick();
      snapScrollToLatestOnOpenRef.current = false;
      ro?.disconnect();
      ro = null;
      vv?.removeEventListener('resize', tick);
      vv?.removeEventListener('scroll', tick);
      timeouts.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(raf0);
      cancelAnimationFrame(rafOuter);
      cancelAnimationFrame(rafInner);
    };

    doneTimer = window.setTimeout(finalize, 720) as unknown as number;

    return () => {
      if (doneTimer != null) window.clearTimeout(doneTimer);
      timeouts.forEach((id) => window.clearTimeout(id));
      cancelAnimationFrame(raf0);
      cancelAnimationFrame(rafOuter);
      cancelAnimationFrame(rafInner);
      ro?.disconnect();
      vv?.removeEventListener('resize', tick);
      vv?.removeEventListener('scroll', tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, chatId, connection.id, connection.groupChatId, isGroupClique, snapThreadViewportToBottom]);

  useEffect(() => {
    if (isRestored()) return;
    const init = async () => {
      try {
        if (isGroupClique && connection.groupChatId) {
          setChatId(connection.groupChatId);
          return;
        }
        // The inbox row already knows an existing chat's id (`get_inbox_previews`); only a
        // Click with no chat yet needs the get-or-create round trip.
        const knownChatId = (connection as ConnectionRecord & { chatId?: string | null }).chatId;
        if (!isGroupClique && knownChatId) {
          setChatId(knownChatId);
          return;
        }
        const headers = await getAuthHeaders();
        const qs = isGroupClique
          ? `groupId=${encodeURIComponent(connection.id)}`
          : `connectionId=${encodeURIComponent(connection.id)}`;
        const res = await fetch(`/api/chat?${qs}`, { headers });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          chat?: { id?: string };
        };
        if (!res.ok) {
          throw new Error(
            authFailureMessage(res.status, json.error ?? 'Failed to load chat'),
          );
        }
        const id = json.chat?.id;
        if (!id) throw new Error('Failed to load chat');
        setChatId(id);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, connection.groupChatId, isGroupClique]);

  useEffect(() => {
    if (loading || !chatId) return;
    writeSessionCache<ChatThreadSnapshot>(currentUserId, chatThreadCacheKey(connection.id), {
      chatId,
      messages,
      hasMore,
    });
  }, [loading, chatId, messages, hasMore, currentUserId, connection.id]);

  /** One page as stored (ciphertext); needs no keys, so it can start before they're ready. */
  const fetchRawMessages = useCallback(
    (id: string, cursor?: number, aroundMessageId?: string) =>
      fetchThreadPage(id, { cursor, aroundMessageId, getHeaders: getAuthHeaders }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const decryptMessages = useCallback(async (id: string, raw: Message[]): Promise<Message[]> => {
    // Unreadable messages keep their ciphertext, so they decrypt in place once keys arrive.
    const v2Resolved = await Promise.all(raw.map(async (m) => {
      if (!m.content.startsWith('e2e2:')) return m;
      const plain = await decryptWebE2eeV2ForDisplay(id, m.content, () => getE2eeV2Session(false));
      return plain == null ? m : { ...m, content: plain };
    }));

    if (isGroupClique) {
      if (!groupMasterKey) return v2Resolved;
      return Promise.all(
        v2Resolved.map(async (m) => {
          if (shouldSkipChatDecrypt(m.message_type) || isBeaconChatMessage(m) || !isGroupMessageEncrypted(m.content)) return m;
          const plaintext = await decryptGroupMessageContent(m.content, groupMasterKey);
          return { ...m, content: plaintext };
        }),
      );
    }

    if (!e2eKeys) return v2Resolved;
    const decrypted = await Promise.all(
      v2Resolved.map(async (m) => {
        if (shouldSkipChatDecrypt(m.message_type) || isBeaconChatMessage(m) || !isEncrypted(m.content)) return m;
        const plaintext = await decryptContent(m.content, e2eKeys);
        return { ...m, content: plaintext };
      }),
    );
    return decrypted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e2eKeys, groupMasterKey, isGroupClique, getE2eeV2Session]);

  const fetchMessages = useCallback(
    async (id: string, cursor?: number, aroundMessageId?: string) =>
      decryptMessages(id, await fetchRawMessages(id, cursor, aroundMessageId)),
    [decryptMessages, fetchRawMessages],
  );

  // Opening a thread: request the first page as soon as the chat id is known, while the keys
  // are still loading, instead of after them. The load below decrypts it once they're ready.
  const firstPageRef = useRef<{ key: string; page: Promise<Message[]> } | null>(null);
  const firstPage = useCallback(
    (id: string, around: string | undefined) => {
      const key = `${id}|${around ?? ''}`;
      if (firstPageRef.current?.key !== key) {
        // A page warmed from the inbox (hover/touch) stands in when it's fresh.
        const warm = around ? null : takeWarmThreadFirstPage(id);
        firstPageRef.current = { key, page: warm ?? fetchRawMessages(id, undefined, around) };
      }
      return firstPageRef.current.page;
    },
    [fetchRawMessages],
  );
  useEffect(() => {
    if (!chatId) return;
    firstPage(chatId, targetMessageId?.trim() || undefined).catch(() => {
      /* surfaced by the load below */
    });
  }, [chatId, targetMessageId, firstPage]);

  useEffect(() => {
    if (!chatId) return;

    const ids =
      connection.userIds ??
      (connection.otherUserId ? [currentUserId, connection.otherUserId] : []);
    const awaitingPairwiseKeys = !isGroupClique && ids.length >= 2 && e2eKeys === null;
    const awaitingGroupKey = isGroupClique && groupMasterKey === null && groupKeyError === null;
    if (awaitingPairwiseKeys || awaitingGroupKey) {
      return;
    }

    const load = async () => {
      try {
        const around = targetMessageId?.trim() || undefined;
        const raw = await firstPage(chatId, around);
        const msgs = await decryptMessages(chatId, raw);
        setMessages(msgs);
        const ackIds = msgs
          .filter((m) => m.user_id !== currentUserId && (m.delivered_at == null || m.delivered_at === undefined))
          .map((m) => m.id);
        void firePeerDeliveredAck(ackIds);
        setHasMore(msgs.length === PAGE_SIZE);
      } catch (err: any) {
        setError(err.message);
      } finally {
        // Used once (or failed): a later reload (keys rotated, retry) fetches fresh.
        firstPageRef.current = null;
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chatId,
    connection.otherUserId,
    connection.userIds,
    currentUserId,
    e2eKeys,
    decryptMessages,
    firstPage,
    groupKeyError,
    groupMasterKey,
    isGroupClique,
    firePeerDeliveredAck,
    targetMessageId,
  ]);

  const loadMore = useCallback(async () => {
    if (!chatId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);

    const oldest = messages[0].time_created;
    const container = scrollContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    try {
      const older = await fetchMessages(chatId, oldest);
      setMessages((prev) => [...older, ...prev]);
      setHasMore(older.length === PAGE_SIZE);

      const ackIds = older
        .filter(
          (m) =>
            m.user_id !== currentUserId &&
            (m.delivered_at == null || m.delivered_at === undefined),
        )
        .map((m) => m.id);
      void firePeerDeliveredAck(ackIds);

      // Maintain scroll position after prepend
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch (err: any) {
      console.error('Could not load older messages:', err);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, currentUserId, fetchMessages, firePeerDeliveredAck, hasMore, loadingMore, messages]);

  useEffect(() => {
    const id = targetMessageId?.trim();
    if (!id || loading) return;
    if (searchFocusConsumedRef.current === id) return;
    const el = scrollContainerRef.current?.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    if (!el) return;
    searchFocusConsumedRef.current = id;
    snapScrollToLatestOnOpenRef.current = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightedMessageId(id);
    const timeout = window.setTimeout(() => {
      setHighlightedMessageId((cur) => (cur === id ? null : cur));
    }, CHAT_SEARCH_FOCUS_MS);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMessageId, loading, messages]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (
      !programmaticListScrollRef.current &&
      typeof document !== 'undefined' &&
      document.activeElement === inputRef.current
    ) {
      inputRef.current?.blur();
    }

    setShowScrollBtn(!isNearBottom());

    // Load more when scrolled to top
    if (el.scrollTop < 80 && hasMore && !loadingMore) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, loadMore]);

  const unreadIncomingMessageIds = useMemo(
    () =>
      messages
        .filter((m) => m.user_id !== currentUserId && !m.is_read)
        .map((m) => m.id),
    [messages, currentUserId],
  );

  // Only mark messages read while someone can actually see them: the thread is the visible
  // pane and the browser tab is in the foreground.
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  useEffect(() => {
    const onChange = () => setDocumentVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    if (!chatId || unreadIncomingMessageIds.length === 0) return;
    if (!readReceiptsEnabled || !documentVisible) return;
    let cancelled = false;

    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/chat/messages/read', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ chat_id: chatId }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error('read receipt mark failed:', res.status, text);
          return;
        }
        if (cancelled) return;
        const unreadSet = new Set(unreadIncomingMessageIds);
        setMessages((prev) =>
          prev.map((m) => (unreadSet.has(m.id) ? { ...m, is_read: true } : m)),
        );
      } catch (err) {
        if (!cancelled) {
          console.error('read receipt mark failed:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, getAuthHeaders, unreadIncomingMessageIds, readReceiptsEnabled, documentVisible]);

  return {
    scrollToBottom,
    isNearBottom,
    snapThreadViewportToBottom,
    fetchMessages,
    loadMore,
    handleScroll,
  };
}
