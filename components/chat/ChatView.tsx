'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
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
        const res = await fetch(`/api/chat?connectionId=${connection.id}`);
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

    const res = await fetch(`/api/chat/messages?${params}`);
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
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    const res = await fetch('/api/chat/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
    await fetch(`/api/chat/messages?messageId=${messageId}`, { method: 'DELETE' });
    // Realtime DELETE event will remove from UI
  }, []);

  // ─────────────────────────── react ───────────────────────────────────────

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    await fetch('/api/chat/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, reactionType: emoji }),
    });
    // Realtime handles UI
  }, []);

  // ─────────────────────────── render ──────────────────────────────────────

  const otherInitial = otherUserName.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="flex flex-col h-full bg-zinc-950 rounded-3xl border border-zinc-800 overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-sm shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] 
          flex items-center justify-center text-sm font-bold shrink-0">
          {otherInitial}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{otherUserName}</p>
          <p className="text-xs text-zinc-500 truncate">{connection.location}</p>
        </div>

        {/* Connection badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full 
          bg-[#8338EC]/10 border border-[#8338EC]/20 text-[#8338EC] text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8338EC] animate-pulse" />
          Connected
        </div>
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth"
      >
        {/* Load-more indicator */}
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
          </div>
        )}

        {/* Initial load */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading messages…</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm justify-center py-6">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8338EC]/20 to-[#3A86FF]/20 
              border border-[#8338EC]/20 flex items-center justify-center text-2xl">
              👋
            </div>
            <p className="font-semibold text-white">Say hello to {otherUserName}!</p>
            <p className="text-sm text-zinc-500 max-w-xs">
              You met at <span className="text-zinc-300">{connection.location}</span>. Break the ice!
            </p>
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
                    className="flex-1 bg-zinc-800 border border-[#8338EC] rounded-xl px-3 py-2 
                      text-sm focus:outline-none text-white"
                  />
                  <button
                    onClick={submitEdit}
                    className="px-3 py-2 bg-[#8338EC] rounded-xl text-sm font-medium hover:bg-[#9d4eff] transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setEditText(''); }}
                    className="px-3 py-2 bg-zinc-800 rounded-xl text-sm hover:bg-zinc-700 transition-colors"
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
              className="flex items-center gap-2 text-xs text-zinc-500"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] 
                flex items-center justify-center text-xs font-bold shrink-0">
                {otherInitial}
              </div>
              <div className="bg-zinc-800 border border-zinc-700 rounded-2xl rounded-bl-sm px-3 py-2">
                <span className="inline-flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 120}ms` }}
                    />
                  ))}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => scrollToBottom()}
            className="absolute right-6 bottom-24 bg-zinc-800 border border-zinc-700 
              rounded-full p-2 shadow-lg hover:bg-zinc-700 transition-colors z-10"
          >
            <ChevronDown className="w-4 h-4 text-zinc-300" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Input ── */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/60 backdrop-blur-sm px-4 py-3">
        <div className="flex items-end gap-2 bg-zinc-800 border border-zinc-700 
          rounded-2xl px-3 py-2 focus-within:border-[#8338EC] transition-colors">
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
            className="flex-1 resize-none bg-transparent text-sm text-white placeholder-zinc-600 
              focus:outline-none leading-relaxed"
            style={{ minHeight: '24px', maxHeight: '120px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || sending}
            className="p-2 rounded-xl bg-[#8338EC] hover:bg-[#9d4eff] disabled:opacity-40 
              disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {sending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1.5 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </motion.div>
  );
}
