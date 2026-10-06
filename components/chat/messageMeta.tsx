'use client';

import { Check, CheckCheck, Clock, Pin } from 'lucide-react';
import { isClientOptimisticMessageId } from '@/lib/chat/clientOptimistic';
import type { Message } from '@/lib/chat/types';
import { cn } from '@/lib/cn';

/** The six quick reactions in the action bar (spec §7.2). */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

export type DeliveryState = 'pending' | 'sent' | 'delivered' | 'read';

function metaRecord(message: Message): Record<string, unknown> {
  const m = message.metadata;
  return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

export function deliveryState(message: Message): DeliveryState {
  // `read_at` only: optimistic rows once set `is_read: true` by mistake.
  if (message.read_at != null && Number.isFinite(Number(message.read_at))) return 'read';
  if (message.delivered_at != null && Number.isFinite(Number(message.delivered_at))) return 'delivered';
  if (metaRecord(message)._webPostAck === true || !isClientOptimisticMessageId(message.id)) return 'sent';
  return 'pending';
}

export function formatMessageTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function callLogLabel(message: Message): { text: string; missed: boolean } {
  const m = metaRecord(message);
  const state = typeof m.call_state === 'string' ? m.call_state : '';
  const raw = m.duration_seconds;
  const dur = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) || 0 : 0;
  if (state === 'missed') return { text: 'Missed voice call', missed: true };
  if (state === 'declined') return { text: 'Declined call', missed: false };
  if (state === 'completed') {
    const s = Math.max(0, Math.floor(dur));
    const min = Math.floor(s / 60);
    return { text: `Call ended · ${min > 0 ? `${min}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`}`, missed: false };
  }
  return { text: 'Call', missed: false };
}

export function isSafeMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'blob:';
  } catch {
    return false;
  }
}

const RECEIPT_LABEL: Record<DeliveryState, string> = {
  pending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

/**
 * Time, edited, pinned and (for your messages) the receipt (spec §7.2). `tone` picks colours
 * for where it sits: on your bubble, on theirs, or over media.
 */
export function MessageMeta({
  message,
  mine,
  pinned,
  tone,
  className,
}: {
  message: Message;
  mine: boolean;
  pinned: boolean;
  tone: 'out' | 'in' | 'media' | 'plain';
  className?: string;
}) {
  const state = mine ? deliveryState(message) : null;
  const toneClass =
    tone === 'out' ? 'text-white/70' : tone === 'media' ? 'text-white' : 'text-fg-tertiary';
  return (
    <span className={cn('type-badge tabular inline-flex items-center gap-1 whitespace-nowrap', toneClass, className)}>
      {pinned ? <Pin size={11} aria-label="Pinned" /> : null}
      {message.time_edited ? <span>Edited</span> : null}
      <time dateTime={new Date(message.time_created).toISOString()}>{formatMessageTime(message.time_created)}</time>
      {state ? (
        <span title={RECEIPT_LABEL[state]} aria-label={RECEIPT_LABEL[state]} className={cn('inline-flex', state === 'read' && 'text-read-receipt')}>
          {state === 'pending' ? (
            <Clock size={12} aria-hidden />
          ) : state === 'sent' ? (
            <Check size={13} strokeWidth={2.5} aria-hidden />
          ) : (
            <CheckCheck size={13} strokeWidth={2.5} aria-hidden />
          )}
        </span>
      ) : null}
    </span>
  );
}
