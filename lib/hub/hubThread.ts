import { mergeAroundTargetMessages } from '@/lib/chat/aroundMessage';

export const HUB_THREAD_LIMIT = 120;
export const HUB_AROUND_WINDOW = 40;

export function hubRealtimeChannel(hubId: string): string {
  const id = hubId.trim();
  if (!id) return '';
  return id.startsWith('hub:') ? id : `hub:${id}`;
}

export function hubCreatedAtToMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

export type HubThreadMessage = {
  id: string;
  hub_id: string;
  user_id: string;
  body: string;
  created_at: string;
  message_type: string;
  metadata: unknown;
};

export function normalizeHubMessageRow(row: Record<string, unknown> | null | undefined): HubThreadMessage | null {
  if (!row) return null;
  const id = typeof row.id === 'string' ? row.id : '';
  const hubId = typeof row.hub_id === 'string' ? row.hub_id : '';
  const userId = typeof row.user_id === 'string' ? row.user_id : '';
  if (!id || !hubId) return null;
  return {
    id,
    hub_id: hubId,
    user_id: userId,
    body: typeof row.body === 'string' ? row.body : '',
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    message_type: typeof row.message_type === 'string' && row.message_type.trim() ? row.message_type : 'text',
    metadata: row.metadata ?? {},
  };
}

export function mergeHubThreadWindow(args: {
  olderOrEqual: HubThreadMessage[];
  newer: HubThreadMessage[];
  target: HubThreadMessage | null;
}): HubThreadMessage[] {
  return mergeAroundTargetMessages(args.olderOrEqual, args.newer, args.target).sort(
    (a, b) => hubCreatedAtToMs(a.created_at) - hubCreatedAtToMs(b.created_at),
  );
}
