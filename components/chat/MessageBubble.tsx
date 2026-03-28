'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Trash2, SmilePlus, Check, Phone } from 'lucide-react';
import type { Message, MessageReaction } from '@/lib/chat/types';
import ReactionPicker from './ReactionPicker';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  currentUserId: string;
  /** Show the sender's first initial avatar */
  senderInitial?: string;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, currentContent: string) => void;
  onDelete: (messageId: string) => void;
}

function callLogLabel(metadata: unknown): { text: string; missed: boolean } {
  const m = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const state = typeof m.call_state === 'string' ? m.call_state : '';
  const rawDur = m.duration_seconds;
  const dur =
    typeof rawDur === 'number'
      ? rawDur
      : typeof rawDur === 'string'
        ? parseInt(rawDur, 10) || 0
        : 0;
  if (state === 'missed') return { text: 'Missed Voice Call', missed: true };
  if (state === 'declined') return { text: 'Declined Call', missed: false };
  if (state === 'completed') {
    const s = Math.max(0, Math.floor(dur));
    const min = Math.floor(s / 60);
    const sec = s % 60;
    const durLabel = min > 0 ? `${min}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;
    return { text: `Call Ended • ${durLabel}`, missed: false };
  }
  return { text: 'Call', missed: false };
}

function formatMessageTimeLabel(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * MessageBubble - renders a single chat message with reactions,
 * edit/delete controls, and a reaction picker.
 */
export default function MessageBubble({
  message,
  isMine,
  currentUserId,
  senderInitial = '?',
  onReact,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (message.message_type === 'call_log') {
    const { text, missed } = callLogLabel(message.metadata);
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
        className="flex w-full justify-center px-2 py-2"
      >
        <div
          className="inline-flex max-w-[90%] items-center gap-2 rounded-[20px] border border-zinc-700/60 bg-zinc-800/70 px-3.5 py-2 text-sm backdrop-blur-sm"
          role="status"
        >
          <Phone className={`h-4 w-4 shrink-0 ${missed ? 'text-red-400' : 'text-zinc-400'}`} aria-hidden />
          <span className={missed ? 'font-medium text-red-400' : 'font-medium text-zinc-300'}>{text}</span>
          <span className="text-[10px] text-zinc-500">{formatMessageTimeLabel(message.time_created)}</span>
        </div>
      </motion.div>
    );
  }

  const flatReactions: { emoji: string; count: number; iMine: boolean }[] = Object.entries(
    message.reactions ?? {}
  ).map(([emoji, users]) => ({
    emoji,
    count: (users as MessageReaction[]).length,
    iMine: (users as MessageReaction[]).some((r) => r.user_id === currentUserId),
  }));

  const myReactions = flatReactions.filter((r) => r.iMine).map((r) => r.emoji);

  const handleMouseEnter = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    setShowActions(true);
  };

  const handleMouseLeave = () => {
    hideTimeout.current = setTimeout(() => {
      setShowActions(false);
      setShowPicker(false);
    }, 300);
  };

  const timeLabel = formatMessageTimeLabel(message.time_created);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className={`flex items-end gap-2 group ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      {!isMine && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] 
          flex items-center justify-center text-xs font-bold shrink-0 mb-1 shadow-[0_0_12px_rgba(131,56,236,0.3)]">
          {senderInitial}
        </div>
      )}

      <div
        className={`relative max-w-[72%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Reaction picker */}
        <div className="relative">
          <ReactionPicker
            visible={showPicker}
            activeReactions={myReactions}
            onReact={(emoji) => {
              onReact(message.id, emoji);
              setShowPicker(false);
            }}
          />

          {/* Bubble */}
          <div
            className={`relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words
              ${isMine
                ? 'bg-gradient-to-br from-[#8338EC] to-[#6520c0] text-white rounded-br-sm shadow-[0_2px_16px_rgba(131,56,236,0.25)]'
                : 'glass-panel text-zinc-100 rounded-bl-sm'
              }`}
          >
            {message.content}
            {message.time_edited && (
              <span className="ml-2 text-[10px] opacity-60 italic">edited</span>
            )}
          </div>

          {/* Floating action bar */}
          {showActions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`absolute top-[-6px] flex items-center gap-1 
                glass rounded-full px-1.5 py-1 shadow-xl z-10
                ${isMine ? 'right-full mr-2' : 'left-full ml-2'}`}
            >
              {/* Reaction toggle */}
              <button
                onClick={() => setShowPicker((p) => !p)}
                className="p-1 rounded-full hover:bg-[#8338EC]/20 text-zinc-400 hover:text-[#8338EC] transition-colors"
                title="React"
              >
                <SmilePlus className="w-3.5 h-3.5" />
              </button>
              {isMine && (
                <>
                  <button
                    onClick={() => onEdit(message.id, message.content)}
                    className="p-1 rounded-full hover:bg-[#3A86FF]/20 text-zinc-400 hover:text-[#3A86FF] transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(message.id)}
                    className="p-1 rounded-full hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </motion.div>
          )}
        </div>

        {/* Reactions row */}
        {flatReactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {flatReactions.map(({ emoji, count, iMine: active }) => (
              <button
                key={emoji}
                onClick={() => onReact(message.id, emoji)}
                className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full 
                  border transition-colors
                  ${active
                    ? 'bg-[#8338EC]/20 border-[#8338EC]/50 text-[#8338EC]'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  }`}
              >
                <span>{emoji}</span>
                <span className="font-medium">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Timestamp & read receipt */}
        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-zinc-600">{timeLabel}</span>
          {isMine && message.is_read && (
            <Check className="w-3 h-3 text-[#8338EC]" />
          )}
        </div>
      </div>
    </motion.div>
  );
}
