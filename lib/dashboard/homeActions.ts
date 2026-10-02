'use client';

import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { deriveKeysForConnection, encryptContent } from '@/lib/chat/crypto';
import { encryptWebE2eeV2Message, resolveWebE2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { hubRequest } from '@/lib/hub/client';
import { isActiveChatListStatus } from './connectionStatus';

/** Context prompts from mobile IcebreakerModels.kt. */
export function contextualIcebreaker(connection: ConnectionRecord): string {
  const context = `${connection.context ?? ''} ${connection.location}`.toLowerCase();
  if (/class|lecture|course|cse/.test(context)) return "What's your major? How are you liking the class so far?";
  if (/library|study|odegaard|suzzallo/.test(context)) return "What's your go-to study spot on campus?";
  if (/festival|fair|event|concert|show/.test(context)) return 'What was the best thing you saw/did at the event?';
  if (/club|meeting|organization/.test(context)) return 'How long have you been involved with this club/organization?';
  if (/gym|fitness|workout/.test(context)) return "Do you work out regularly? What's your gym routine like?";
  return 'Want to grab coffee sometime and chat more?';
}

export async function sendHomeIcebreaker(connection: ConnectionRecord, userId: string, text: string) {
  if (!isActiveChatListStatus(connection.status) || connection.chatKind === 'group_clique') throw new Error('Open an active direct chat to reconnect.');
  const participants = connection.userIds ?? (connection.otherUserId ? [userId, connection.otherUserId] : []);
  if (new Set(participants).size !== 2 || !participants.includes(userId)) throw new Error('This connection is not ready for messaging.');
  const { chat } = await hubRequest<{ chat: { id: string } }>(`/api/chat?connectionId=${encodeURIComponent(connection.id)}`);
  if (!chat?.id) throw new Error('The conversation could not be opened.');
  const session = await resolveWebE2eeV2Session({ chatId: chat.id, participantUserIds: participants, getAuthHeaders: getFreshAuthHeaders, allowUpgrade: true, forceRefresh: true });
  const encrypted = session ? await encryptWebE2eeV2Message(session, chat.id, text) : null;
  // Legacy direct chats still use pairwise encryption; a key-resolution error never sends plaintext.
  const content = encrypted?.wireContent ?? await encryptContent(text, await deriveKeysForConnection(connection.id, participants));
  await hubRequest('/api/chat/messages', { chatId: chat.id, connectionId: connection.id, content, local_sent_at: Date.now(), ...(encrypted ? { metadata: encrypted.metadata } : {}) });
}
