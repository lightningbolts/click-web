/**
 * Chat & Messaging types
 * Mirrors the Supabase schema: chats, messages, message_reactions
 */

/** public.users fields used when resolving display names in the web app */
export interface UserPublicRow {
  id: string;
  name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  birthday?: string | null;
  email?: string | null;
}

export interface Chat {
  id: string;
  connection_id: string;
  created_at: number;
  updated_at: number;
}

export type MessageType = 'text' | 'call_log';

export interface Message {
  id: string;
  chat_id: string;
  user_id: string;
  content: string;
  time_created: number;
  time_edited: number | null;
  is_read: boolean;
  message_type: MessageType;
  /** Server jsonb; call_log uses e.g. { call_state, duration_seconds } */
  metadata: any;
  /** client-side enrichment: reactions keyed by reaction_type */
  reactions?: Record<string, MessageReaction[]>;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction_type: string;
  created_at: number;
}

/** All emoji reactions allowed in the picker */
export const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👍', '🔥'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Realtime event payload shapes from Supabase */
export type RealtimeMessagePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Message;
  old: Partial<Message>;
};

export type RealtimeReactionPayload = {
  eventType: 'INSERT' | 'DELETE';
  new: MessageReaction;
  old: Partial<MessageReaction>;
};
