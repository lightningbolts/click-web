import { highlightedMessageSnippet, type ChatSearchHit } from '@/lib/chat/searchSnippet';
import { isAnyE2eeWireContent } from '@/lib/chat/crypto';
import { hubCreatedAtToMs, hubRealtimeChannel } from '@/lib/hub/hubThread';

export type ChatRow = {
  id: string;
  connection_id: string | null;
  group_id: string | null;
};

export function hubCreatedAtToSearchMs(value: unknown): number {
  return hubCreatedAtToMs(value);
}

/** Ciphertext must not be ILIKE-indexed or shown as a search snippet. */
export function isSearchablePlaintextBody(content: string): boolean {
  return content.trim().length > 0 && !isAnyE2eeWireContent(content.trim());
}

export function toDirectChatSearchHit(args: {
  messageId: string;
  chat: ChatRow;
  senderId: string;
  timestamp: number;
  content: string;
  query: string;
  chatName: string;
}): ChatSearchHit {
  const conversationId = args.chat.group_id ?? args.chat.connection_id ?? args.chat.id;
  return {
    messageId: args.messageId,
    chatId: args.chat.id,
    conversationId,
    connectionId: args.chat.connection_id ?? args.chat.group_id ?? args.chat.id,
    senderId: args.senderId,
    timestamp: args.timestamp,
    snippet: highlightedMessageSnippet(args.content, args.query),
    chatName: args.chatName,
    isHub: false,
  };
}

export function toHubChatSearchHit(args: {
  messageId: string;
  hubId: string;
  senderId: string;
  createdAt: unknown;
  body: string;
  query: string;
  chatName: string;
}): ChatSearchHit {
  const hubId = args.hubId;
  return {
    messageId: args.messageId,
    chatId: hubId,
    conversationId: hubId,
    connectionId: hubId,
    senderId: args.senderId,
    timestamp: hubCreatedAtToMs(args.createdAt),
    snippet: highlightedMessageSnippet(args.body, args.query),
    chatName: args.chatName,
    isHub: true,
    hubId,
    hubRealtimeChannel: hubRealtimeChannel(hubId),
  };
}
