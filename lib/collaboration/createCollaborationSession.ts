import type { SupabaseClient } from '@supabase/supabase-js';
import { computeCollaborationTtl } from '@/lib/collaboration/collaborationTtl';

export type CollaborationSessionCreated = {
  encounterId: string;
  collaborationTtl: string;
};

/**
 * Opens a Disposable Roll window for any connection bump (new or reconnect).
 * Independent of encounter rate limits — roll TTL is not tied to encounter logging.
 */
export async function createCollaborationSessionForConnection(
  adminClient: SupabaseClient,
  connectionId: string,
  participantUserIds: string[],
  timezoneOffsetMinutes: number = 0,
): Promise<CollaborationSessionCreated | null> {
  const connId = connectionId.trim();
  if (!connId) return null;

  const participants = [...new Set(participantUserIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (participants.length < 2) return null;

  const collaborationTtl = computeCollaborationTtl(timezoneOffsetMinutes);
  const encounterId = crypto.randomUUID();

  let chatId: string | null = null;
  const { data: chatRow } = await adminClient
    .from('chats')
    .select('id')
    .eq('connection_id', connId)
    .maybeSingle();
  if (chatRow?.id) chatId = String(chatRow.id);

  const { error } = await adminClient.from('collaboration_sessions').insert({
    id: encounterId,
    connection_id: connId,
    chat_id: chatId,
    collaboration_ttl: collaborationTtl,
    participant_user_ids: participants,
    notification_sent: false,
  });

  if (error) {
    console.warn('[collaboration_session]', error.message);
    return null;
  }

  return { encounterId, collaborationTtl };
}

export async function createCollaborationSessionForChat(
  adminClient: SupabaseClient,
  chatId: string,
  participantUserIds: string[],
  timezoneOffsetMinutes: number = 0,
): Promise<CollaborationSessionCreated | null> {
  const cid = chatId.trim();
  if (!cid) return null;

  const participants = [...new Set(participantUserIds.map((id) => id.trim()).filter(Boolean))].sort();
  if (participants.length < 2) return null;

  const collaborationTtl = computeCollaborationTtl(timezoneOffsetMinutes);
  const encounterId = crypto.randomUUID();

  const { error } = await adminClient.from('collaboration_sessions').insert({
    id: encounterId,
    connection_id: null,
    chat_id: cid,
    collaboration_ttl: collaborationTtl,
    participant_user_ids: participants,
    notification_sent: false,
  });

  if (error) {
    console.warn('[collaboration_session_chat]', error.message);
    return null;
  }

  return { encounterId, collaborationTtl };
}
