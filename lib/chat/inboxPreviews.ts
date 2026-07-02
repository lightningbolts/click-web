import type { SupabaseClient } from '@supabase/supabase-js';

export type InboxPreviewRow = {
  chat_id: string;
  connection_id: string | null;
  last_message_id: string | null;
  last_message_user_id: string | null;
  last_message_content: string | null;
  last_message_time_created: number | null;
  last_message_type: string | null;
  last_message_metadata: Record<string, unknown> | null;
  last_message_is_read: boolean;
  unread_count: number;
};

function coercePreviewRow(raw: Record<string, unknown>): InboxPreviewRow | null {
  const chatId = typeof raw.chat_id === 'string' ? raw.chat_id : null;
  if (!chatId) return null;
  return {
    chat_id: chatId,
    connection_id: typeof raw.connection_id === 'string' ? raw.connection_id : null,
    last_message_id: typeof raw.last_message_id === 'string' ? raw.last_message_id : null,
    last_message_user_id:
      typeof raw.last_message_user_id === 'string' ? raw.last_message_user_id : null,
    last_message_content:
      typeof raw.last_message_content === 'string' ? raw.last_message_content : null,
    last_message_time_created:
      typeof raw.last_message_time_created === 'number' && Number.isFinite(raw.last_message_time_created)
        ? raw.last_message_time_created
        : null,
    last_message_type: typeof raw.last_message_type === 'string' ? raw.last_message_type : null,
    last_message_metadata:
      raw.last_message_metadata != null &&
      typeof raw.last_message_metadata === 'object' &&
      !Array.isArray(raw.last_message_metadata)
        ? (raw.last_message_metadata as Record<string, unknown>)
        : null,
    last_message_is_read: Boolean(raw.last_message_is_read),
    unread_count:
      typeof raw.unread_count === 'number' && Number.isFinite(raw.unread_count)
        ? raw.unread_count
        : 0,
  };
}

/**
 * Batch inbox preview + unread counts for direct (connection) chats via `get_inbox_previews` RPC.
 */
export async function fetchInboxPreviews(
  supabase: SupabaseClient,
): Promise<InboxPreviewRow[]> {
  const { data, error } = await supabase.rpc('get_inbox_previews');
  if (error) {
    throw new Error(error.message);
  }
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => coercePreviewRow(row as Record<string, unknown>))
    .filter((row): row is InboxPreviewRow => row != null);
}
