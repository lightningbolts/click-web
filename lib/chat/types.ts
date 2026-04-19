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
  connection_id?: string | null;
  group_id?: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Aligned with `public.messages.message_type` (lowercase text column) and KMP `ChatMessageType`.
 */
export type MessageType = 'text' | 'image' | 'audio' | 'file' | 'call_log';

/** Structured fields stored in `messages.metadata` for media (matches mobile `MessageMediaMetadata`). */
export interface MessageMediaMetadata {
  media_url?: string;
  /** True when [media_url] points at ciphertext bytes (KMP gatekeeper upload). */
  is_encrypted_media?: boolean;
  /** Original MIME before encryption (e.g. image/jpeg) — not sent to storage. */
  original_mime_type?: string;
  /** Voice note length in seconds (optional). */
  duration_seconds?: number;
  /** Reply threading (existing). */
  reply_to_id?: string;
  reply_to_content?: string;
  /** Call log / other keys remain loose. */
  [key: string]: unknown;
}

export interface Message {
  id: string;
  chat_id: string;
  user_id: string;
  content: string;
  time_created: number;
  time_edited: number | null;
  is_read: boolean;
  /** Client device clock when the row was queued (ms since epoch). */
  local_sent_at?: number | null;
  /** When the recipient marked this row read (ms since epoch). */
  read_at?: number | null;
  message_type: MessageType;
  /** Server jsonb: media uses `media_url`, `duration_seconds`; call_log uses call_state, etc. */
  metadata: MessageMediaMetadata;
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

/** Quick reactions in the compact strip; use + for the full picker. */
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
