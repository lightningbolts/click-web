import { highlightedMessageSnippet, type ChatSearchHit } from '@/lib/chat/searchSnippet';
import { hubCreatedAtToMs, hubRealtimeChannel } from '@/lib/hub/hubThread';

export type ChatRow = {
  id: string;
  connection_id: string | null;
  group_id: string | null;
};

export function hubCreatedAtToSearchMs(value: unknown): number {
  return hubCreatedAtToMs(value);
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
