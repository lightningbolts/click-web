/**
 * Read/write reply metadata on messages (`reply_to_id`, `reply_to_content` in JSONB).
 */

/**
 * Wire prefix for encrypted-attachment envelopes (see `lib/chat/attachmentCrypto`).
 * Chat list previews and reply snippets must never render the raw envelope JSON —
 * it's verbose and leaks key / hash material into the UI. [maskAttachmentEnvelope]
 * collapses it to a single 📎 Attachment marker.
 */
const ATTACHMENT_ENVELOPE_PREFIX = 'ccx:v1:';
const ATTACHMENT_PLACEHOLDER = '📎 Attachment';

export function maskAttachmentEnvelope(content: string): string {
  return content.startsWith(ATTACHMENT_ENVELOPE_PREFIX) ? ATTACHMENT_PLACEHOLDER : content;
}

export function getReplyFromMetadata(metadata: unknown): { id: string; snippet: string } | null {
  const m =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  if (!m) return null;
  const id = m.reply_to_id;
  if (typeof id !== 'string' || !id.trim()) return null;
  const snippet = m.reply_to_content;
  const rawSnippet = typeof snippet === 'string' ? snippet : '';
  return {
    id,
    snippet: maskAttachmentEnvelope(rawSnippet),
  };
}

export function replySnippetForSend(content: string, maxLen = 140): string {
  const masked = maskAttachmentEnvelope(content);
  const oneLine = masked.replace(/\n/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1).trimEnd()}…`;
}
