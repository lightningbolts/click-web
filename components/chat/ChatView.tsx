'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Loader2, AlertCircle, ChevronDown, MapPin, Calendar } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Message } from '@/lib/chat/types';
import MessageBubble from './MessageBubble';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

interface ChatViewProps {
  connection: ConnectionRecord;
  currentUserId: string;
  /** Display name for the other participant */
  otherUserName: string;
  onClose: () => void;
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
export default function ChatView({ connection, currentUserId, otherUserName, onClose }: ChatViewProps) {
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
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const channelRef = useRef<ReturnType<typeof getSupabaseClient> extends null ? never : any>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PAGE_SIZE = 40;

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

  // ─────────────────────────── helpers ────────────────────────────────────

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const isNearBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // ─────────────────────────── init: get/create chat ───────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/chat?connectionId=${connection.id}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to load chat');
        setChatId(json.chat.id);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };
    init();
  }, [connection.id]);

  // ─────────────────────────── load messages ───────────────────────────────

  const fetchMessages = useCallback(async (id: string, cursor?: number) => {
    const params = new URLSearchParams({ chatId: id, limit: String(PAGE_SIZE) });
    if (cursor) params.set('cursor', String(cursor));

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/chat/messages?${params}`, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Failed to load messages');

    // API returns newest-first; reverse for display (oldest at top)
    const fetched: Message[] = (json.messages as Message[]).reverse();
    return fetched;
  }, []);

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
  }, [chatId, fetchMessages, scrollToBottom]);

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

    const channel = supabase
      .channel(`chat:${chatId}`)
      // New / updated / deleted messages
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload: any) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          if (eventType === 'INSERT') {
            const msg: Message = { ...newRow, reactions: {} };
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const updated = [...prev, msg];
              // Scroll only if user is near bottom
              if (isNearBottom()) setTimeout(() => scrollToBottom(), 60);
              return updated;
            });
          } else if (eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((m) => (m.id === newRow.id ? { ...m, ...newRow } : m))
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
                if (!list.some((r: any) => r.id === newRow.id)) {
                  reactions[newRow.reaction_type] = [...list, newRow];
                }
              } else if (eventType === 'DELETE' && oldRow.message_id === m.id) {
                const list = (reactions[oldRow.reaction_type] ?? []).filter(
                  (r: any) => r.id !== oldRow.id
                );
                if (list.length > 0) reactions[oldRow.reaction_type] = list;
                else delete reactions[oldRow.reaction_type];
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
  }, [chatId, currentUserId, scrollToBottom]);

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
    if (!content || !chatId || sending) return;

    setSending(true);
    setInputText('');
    inputRef.current?.focus();

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({ chatId, content }),
      });
      if (!res.ok) throw new Error('Send failed');
      // Realtime will push the new message via subscription
    } catch (err) {
      console.error('Send error:', err);
      setInputText(content); // restore
    } finally {
      setSending(false);
    }
  }, [inputText, chatId, sending]);

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
    setEditingId(messageId);
    setEditText(currentContent);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingId || !editText.trim()) return;

    const headers = await getAuthHeaders();
    const res = await fetch('/api/chat/messages', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ messageId: editingId, content: editText.trim() }),
    });
    if (res.ok) {
      // Realtime will handle UI update via UPDATE event
    }
    setEditingId(null);
    setEditText('');
  }, [editingId, editText]);

  // ─────────────────────────── delete message ──────────────────────────────

  const deleteMessage = useCallback(async (messageId: string) => {
    const headers = await getAuthHeaders();
    await fetch(`/api/chat/messages?messageId=${messageId}`, { method: 'DELETE', headers });
    // Realtime DELETE event will remove from UI
  }, [getAuthHeaders]);

  // ─────────────────────────── react ───────────────────────────────────────

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    const headers = await getAuthHeaders();
    await fetch('/api/chat/reactions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ messageId, reactionType: emoji }),
    });
    // Realtime handles UI
  }, [getAuthHeaders]);

  // ─────────────────────────── render ──────────────────────────────────────

  const otherInitial = otherUserName.charAt(0).toUpperCase();
  const metDate = connection.dateMet.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="glass rounded-2xl mb-4 shrink-0">
        <div className="flex items-center gap-4 px-5 py-4">
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] 
            flex items-center justify-center text-sm font-bold shrink-0 glow-violet">
            {otherInitial}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white truncate text-lg">{otherUserName}</p>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {connection.location}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {metDate}
              </span>
            </div>
          </div>

          {/* Connection status badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full 
            bg-[#8338EC]/10 border border-[#8338EC]/20 text-[#8338EC] text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8338EC] animate-pulse" />
            Connected
          </div>
        </div>
      </div>

      {/* ── Messages area ── */}
      <div className="glass rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden relative">
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
                <p className="font-semibold text-white text-lg">Say hello to {otherUserName}!</p>
                <p className="text-sm text-zinc-500 max-w-xs mt-1">
                  You met at <span className="text-[#8338EC]">{connection.location}</span>. Start the conversation!
                </p>
              </div>
            </div>
          )}

          {/* Message list */}
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              editingId === msg.id ? (
                /* Inline edit form */
                <motion.div
                  key={`edit-${msg.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`flex ${msg.user_id === currentUserId ? 'justify-end' : 'justify-start'}`}
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
                  key={msg.id}
                  message={msg}
                  isMine={msg.user_id === currentUserId}
                  currentUserId={currentUserId}
                  senderInitial={otherInitial}
                  onReact={handleReact}
                  onEdit={startEdit}
                  onDelete={deleteMessage}
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
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] 
                  flex items-center justify-center text-[10px] font-bold shrink-0">
                  {otherInitial}
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

      {/* ── Input area ── */}
      <div className="glass rounded-2xl mt-4 px-4 py-3 shrink-0">
        <div className="flex items-end gap-3">
          <div className="flex-1 flex items-center bg-zinc-900/60 border border-zinc-700/50 
            rounded-xl px-4 py-[7px] focus-within:border-[#8338EC]/50 transition-colors">
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
              placeholder={`Message ${otherUserName}…`}
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
            disabled={!inputText.trim() || sending}
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
        <p className="text-[10px] text-zinc-600 mt-2 text-left">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
