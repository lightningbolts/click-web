export function highlightedMessageSnippet(
  content: string,
  query: string,
  maxLen = 140,
): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const needle = query.trim();
  if (!needle) return trimmed.slice(0, maxLen);
  const idx = trimmed.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return trimmed.slice(0, maxLen);
  const pad = 28;
  const start = Math.max(0, idx - pad);
  const end = Math.min(trimmed.length, idx + needle.length + 48);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < trimmed.length ? '…' : '';
  return `${prefix}${trimmed.slice(start, end)}${suffix}`.slice(0, maxLen);
}

/** Escape `%`, `_`, and `\` so PostgREST `ilike` treats them as literals. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export const CHAT_SEARCH_FOCUS_MS = 1800;

export type ChatSearchHit = {
  messageId: string;
  chatId: string;
  conversationId: string;
  connectionId: string;
  senderId: string;
  timestamp: number;
  snippet: string;
  chatName: string;
  isHub: boolean;
  hubId?: string;
  hubRealtimeChannel?: string;
};

export function mergeChatSearchHits(...lists: ChatSearchHit[][]): ChatSearchHit[] {
  const merged = new Map<string, ChatSearchHit>();
  for (const list of lists) {
    for (const hit of list) {
      merged.set(hit.messageId, hit);
    }
  }
  return [...merged.values()].sort((a, b) => b.timestamp - a.timestamp);
}
