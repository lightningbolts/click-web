/**
 * Read/write reply metadata on messages (`reply_to_id`, `reply_to_content` in JSONB).
 */

export function getReplyFromMetadata(metadata: unknown): { id: string; snippet: string } | null {
  const m =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  if (!m) return null;
  const id = m.reply_to_id;
  if (typeof id !== 'string' || !id.trim()) return null;
  const snippet = m.reply_to_content;
  return {
    id,
    snippet: typeof snippet === 'string' ? snippet : '',
  };
}

export function replySnippetForSend(content: string, maxLen = 140): string {
  const oneLine = content.replace(/\n/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1).trimEnd()}…`;
}
