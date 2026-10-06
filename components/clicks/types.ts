import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';

/** A connection or verified group with its inbox metadata (preview, recency, unread, chat id). */
export type ChatListConnection = ConnectionRecord & {
  chatPreview: string | null;
  chatLastMessageAt: number | null;
  chatUpdatedAt: number | null;
  chatUnreadCount?: number;
  chatId?: string | null;
};
