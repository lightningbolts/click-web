import type { Message } from '@/lib/chat/types';

export type ChatTimelineEntry =
  | { kind: 'separator'; key: string; label: string }
  | { kind: 'message'; message: Message };

export function getDayStart(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function formatConversationDayLabel(timestamp: number) {
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

export function buildTimelineEntries(messages: Message[]): ChatTimelineEntry[] {
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

/** Messages from one sender within this gap read as one run (spec §7.2). */
export const RUN_GAP_MS = 5 * 60 * 1000;

/**
 * For each message, whether it starts and/or ends a run of consecutive messages from the same
 * sender on the same day. Call logs break runs.
 */
export function messageRuns(messages: Message[]): Map<string, { first: boolean; last: boolean }> {
  const out = new Map<string, { first: boolean; last: boolean }>();
  const joins = (a: Message | undefined, b: Message | undefined) =>
    !!a &&
    !!b &&
    a.user_id === b.user_id &&
    a.message_type !== 'call_log' &&
    b.message_type !== 'call_log' &&
    getDayStart(a.time_created) === getDayStart(b.time_created) &&
    Math.abs(b.time_created - a.time_created) <= RUN_GAP_MS;
  messages.forEach((m, i) => {
    out.set(m.id, { first: !joins(messages[i - 1], m), last: !joins(m, messages[i + 1]) });
  });
  return out;
}
