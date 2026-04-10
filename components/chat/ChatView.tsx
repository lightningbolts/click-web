'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  ChevronDown,
  MapPin,
  Calendar,
  Sparkles,
  MoreHorizontal,
  Archive,
  UserMinus,
  Users,
  Flag,
  Shield,
  ShieldOff,
  Phone,
  Video,
  ImagePlus,
  Mic,
  Square,
  X,
  Pencil,
  LogOut,
  Trash2,
} from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Message } from '@/lib/chat/types';
import { normalizeDbMessage } from '@/lib/chat/messages';
import { uploadChatMediaBlob } from '@/lib/chat/chatMediaStorage';
import { previewLabelForMessage } from '@/lib/chat/mediaMetadata';
import MessageBubble from './MessageBubble';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import {
  deriveKeysForConnection,
  encryptContent,
  decryptContent,
  isEncrypted,
  isGroupMessageEncrypted,
  isAnyE2eeWireContent,
  encryptGroupMessageContent,
  decryptGroupMessageContent,
  type DerivedKeys,
} from '@/lib/chat/crypto';
import { unwrapGroupMasterKeyBytes } from '@/lib/chat/groupCliqueKey';
import { useAuth } from '@/lib/AuthContext';
import { replySnippetForSend } from '@/lib/chat/reply';
import {
  deleteCliqueRpc,
  leaveCliqueRpc,
  renameCliqueRpc,
} from '@/lib/chat/createVerifiedClick';

interface ChatViewProps {
  connection: ConnectionRecord;
  currentUserId: string;
  /** Display name for the other participant */
  otherUserName: string;
  isArchived: boolean;
  isBlocked: boolean;
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
}

type ChatTimelineEntry =
  | { kind: 'separator'; key: string; label: string }
  | { kind: 'message'; message: Message };

function getDayStart(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatConversationDayLabel(timestamp: number) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const targetDay = getDayStart(timestamp);
  if (targetDay === today.getTime()) {
    return 'Today';
  }

  if (targetDay === yesterday.getTime()) {
    return 'Yesterday';
  }

  const datePart = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
  }).format(new Date(timestamp));

  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));

  return `${datePart} at ${timePart}`;
}

function buildTimelineEntries(messages: Message[]): ChatTimelineEntry[] {
  const entries: ChatTimelineEntry[] = [];
  let previousDayStart: number | null = null;

  for (const message of messages) {
    const dayStart = getDayStart(message.time_created);
    if (dayStart !== previousDayStart) {
      entries.push({
        kind: 'separator',
        key: `separator-${dayStart}`,
        label: formatConversationDayLabel(message.time_created),
      });
      previousDayStart = dayStart;
    }

    entries.push({ kind: 'message', message });
  }

  return entries;
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
 *  5. React via POST /api/chat/reactions (toggle).
 */
export default function ChatView({
  connection,
  currentUserId,
  otherUserName,
  isArchived,
  isBlocked,
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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [groupHeaderSubtitle, setGroupHeaderSubtitle] = useState<string | null>(null);
  const [groupCreatorId, setGroupCreatorId] = useState<string | null>(null);
  const [displayGroupName, setDisplayGroupName] = useState<string | null>(null);
  const [showRenameGroupModal, setShowRenameGroupModal] = useState(false);
  const [renameGroupInput, setRenameGroupInput] = useState('');
  const [groupMenuBusy, setGroupMenuBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<string | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [actionToast, setActionToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCallMenu, setShowCallMenu] = useState(false);
  const [e2eKeys, setE2eKeys] = useState<DerivedKeys | null>(null);
  /** Raw 32-byte AES group master for verified clique chats (matches mobile `MessageCrypto`). */
  const [groupMasterKey, setGroupMasterKey] = useState<ArrayBuffer | null>(null);
  const [groupKeyError, setGroupKeyError] = useState<string | null>(null);
  const [replyBannerText, setReplyBannerText] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [sharedInterestTags, setSharedInterestTags] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /** Glass messages card — clip portaled message menus to this region. */
  const messagesPanelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputTextRef = useRef('');
  const channelRef = useRef<ReturnType<typeof getSupabaseClient> extends null ? never : any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callMenuAnchorRef = useRef<HTMLDivElement>(null);
  const headerMenuAnchorRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingMimeRef = useRef<string>('audio/webm');
  const recordingStartedAtRef = useRef<number>(0);
  const voiceCancelRef = useRef(false);
  const [callMenuPos, setCallMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [headerMenuPos, setHeaderMenuPos] = useState<{ top: number; left: number } | null>(null);

  const PAGE_SIZE = 40;

  useLayoutEffect(() => {
    if (!showCallMenu || typeof document === 'undefined') {
      setCallMenuPos(null);
      return;
    }
    const place = () => {
      const el = callMenuAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuW = 200;
      setCallMenuPos({
        top: r.bottom + 8,
        left: Math.min(r.right - menuW, window.innerWidth - menuW - 12),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showCallMenu]);

  useLayoutEffect(() => {
    if (!showHeaderMenu || typeof document === 'undefined') {
      setHeaderMenuPos(null);
      return;
    }
    const place = () => {
      const el = headerMenuAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuW = 200;
      setHeaderMenuPos({
        top: r.bottom + 8,
        left: Math.min(r.right - menuW, window.innerWidth - menuW - 12),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showHeaderMenu]);

  useEffect(() => {
    if (!actionToast) return;
    const timeout = setTimeout(() => setActionToast(null), 2200);
    return () => clearTimeout(timeout);
  }, [actionToast]);

  // ─────────────────────────── auth header helper ─────────────────────────

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const supabase = getSupabaseClient();
    if (!supabase) return { 'Content-Type': 'application/json' };
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }, []);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  const appendReplyToMetadata = useCallback(
    async (meta: Record<string, unknown>): Promise<Record<string, unknown>> => {
      if (!replyingTo || replyingTo.message_type === 'call_log') return meta;
      let snippetSource = replyingTo.content;
      if (isGroupClique && groupMasterKey && isGroupMessageEncrypted(replyingTo.content)) {
        snippetSource = await decryptGroupMessageContent(replyingTo.content, groupMasterKey);
      } else if (e2eKeys && isEncrypted(replyingTo.content)) {
        snippetSource = await decryptContent(replyingTo.content, e2eKeys);
      }
      const replyLabel =
        replyingTo.message_type === 'image' || replyingTo.message_type === 'audio'
          ? previewLabelForMessage({ ...replyingTo, content: snippetSource })
          : snippetSource;
      return {
        ...meta,
        reply_to_id: replyingTo.id,
        reply_to_content: replySnippetForSend(replyLabel, 140),
      };
    },
    [replyingTo, e2eKeys, groupMasterKey, isGroupClique],
  );

  // ─────────────────────────── helpers ────────────────────────────────────

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const isNearBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // ─────────────────────────── E2EE key derivation ────────────────────────

  useEffect(() => {
    if (isGroupClique) {
      setE2eKeys(null);
      return;
    }
    const userIds = connection.userIds ?? (connection.otherUserId ? [currentUserId, connection.otherUserId] : []);
    if (userIds.length >= 2) {
      deriveKeysForConnection(connection.id, userIds).then(setE2eKeys);
    }
  }, [connection.id, connection.userIds, connection.otherUserId, currentUserId, isGroupClique]);

  useEffect(() => {
    if (!isGroupClique) {
      setGroupMasterKey(null);
      setGroupKeyError(null);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setGroupKeyError('Sign in required');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const master = await unwrapGroupMasterKeyBytes(supabase, {
          groupId: connection.id,
          viewerUserId: currentUserId,
        });
        if (cancelled) return;
        if (!master) {
          setGroupKeyError('Could not unlock group encryption for this device.');
          setGroupMasterKey(null);
          return;
        }
        setGroupKeyError(null);
        setGroupMasterKey(master);
      } catch {
        if (!cancelled) {
          setGroupKeyError('Could not unlock group encryption.');
          setGroupMasterKey(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection.id, currentUserId, isGroupClique]);

  useEffect(() => {
    if (!isGroupClique) {
      setGroupHeaderSubtitle(null);
      setGroupCreatorId(null);
      setDisplayGroupName(null);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: g, error: ge } = await supabase
          .from('groups')
          .select('name, created_by')
          .eq('id', connection.id)
          .maybeSingle();
        if (ge || !g || cancelled) return;
        const nm = typeof g.name === 'string' ? g.name.trim() : '';
        if (!cancelled) {
          setDisplayGroupName(nm || otherUserName);
          setGroupCreatorId(
            (typeof g.created_by === 'string' ? g.created_by : null) ??
              connection.groupCreatedByUserId ??
              null,
          );
        }
        const { data: mems } = await supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', connection.id);
        const ids = (mems ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean);
        if (ids.length === 0 || cancelled) return;
        type UserMini = { id: string; name?: string | null; first_name?: string | null };
        let usersData: UserMini[] | null = null;
        const r1 = await supabase.from('users').select('id, name, full_name, first_name, last_name').in('id', ids);
        if (!r1.error && r1.data) {
          usersData = r1.data as UserMini[];
        } else {
          const r2 = await supabase.from('users').select('id, name').in('id', ids);
          if (!r2.error && r2.data) usersData = r2.data as UserMini[];
        }
        const labelFor = (u: { first_name?: string | null; name?: string | null }) => {
          const fn = u.first_name?.trim();
          if (fn) return fn;
          const n = u.name?.trim();
          if (n) return n.split(/\s+/)[0] ?? n;
          return 'Member';
        };
        const byId = new Map((usersData ?? []).map((u) => [u.id, labelFor(u)]));
        const labels = ids
          .slice()
          .sort()
          .map((id) => byId.get(id) ?? 'Member');
        if (!cancelled) {
          setGroupHeaderSubtitle(`${ids.length} Members: ${labels.join(', ')}`);
        }
      } catch {
        if (!cancelled) setGroupHeaderSubtitle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGroupClique, connection.id, connection.groupCreatedByUserId, otherUserName]);

  useEffect(() => {
    if (!peerUserId) {
      setSharedInterestTags([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/users/${encodeURIComponent(peerUserId)}/profile`,
          { headers },
        );
        const json = (await res.json().catch(() => ({}))) as {
          sharedInterestTags?: unknown;
        };
        if (!res.ok || cancelled) return;
        const raw = json.sharedInterestTags;
        const tags = Array.isArray(raw)
          ? raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          : [];
        if (!cancelled) setSharedInterestTags(tags);
      } catch {
        if (!cancelled) setSharedInterestTags([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders, peerUserId]);

  useEffect(() => {
    if (!replyingTo || replyingTo.message_type === 'call_log') {
      setReplyBannerText('');
      return;
    }
    if (replyingTo.message_type === 'image' || replyingTo.message_type === 'audio') {
      const raw = replyingTo.content;
      if (!isAnyE2eeWireContent(raw)) {
        setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: raw }));
        return;
      }
      if (isGroupClique) {
        if (!groupMasterKey || !isGroupMessageEncrypted(raw)) {
          setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: '' }));
          return;
        }
        let cancelled = false;
        decryptGroupMessageContent(raw, groupMasterKey).then(
          (plain) => {
            if (!cancelled) {
              setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: plain }));
            }
          },
          () => {
            if (!cancelled) setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: '' }));
          },
        );
        return () => {
          cancelled = true;
        };
      }
      if (!e2eKeys) {
        setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: '' }));
        return;
      }
      let cancelled = false;
      decryptContent(raw, e2eKeys).then(
        (plain) => {
          if (!cancelled) {
            setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: plain }));
          }
        },
        () => {
          if (!cancelled) setReplyBannerText(previewLabelForMessage({ ...replyingTo, content: '' }));
        },
      );
      return () => {
        cancelled = true;
      };
    }
    const raw = replyingTo.content;
    if (!isAnyE2eeWireContent(raw)) {
      setReplyBannerText(replySnippetForSend(raw, 120));
      return;
    }
    if (isGroupClique) {
      if (!groupMasterKey || !isGroupMessageEncrypted(raw)) {
        setReplyBannerText('Encrypted message');
        return;
      }
      let cancelledG = false;
      decryptGroupMessageContent(raw, groupMasterKey).then(
        (plain) => {
          if (!cancelledG) setReplyBannerText(replySnippetForSend(plain, 120));
        },
        () => {
          if (!cancelledG) setReplyBannerText('Encrypted message');
        },
      );
      return () => {
        cancelledG = true;
      };
    }
    if (!e2eKeys) {
      setReplyBannerText('Encrypted message');
      return;
    }
    let cancelled = false;
    decryptContent(raw, e2eKeys).then(
      (plain) => {
        if (!cancelled) setReplyBannerText(replySnippetForSend(plain, 120));
      },
      () => {
        if (!cancelled) setReplyBannerText('Encrypted message');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [replyingTo, e2eKeys, groupMasterKey, isGroupClique]);

  useEffect(() => {
    if (!isRecording) {
      setRecordingMs(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => setRecordingMs(Date.now() - t0), 200);
    return () => clearInterval(id);
  }, [isRecording]);

  // ─────────────────────────── init: get/create chat ───────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        if (isGroupClique && connection.groupChatId) {
          setChatId(connection.groupChatId);
          return;
        }
        const headers = await getAuthHeaders();
        const qs = isGroupClique
          ? `groupId=${encodeURIComponent(connection.id)}`
          : `connectionId=${encodeURIComponent(connection.id)}`;
        const res = await fetch(`/api/chat?${qs}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to load chat');
        setChatId(json.chat.id);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };
    init();
  }, [connection.id, connection.groupChatId, isGroupClique]);

  // ─────────────────────────── load messages ───────────────────────────────

  const fetchMessages = useCallback(async (id: string, cursor?: number) => {
    const params = new URLSearchParams({ chatId: id, limit: String(PAGE_SIZE) });
    if (cursor) params.set('cursor', String(cursor));

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/chat/messages?${params}`, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to load messages');

    const raw: Message[] = (json.messages as Record<string, unknown>[])
      .reverse()
      .map(normalizeDbMessage);

    if (isGroupClique) {
      if (!groupMasterKey) return raw;
      return Promise.all(
        raw.map(async (m) => {
          if (m.message_type === 'call_log' || !isGroupMessageEncrypted(m.content)) return m;
          const plaintext = await decryptGroupMessageContent(m.content, groupMasterKey);
          return { ...m, content: plaintext };
        }),
      );
    }

    if (!e2eKeys) return raw;
    const decrypted = await Promise.all(
      raw.map(async (m) => {
        if (m.message_type === 'call_log' || !isEncrypted(m.content)) return m;
        const plaintext = await decryptContent(m.content, e2eKeys);
        return { ...m, content: plaintext };
      }),
    );
    return decrypted;
  }, [e2eKeys, groupMasterKey, isGroupClique]);

  useEffect(() => {
    if (!chatId) return;

    const load = async () => {
      try {
        const msgs = await fetchMessages(chatId);
        setMessages(msgs);
        setHasMore(msgs.length === PAGE_SIZE);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
        setTimeout(() => scrollToBottom(false), 50);
      }
    };
    load();
  }, [chatId, fetchMessages, scrollToBottom, groupMasterKey]);

  // ─────────────────────────── load older messages ─────────────────────────

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
  }, [chatId, fetchMessages, hasMore, loadingMore, messages]);

  // ─────────────────────────── realtime subscription ───────────────────────

  useEffect(() => {
    if (!chatId) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const decryptIfNeeded = async (content: string): Promise<string> => {
      if (isGroupClique && groupMasterKey && isGroupMessageEncrypted(content)) {
        return decryptGroupMessageContent(content, groupMasterKey);
      }
      if (e2eKeys && isEncrypted(content)) {
        return decryptContent(content, e2eKeys);
      }
      return content;
    };

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        async (payload: any) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          if (eventType === 'INSERT') {
            const skipDecrypt = newRow.message_type === 'call_log';
            const plainContent = skipDecrypt
              ? (newRow.content ?? '')
              : await decryptIfNeeded(newRow.content ?? '');
            const msg = normalizeDbMessage({
              ...newRow,
              content: plainContent,
              reactions: {},
            });
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const updated = [...prev, msg];
              if (isNearBottom()) setTimeout(() => scrollToBottom(), 60);
              return updated;
            });
          } else if (eventType === 'UPDATE') {
            const skipDecrypt = newRow.message_type === 'call_log';
            const plainContent = skipDecrypt
              ? (newRow.content ?? '')
              : await decryptIfNeeded(newRow.content ?? '');
            setMessages((prev) =>
              prev.map((m) =>
                m.id === newRow.id
                  ? normalizeDbMessage({
                      ...m,
                      ...newRow,
                      content: plainContent,
                      reactions: m.reactions,
                    })
                  : m
              )
            );
          } else if (eventType === 'DELETE') {
            setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
          }
        }
      )
      // Reaction inserts / deletes
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload: any) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          setMessages((prev) =>
            prev.map((m) => {
              const reactions = { ...(m.reactions ?? {}) };

              if (eventType === 'INSERT' && newRow.message_id === m.id) {
                const list = reactions[newRow.reaction_type] ?? [];
                if (!list.some((r: any) => r.id === newRow.id || (r.user_id === newRow.user_id && r.reaction_type === newRow.reaction_type))) {
                  reactions[newRow.reaction_type] = [...list, newRow];
                }
              } else if (eventType === 'DELETE' && oldRow.message_id === m.id) {
                const reactionType = oldRow.reaction_type as string | undefined;
                if (reactionType) {
                  const list = (reactions[reactionType] ?? []).filter(
                    (r: any) => r.id !== oldRow.id
                  );
                  if (list.length > 0) reactions[reactionType] = list;
                  else delete reactions[reactionType];
                } else {
                  Object.keys(reactions).forEach((emoji) => {
                    const list = (reactions[emoji] ?? []).filter((r: any) => r.id !== oldRow.id);
                    if (list.length > 0) reactions[emoji] = list;
                    else delete reactions[emoji];
                  });
                }
              }

              return { ...m, reactions };
            })
          );
        }
      )
      // Typing indicator via broadcast (best-effort, no persistence)
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        if (payload.payload?.userId !== currentUserId) {
          setTypingIndicator(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingIndicator(false), 2500);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, currentUserId, scrollToBottom, e2eKeys, groupMasterKey, isGroupClique]);

  // ─────────────────────────── scroll event ────────────────────────────────

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    setShowScrollBtn(!isNearBottom());

    // Load more when scrolled to top
    if (el.scrollTop < 80 && hasMore && !loadingMore) {
      loadMore();
    }
  }, [hasMore, loadingMore, loadMore]);

  // ─────────────────────────── send message ────────────────────────────────

  const sendMessage = useCallback(async () => {
    const content = inputText.trim();
    if (!content || !chatId || sending || mediaBusy || isRecording) return;

    setSending(true);
    setInputText('');
    inputRef.current?.focus();

    try {
      const wireContent =
        isGroupClique && groupMasterKey
          ? await encryptGroupMessageContent(content, groupMasterKey)
          : e2eKeys
            ? await encryptContent(content, e2eKeys)
            : content;
      const headers = await getAuthHeaders();
      const metadata =
        replyingTo && replyingTo.message_type !== 'call_log'
          ? await appendReplyToMetadata({})
          : undefined;
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chatId,
          ...(!isGroupClique ? { connectionId: connection.id } : {}),
          content: wireContent,
          ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
        }),
      });
      if (!res.ok) throw new Error('Send failed');
      setReplyingTo(null);
    } catch (err) {
      console.error('Send error:', err);
      setInputText(content);
    } finally {
      setSending(false);
    }
  }, [
    inputText,
    chatId,
    sending,
    mediaBusy,
    isRecording,
    e2eKeys,
    groupMasterKey,
    isGroupClique,
    replyingTo,
    connection.id,
    getAuthHeaders,
    appendReplyToMetadata,
  ]);

  const uploadAndSendVoice = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      if (!chatId) return;
      setMediaBusy(true);
      try {
        const caption = inputTextRef.current.trim();
        setInputText('');
        const wireContent =
          isGroupClique && groupMasterKey && caption
            ? await encryptGroupMessageContent(caption, groupMasterKey)
            : e2eKeys && caption
              ? await encryptContent(caption, e2eKeys)
              : caption;
        const { publicUrl } = await uploadChatMediaBlob(
          currentUserId,
          blob,
          blob.type || recordingMimeRef.current || 'audio/webm',
        );
        const headers = await getAuthHeaders();
        const metadata = await appendReplyToMetadata({
          media_url: publicUrl,
          duration_seconds: durationSeconds,
        });
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chatId,
            ...(!isGroupClique ? { connectionId: connection.id } : {}),
            content: wireContent,
            message_type: 'audio',
            metadata,
          }),
        });
        if (!res.ok) throw new Error('Send failed');
        setReplyingTo(null);
      } catch (err) {
        console.error('Voice send error:', err);
        setActionToast({ type: 'error', message: 'Could not send voice message' });
      } finally {
        setMediaBusy(false);
      }
    },
    [
      chatId,
      currentUserId,
      connection.id,
      e2eKeys,
      groupMasterKey,
      isGroupClique,
      getAuthHeaders,
      appendReplyToMetadata,
    ],
  );

  const beginVoiceRecording = useCallback(async () => {
    if (!chatId || sending || mediaBusy || isRecording) return;
    voiceCancelRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const preferred =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';
      const mr = preferred
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      recordingMimeRef.current = mr.mimeType || 'audio/webm';
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordingChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        if (voiceCancelRef.current) {
          voiceCancelRef.current = false;
          return;
        }
        const blob = new Blob(recordingChunksRef.current, { type: recordingMimeRef.current });
        recordingChunksRef.current = [];
        if (blob.size < 32) return;
        const elapsedSec = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        void uploadAndSendVoice(blob, elapsedSec);
      };
      mediaRecorderRef.current = mr;
      mr.start(400);
      setIsRecording(true);
    } catch {
      setActionToast({ type: 'error', message: 'Microphone access denied or unavailable' });
    }
  }, [chatId, sending, mediaBusy, isRecording, uploadAndSendVoice]);

  const stopVoiceRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') mr.stop();
  }, []);

  const cancelVoiceRecording = useCallback(() => {
    voiceCancelRef.current = true;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') mr.stop();
    else {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
      voiceCancelRef.current = false;
    }
  }, []);

  const onPhotoSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !chatId || sending || mediaBusy || isRecording) return;
      if (!file.type.startsWith('image/')) {
        setActionToast({ type: 'error', message: 'Please choose an image file' });
        return;
      }
      setMediaBusy(true);
      inputRef.current?.focus();
      try {
        const { publicUrl } = await uploadChatMediaBlob(currentUserId, file, file.type);
        const caption = inputTextRef.current.trim();
        setInputText('');
        const wireContent =
          isGroupClique && groupMasterKey && caption
            ? await encryptGroupMessageContent(caption, groupMasterKey)
            : e2eKeys && caption
              ? await encryptContent(caption, e2eKeys)
              : caption;
        const headers = await getAuthHeaders();
        const metadata = await appendReplyToMetadata({ media_url: publicUrl });
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chatId,
            ...(!isGroupClique ? { connectionId: connection.id } : {}),
            content: wireContent,
            message_type: 'image',
            metadata,
          }),
        });
        if (!res.ok) throw new Error('Send failed');
        setReplyingTo(null);
      } catch (err) {
        console.error('Photo send error:', err);
        setActionToast({ type: 'error', message: 'Could not send photo' });
      } finally {
        setMediaBusy(false);
      }
    },
    [
      chatId,
      sending,
      mediaBusy,
      isRecording,
      currentUserId,
      e2eKeys,
      groupMasterKey,
      isGroupClique,
      connection.id,
      getAuthHeaders,
      appendReplyToMetadata,
    ],
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─────────────────────────── edit message ────────────────────────────────

  const startEdit = useCallback((messageId: string, currentContent: string) => {
    setReplyingTo(null);
    setEditingId(messageId);
    setEditText(currentContent);
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

    const wireContent =
      isGroupClique && groupMasterKey
        ? await encryptGroupMessageContent(newContent, groupMasterKey)
        : e2eKeys
          ? await encryptContent(newContent, e2eKeys)
          : newContent;
    const headers = await getAuthHeaders();
    const res = await fetch('/api/chat/messages', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ messageId: editingId, content: wireContent }),
    });

    if (!res.ok) {
      setMessages((prev) => prev.map((m) => (
        m.id === previous.id ? previous : m
      )));
    }
  }, [editingId, editText, getAuthHeaders, messages, e2eKeys, groupMasterKey, isGroupClique]);

  // ─────────────────────────── delete message ──────────────────────────────

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
  }, [getAuthHeaders, messages]);

  // ─────────────────────────── react ───────────────────────────────────────

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
    const res = await fetch('/api/chat/reactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messageId, reactionType: emoji }),
    });

    if (!res.ok) {
      setMessages((prev) => prev.map((message) => (
        message.id === messageId ? current : message
      )));
    }
  }, [currentUserId, getAuthHeaders, messages]);

  const confirmDeleteMessage = useCallback(async () => {
    if (!pendingDeleteMessageId) return;
    await deleteMessage(pendingDeleteMessageId);
    setPendingDeleteMessageId(null);
    setShowDeleteConfirm(false);
  }, [deleteMessage, pendingDeleteMessageId]);

  // ─────────────────────────── render ──────────────────────────────────────

  const otherInitial = otherUserName.charAt(0).toUpperCase();
  const headerTitle = isGroupClique ? (displayGroupName ?? otherUserName) : otherUserName;
  const metDate = connection.dateMet.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const timelineEntries = useMemo(() => buildTimelineEntries(messages), [messages]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-visible">
      {/* ── Header ── */}
      <div className="glass relative z-50 rounded-2xl mb-4 shrink-0 overflow-visible">
        {isGroupClique && groupKeyError ? (
          <div className="mx-4 mt-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
            {groupKeyError}
          </div>
        ) : null}
        <div className="flex items-center gap-4 px-5 py-4">
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            className="relative shrink-0 rounded-full border-0 bg-transparent p-0 cursor-pointer"
            onClick={() => peerUserId && onOpenProfile?.(peerUserId)}
            disabled={isGroupClique || !peerUserId || !onOpenProfile}
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF]
              text-sm font-bold glow-violet"
            >
              {isGroupClique ? <Users className="h-5 w-5 text-white" aria-hidden /> : otherInitial}
            </div>
            {!isGroupClique && peerIsOnline && (
              <span
                className="absolute bottom-0.5 right-0.5 block h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-zinc-950/90"
                aria-hidden
              />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="font-semibold text-white truncate text-lg min-w-0">{headerTitle}</p>
              {isGroupClique ? (
                <button
                  type="button"
                  onClick={() => {
                    setRenameGroupInput(headerTitle);
                    setShowRenameGroupModal(true);
                  }}
                  className="shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
                  aria-label="Rename group"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              ) : null}
            </div>
            {isGroupClique && groupHeaderSubtitle ? (
              <p className="text-xs text-zinc-400 mt-1 leading-snug line-clamp-2">{groupHeaderSubtitle}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0 text-zinc-500" /> {connection.location}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 shrink-0 text-zinc-500" /> {metDate}
                </span>
              </div>
            )}
          </div>

          {/* Connection / clique status badge */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              isGroupClique
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                : 'bg-[#8338EC]/10 border-[#8338EC]/20 text-[#8338EC]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                isGroupClique ? 'bg-emerald-400' : 'bg-[#8338EC]'
              }`}
            />
            {isGroupClique ? 'Verified clique' : 'Connected'}
          </div>

          {!isGroupClique ? (
            <div className="relative" ref={callMenuAnchorRef}>
              <button
                onClick={() => {
                  setShowCallMenu((prev) => !prev);
                  setShowHeaderMenu(false);
                }}
                className="p-2 rounded-xl hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
                aria-label="Call options"
              >
                <Phone className="w-5 h-5" />
              </button>

              {showCallMenu &&
                callMenuPos &&
                typeof document !== 'undefined' &&
                createPortal(
                  <>
                    <button
                      type="button"
                      aria-label="Dismiss menu"
                      className="fixed inset-0 z-[240] cursor-default bg-transparent"
                      onClick={() => setShowCallMenu(false)}
                    />
                    <div
                      className="fixed z-[250] min-w-[180px] rounded-[1.4rem] border border-zinc-700/80 bg-zinc-900 shadow-2xl overflow-hidden"
                      style={{ top: callMenuPos.top, left: callMenuPos.left }}
                    >
                      <button
                        onClick={() => {
                          setShowCallMenu(false);
                          onStartCall(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-zinc-800/90"
                      >
                        <Phone className="h-4 w-4" />
                        Voice call
                      </button>
                      <button
                        onClick={() => {
                          setShowCallMenu(false);
                          onStartCall(true);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-zinc-800/90"
                      >
                        <Video className="h-4 w-4" />
                        Video call
                      </button>
                    </div>
                  </>,
                  document.body,
                )}
            </div>
          ) : null}

          <div className="relative" ref={headerMenuAnchorRef}>
            <button
              type="button"
              onClick={() => {
                setShowHeaderMenu((prev) => !prev);
                setShowCallMenu(false);
              }}
              className="p-2 rounded-xl hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
              aria-label="Chat actions"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {showHeaderMenu &&
              headerMenuPos &&
              typeof document !== 'undefined' &&
              createPortal(
                <>
                  <button
                    type="button"
                    aria-label="Dismiss menu"
                    className="fixed inset-0 z-[240] cursor-default bg-transparent"
                    onClick={() => setShowHeaderMenu(false)}
                  />
                  <div
                    className="fixed z-[250] min-w-[180px] rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden"
                    style={{ top: headerMenuPos.top, left: headerMenuPos.left }}
                  >
                    {isGroupClique ? (
                      <>
                        <button
                          type="button"
                          disabled={groupMenuBusy}
                          onClick={async () => {
                            if (!window.confirm('Leave this verified click? You can rejoin only if someone adds you again.')) {
                              setShowHeaderMenu(false);
                              return;
                            }
                            const supabase = getSupabaseClient();
                            if (!supabase) return;
                            setGroupMenuBusy(true);
                            try {
                              await leaveCliqueRpc(supabase, connection.id);
                              setActionToast({ type: 'success', message: 'You left the group' });
                              setShowHeaderMenu(false);
                              onGroupChatChanged?.();
                              setTimeout(() => onClose(), 400);
                            } catch (e: unknown) {
                              setActionToast({
                                type: 'error',
                                message: e instanceof Error ? e.message : 'Could not leave group',
                              });
                            } finally {
                              setGroupMenuBusy(false);
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-2 disabled:opacity-40"
                        >
                          <LogOut className="w-4 h-4" /> Leave group
                        </button>
                        {groupCreatorId === currentUserId ? (
                          <button
                            type="button"
                            disabled={groupMenuBusy}
                            onClick={async () => {
                              if (!window.confirm('Permanently delete this verified click for everyone?')) {
                                setShowHeaderMenu(false);
                                return;
                              }
                              const supabase = getSupabaseClient();
                              if (!supabase) return;
                              setGroupMenuBusy(true);
                              try {
                                await deleteCliqueRpc(supabase, connection.id);
                                setActionToast({ type: 'success', message: 'Group deleted' });
                                setShowHeaderMenu(false);
                                onGroupChatChanged?.();
                                setTimeout(() => onClose(), 400);
                              } catch (e: unknown) {
                                setActionToast({
                                  type: 'error',
                                  message: e instanceof Error ? e.message : 'Could not delete group',
                                });
                              } finally {
                                setGroupMenuBusy(false);
                              }
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-zinc-800 flex items-center gap-2 disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4" /> Delete group
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {isArchived ? (
                          <button
                            type="button"
                            onClick={async () => {
                              const success = await onUnarchive();
                              const restored = connection.status === 'archived';
                              setActionToast(success
                                ? {
                                    type: 'success',
                                    message: restored ? 'Connection restored to active' : 'Conversation unarchived',
                                  }
                                : {
                                    type: 'error',
                                    message: restored
                                      ? 'Could not restore connection'
                                      : 'Could not unarchive conversation',
                                  }
                              );
                              setShowHeaderMenu(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-[#7cc3ff] hover:bg-zinc-800"
                          >
                            {connection.status === 'archived' ? 'Restore' : 'Unarchive'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              const success = await onArchive();
                              setActionToast(success
                                ? { type: 'success', message: 'Conversation archived' }
                                : { type: 'error', message: 'Could not archive conversation' }
                              );
                              setShowHeaderMenu(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <Archive className="w-4 h-4" /> Archive
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => { setShowReportDialog(true); setShowHeaderMenu(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-amber-300 hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <Flag className="w-4 h-4" /> Report
                        </button>

                        {isBlocked ? (
                          <button
                            type="button"
                            onClick={async () => {
                              const success = await onUnblock();
                              setActionToast(success
                                ? { type: 'success', message: 'User unblocked' }
                                : { type: 'error', message: 'Could not unblock user' }
                              );
                              setShowHeaderMenu(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-[#7cc3ff] hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <ShieldOff className="w-4 h-4" /> Unblock
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm(`Block ${otherUserName} and remove this connection?`)) {
                                setShowHeaderMenu(false);
                                return;
                              }
                              const success = await onBlock();
                              setActionToast(success
                                ? { type: 'success', message: 'User blocked and connection removed' }
                                : { type: 'error', message: 'Could not block user' }
                              );
                              if (success) {
                                setTimeout(() => onClose(), 700);
                              }
                              setShowHeaderMenu(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-zinc-800 flex items-center gap-2"
                          >
                            <Shield className="w-4 h-4" /> Block
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={async () => {
                            setShowHeaderMenu(false);
                            if (!window.confirm(`Remove your connection with ${otherUserName}?`)) {
                              return;
                            }
                            const success = await onRemove();
                            setActionToast(success
                              ? { type: 'success', message: 'Connection removed' }
                              : { type: 'error', message: 'Could not remove connection' }
                            );
                            if (success) {
                              setTimeout(() => onClose(), 700);
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-zinc-800 flex items-center gap-2"
                        >
                          <UserMinus className="w-4 h-4" /> Remove connection
                        </button>
                      </>
                    )}
                  </div>
                </>,
                document.body,
              )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {!isGroupClique && sharedInterestTags.length > 0 && (
          <motion.div
            key={`conversation-starters-${peerUserId ?? 'unknown'}`}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 32,
              mass: 0.85,
            }}
            className="glass mb-3 shrink-0 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 overflow-hidden"
          >
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05, duration: 0.25 }}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-200/90"
            >
              <motion.span
                initial={{ rotate: -12, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.08 }}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </motion.span>
              Conversation starters
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12, duration: 0.2 }}
              className="mt-1 text-[11px] text-zinc-500"
            >
              Shared interests — try weaving one into your next message
            </motion.p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sharedInterestTags.map((t, i) => (
                <motion.span
                  key={t}
                  initial={{ opacity: 0, y: 6, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 28,
                    delay: 0.14 + i * 0.045,
                  }}
                  className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-100"
                >
                  {t}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Messages area ── */}
      <div
        ref={messagesPanelRef}
        className="glass rounded-2xl flex-1 flex flex-col min-h-0 min-w-0 relative"
      >
        {/* Subtle gradient glow behind messages */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#8338EC] rounded-full blur-[160px] opacity-[0.04]" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#3A86FF] rounded-full blur-[160px] opacity-[0.04]" />
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 py-5 space-y-3 scrollbar-thin relative z-[1]"
        >
          {/* Load-more indicator */}
          {loadingMore && (
            <div className="flex justify-center py-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/60 border border-zinc-700/50">
                <Loader2 className="w-3.5 h-3.5 text-[#8338EC] animate-spin" />
                <span className="text-xs text-zinc-500">Loading older messages…</span>
              </div>
            </div>
          )}

          {/* Initial load */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
              <div className="p-4 rounded-2xl bg-[#8338EC]/5 border border-[#8338EC]/10">
                <Loader2 className="w-6 h-6 animate-spin text-[#8338EC]" />
              </div>
              <p className="text-sm">Loading messages…</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-3 text-red-400 text-sm py-8">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p>{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#8338EC]/20 to-[#3A86FF]/20 
                border border-[#8338EC]/20 flex items-center justify-center text-3xl glow-violet">
                👋
              </div>
              <div>
                <p className="font-semibold text-white text-lg">
                  {isGroupClique ? `Welcome to ${otherUserName}` : `Say hello to ${otherUserName}!`}
                </p>
                <p className="text-sm text-zinc-500 max-w-xs mt-1">
                  {isGroupClique ? (
                    <>
                      Everyone here is part of a <span className="text-emerald-400/95">mathematically verified</span>{' '}
                      clique — start the thread.
                    </>
                  ) : (
                    <>
                      You met at <span className="text-[#8338EC]">{connection.location}</span>. Start the conversation!
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
                      className="flex-1 bg-zinc-900/80 border border-[#8338EC] rounded-xl px-3 py-2 
                        text-sm focus:outline-none focus:ring-1 focus:ring-[#8338EC]/50 text-white"
                    />
                    <button
                      onClick={submitEdit}
                      className="px-3 py-2 bg-gradient-to-r from-[#8338EC] to-[#6520c0] rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditText(''); }}
                      className="px-3 py-2 glass rounded-xl text-sm hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              ) : (
                <MessageBubble
                  key={entry.message.id}
                  message={entry.message}
                  isMine={entry.message.user_id === currentUserId}
                  currentUserId={currentUserId}
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
                    className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF]
                    text-[10px] font-bold"
                  >
                    {isGroupClique ? '⋯' : otherInitial}
                  </div>
                  {!isGroupClique && peerIsOnline && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-zinc-950"
                      aria-hidden
                    />
                  )}
                </div>
                <div className="glass-panel rounded-2xl rounded-bl-sm px-4 py-2.5">
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-[#8338EC] rounded-full animate-bounce"
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

        {/* Scroll-to-bottom button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => scrollToBottom()}
              className="absolute right-5 bottom-20 bg-[#8338EC]/90 backdrop-blur-sm
                rounded-full p-2.5 shadow-lg hover:bg-[#8338EC] transition-colors z-10 glow-violet"
            >
              <ChevronDown className="w-4 h-4 text-white" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Input area (overflow visible so portaled pickers align; chrome stacks above messages) ── */}
      <div className="glass rounded-2xl mt-2 px-4 py-2 shrink-0 relative z-40 overflow-visible">
        {replyingTo && replyingTo.message_type !== 'call_log' && !editingId && (
          <div className="mb-2 flex w-full items-start gap-2 rounded-2xl border border-zinc-700/60 bg-zinc-900/50 px-3 py-2.5 text-xs">
            <span className="text-[#8338EC] font-medium shrink-0">Replying</span>
            <p className="text-zinc-400 line-clamp-2 flex-1 min-w-0">{replyBannerText}</p>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-zinc-500 hover:text-white shrink-0"
              aria-label="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex w-full items-end gap-2 sm:gap-3 min-w-0">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onPhotoSelected}
          />
          <div className="flex shrink-0 flex-row items-center gap-1.5">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={!chatId || sending || mediaBusy || isRecording}
              className="p-2.5 rounded-xl border border-zinc-700/60 bg-zinc-900/60 text-zinc-400 hover:text-[#8338EC] hover:border-[#8338EC]/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Attach photo"
            >
              {mediaBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
            </button>
            {!isRecording ? (
              <button
                type="button"
                onClick={() => void beginVoiceRecording()}
                disabled={!chatId || sending || mediaBusy}
                className="p-2.5 rounded-xl border border-zinc-700/60 bg-zinc-900/60 text-zinc-400 hover:text-[#8338EC] hover:border-[#8338EC]/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Record voice message"
              >
                <Mic className="w-4 h-4" />
              </button>
            ) : (
              <>
                <span className="text-[10px] font-mono text-red-400 tabular-nums min-w-[2.5rem] text-center">
                  {`${Math.floor(recordingMs / 60000)}:${String(Math.floor((recordingMs % 60000) / 1000)).padStart(2, '0')}`}
                </span>
                <button
                  type="button"
                  onClick={stopVoiceRecording}
                  className="p-2.5 rounded-xl bg-[#8338EC]/25 text-[#8338EC] border border-[#8338EC]/40"
                  title="Stop and send"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={cancelVoiceRecording}
                  className="p-2.5 rounded-xl border border-zinc-700/60 text-zinc-500 hover:text-white hover:bg-zinc-800"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          <div className="flex-1 flex items-center bg-zinc-900/60 border border-zinc-700/50 
            rounded-xl px-4 py-[7px] focus-within:border-[#8338EC]/50 transition-colors min-w-0">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                broadcastTyping();
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                isRecording
                  ? 'Optional caption…'
                  : isGroupClique
                    ? 'Message the group…'
                    : `Message ${otherUserName}…`
              }
              rows={1}
              className="w-full resize-none bg-transparent text-sm text-white placeholder-zinc-600 
                focus:outline-none leading-relaxed"
              style={{ minHeight: '24px', maxHeight: '120px' }}
            />
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={sendMessage}
            disabled={!inputText.trim() || sending || mediaBusy || isRecording}
            className="p-3 rounded-xl bg-gradient-to-br from-[#8338EC] to-[#6520c0] 
              hover:from-[#9b4dff] hover:to-[#7b30e0] disabled:opacity-30 
              disabled:cursor-not-allowed transition-all shrink-0 glow-violet"
          >
            {sending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </motion.button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1 text-left hidden sm:block">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-[92%] max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5"
            >
              <h3 className="text-base font-semibold text-white">Delete message?</h3>
              <p className="mt-2 text-sm text-zinc-400">This message will be removed permanently.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setPendingDeleteMessageId(null);
                  }}
                  className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteMessage}
                  className="px-3 py-2 rounded-xl bg-red-600 text-white hover:bg-red-500"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReportDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-[92%] max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-5"
            >
              <h3 className="text-base font-semibold text-white">Report connection</h3>
              <p className="mt-2 text-sm text-zinc-400">Describe what happened. This helps moderation review quickly.</p>
              <textarea
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                rows={4}
                className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#8338EC]"
                placeholder="Reason for report"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowReportDialog(false);
                    setReportReason('');
                  }}
                  className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const reason = reportReason.trim();
                    if (!reason) return;
                    if (!window.confirm('Submit this report for moderation review?')) {
                      return;
                    }
                    const success = await onReport(reason);
                    setActionToast(success
                      ? { type: 'success', message: 'Report submitted' }
                      : { type: 'error', message: 'Could not submit report' }
                    );
                    if (success) {
                      setShowReportDialog(false);
                      setReportReason('');
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-600 text-white hover:bg-amber-500"
                >
                  Submit report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRenameGroupModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-[92%] max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5"
            >
              <h3 className="text-base font-semibold text-white">Rename group</h3>
              <textarea
                value={renameGroupInput}
                onChange={(e) => setRenameGroupInput(e.target.value)}
                rows={2}
                className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#8338EC]"
                placeholder="Group name"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRenameGroupModal(false)}
                  className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!renameGroupInput.trim()}
                  onClick={async () => {
                    const supabase = getSupabaseClient();
                    if (!supabase) return;
                    const next = renameGroupInput.trim();
                    if (!next) return;
                    try {
                      await renameCliqueRpc(supabase, connection.id, next);
                      setDisplayGroupName(next);
                      setActionToast({ type: 'success', message: 'Group renamed' });
                      setShowRenameGroupModal(false);
                      onGroupChatChanged?.();
                    } catch (e: unknown) {
                      setActionToast({
                        type: 'error',
                        message: e instanceof Error ? e.message : 'Could not rename group',
                      });
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-[#8338EC] text-white hover:opacity-90 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionToast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div
              className={`rounded-xl border px-4 py-2.5 text-sm shadow-xl backdrop-blur-sm ${
                actionToast.type === 'success'
                  ? 'bg-emerald-600/90 border-emerald-400/40 text-white'
                  : 'bg-red-600/90 border-red-400/40 text-white'
              }`}
            >
              {actionToast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConversationDaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-800 to-zinc-700/80" />
      <span className="rounded-full border border-zinc-700/80 bg-zinc-950/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
        {label}
      </span>
      <div className="h-px flex-1 bg-gradient-to-r from-zinc-700/80 via-zinc-800 to-transparent" />
    </div>
  );
}
