/** `metadata.drop_reply` on a chat message that answers a shared drop (iOS `ChatDropReply`). */
export type DropReplyMeta = { kind: 'shared'; id: string; reaction: boolean };

export function dropReplyFromMetadata(metadata: unknown): DropReplyMeta | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).drop_reply;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { kind, id, reaction } = raw as Record<string, unknown>;
  return kind === 'shared' && typeof id === 'string' && id ? { kind, id, reaction: reaction === true } : null;
}
