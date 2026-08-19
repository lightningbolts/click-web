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
