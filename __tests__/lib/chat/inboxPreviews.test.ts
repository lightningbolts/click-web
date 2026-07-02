import { fetchInboxPreviews } from '@/lib/chat/inboxPreviews';

function mockSupabaseRpc(rows: unknown[] | null, error: { message: string } | null = null) {
  return {
    rpc: jest.fn().mockResolvedValue({ data: rows, error }),
  } as unknown as Parameters<typeof fetchInboxPreviews>[0];
}

describe('fetchInboxPreviews', () => {
  it('returns empty array when RPC returns null data', async () => {
    const supabase = mockSupabaseRpc(null);
    await expect(fetchInboxPreviews(supabase)).resolves.toEqual([]);
  });

  it('coerces valid rows and drops malformed entries', async () => {
    const supabase = mockSupabaseRpc([
      {
        chat_id: 'chat-1',
        connection_id: 'conn-1',
        last_message_id: 'msg-1',
        last_message_user_id: 'user-1',
        last_message_content: 'hello',
        last_message_time_created: 1_700_000_000_000,
        last_message_type: 'text',
        last_message_metadata: { reply_to_id: 'msg-0' },
        last_message_is_read: false,
        unread_count: 2,
      },
      { chat_id: null },
      { not_a_row: true },
    ]);

    await expect(fetchInboxPreviews(supabase)).resolves.toEqual([
      {
        chat_id: 'chat-1',
        connection_id: 'conn-1',
        last_message_id: 'msg-1',
        last_message_user_id: 'user-1',
        last_message_content: 'hello',
        last_message_time_created: 1_700_000_000_000,
        last_message_type: 'text',
        last_message_metadata: { reply_to_id: 'msg-0' },
        last_message_is_read: false,
        unread_count: 2,
      },
    ]);
    expect(supabase.rpc).toHaveBeenCalledWith('get_inbox_previews');
  });

  it('throws when RPC returns an error', async () => {
    const supabase = mockSupabaseRpc(null, { message: 'permission denied' });
    await expect(fetchInboxPreviews(supabase)).rejects.toThrow('permission denied');
  });
});
