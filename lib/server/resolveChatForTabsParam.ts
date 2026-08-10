/**
 * Resolve a tabs-route dynamic segment to a chat row.
 * Accepts chat id, 1:1 connection id, or group id.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

type LooseSupabase = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{ data: unknown }>;
      };
    };
  };
};

export async function resolveChatForTabsParam(
  supabase: LooseSupabase,
  paramId: string,
): Promise<{ chatId: string; connectionId: string | null } | null> {
  const { data: chatRow } = await supabase
    .from('chats')
    .select('id, connection_id')
    .eq('id', paramId)
    .maybeSingle();
  if (isRecord(chatRow) && typeof chatRow.id === 'string') {
    return {
      chatId: chatRow.id,
      connectionId: typeof chatRow.connection_id === 'string' ? chatRow.connection_id : null,
    };
  }

  const { data: byConn } = await supabase
    .from('chats')
    .select('id, connection_id')
    .eq('connection_id', paramId)
    .maybeSingle();
  if (isRecord(byConn) && typeof byConn.id === 'string') {
    return {
      chatId: byConn.id,
      connectionId:
        typeof byConn.connection_id === 'string' ? byConn.connection_id : paramId,
    };
  }

  const { data: byGroup } = await supabase
    .from('chats')
    .select('id, connection_id, group_id')
    .eq('group_id', paramId)
    .maybeSingle();
  if (isRecord(byGroup) && typeof byGroup.id === 'string') {
    return {
      chatId: byGroup.id,
      connectionId: typeof byGroup.connection_id === 'string' ? byGroup.connection_id : null,
    };
  }
  return null;
}
