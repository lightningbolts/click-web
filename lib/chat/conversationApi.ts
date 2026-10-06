/**
 * Browser clients for per-conversation features that already exist on the BFF and on iOS:
 * notification mutes (`/api/chat/notifications`), pinned messages (`/api/chat/pins`),
 * scheduled messages (`/api/chat/scheduled`), and hangout confirmations (`/api/hangouts`).
 */
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : typeof payload.error === 'string'
          ? payload.error
          : `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json().catch(() => ({}))) as T;
}

// ── Unread ─────────────────────────────────────────────────────────────────

/** Marks the latest peer message unread on every device (iOS `ChatRepository.markUnread`). */
export async function markChatUnread(chatId: string): Promise<void> {
  await requestJson('/api/chat/messages/unread', { method: 'PATCH', body: JSON.stringify({ chat_id: chatId }) });
}

// ── Mutes ──────────────────────────────────────────────────────────────────

export const CHAT_MUTES_KEY = '/api/chat/notifications';

export type ChatMute = { chat_id: string; muted_until: string | null };

export async function fetchChatMutes(): Promise<ChatMute[]> {
  const data = await requestJson<{ mutes?: ChatMute[] }>(CHAT_MUTES_KEY);
  return Array.isArray(data.mutes) ? data.mutes : [];
}

/** Durations offered by iOS `MuteMenu`; `null` = until turned back on. */
export const MUTE_OPTIONS: { label: string; ms: number | null }[] = [
  { label: 'For 1 hour', ms: 60 * 60 * 1000 },
  { label: 'For 8 hours', ms: 8 * 60 * 60 * 1000 },
  { label: 'For 1 week', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Until I turn it back on', ms: null },
];

export async function setChatMute(chatId: string, muted: boolean, durationMs: number | null): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, muted };
  if (muted && durationMs != null) body.muted_until = new Date(Date.now() + durationMs).toISOString();
  await requestJson(CHAT_MUTES_KEY, { method: 'PUT', body: JSON.stringify(body) });
}

/** Active mute for any of the ids a conversation may be stored under (chat id, connection id). */
export function activeMute(mutes: readonly ChatMute[] | undefined, ids: readonly (string | null | undefined)[], now = Date.now()): ChatMute | null {
  if (!mutes?.length) return null;
  const wanted = new Set(ids.filter((id): id is string => Boolean(id)));
  return (
    mutes.find(
      (m) => wanted.has(m.chat_id) && (m.muted_until == null || Date.parse(m.muted_until) > now),
    ) ?? null
  );
}

export function muteStatusLabel(mute: ChatMute | null): string {
  if (!mute) return 'On';
  if (!mute.muted_until) return 'Muted';
  const until = new Date(mute.muted_until);
  return `Muted until ${until.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
}

// ── Pins ───────────────────────────────────────────────────────────────────

export type MessagePin = { message_id: string; pinned_by: string; pinned_at: string };

export async function fetchPins(chatId: string): Promise<MessagePin[]> {
  const data = await requestJson<{ pins?: MessagePin[] }>(`/api/chat/pins?chatId=${encodeURIComponent(chatId)}`);
  return Array.isArray(data.pins) ? data.pins : [];
}

export async function setMessagePinned(messageId: string, pinned: boolean): Promise<void> {
  await requestJson('/api/chat/pins', {
    method: pinned ? 'POST' : 'DELETE',
    body: JSON.stringify({ messageId }),
  });
}

// ── Scheduled messages ─────────────────────────────────────────────────────

export type ScheduledRow = {
  id: string;
  chat_id: string;
  content: string;
  message_type: string;
  metadata: Record<string, unknown> | null;
  send_at: number;
};

export async function fetchScheduled(chatId: string): Promise<ScheduledRow[]> {
  const data = await requestJson<{ scheduled?: ScheduledRow[] }>(
    `/api/chat/scheduled?chatId=${encodeURIComponent(chatId)}`,
  );
  return Array.isArray(data.scheduled) ? data.scheduled : [];
}

export async function createScheduled(body: Record<string, unknown>): Promise<ScheduledRow> {
  const data = await requestJson<{ scheduled: ScheduledRow }>('/api/chat/scheduled', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data.scheduled;
}

export async function cancelScheduled(id: string): Promise<void> {
  await requestJson(`/api/chat/scheduled?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Hangouts ───────────────────────────────────────────────────────────────

export const PENDING_HANGOUTS_KEY = '/api/hangouts';

export type PendingHangout = {
  id: string;
  connection_id: string;
  peer_user_id: string | null;
  source: string;
  status: string;
  occurred_at: string;
  location_name: string | null;
  confirmed_by_me: boolean;
  requested_by_me: boolean;
  expires_at: string;
};

export async function fetchPendingHangouts(): Promise<PendingHangout[]> {
  const data = await requestJson<{ hangouts?: PendingHangout[] }>(PENDING_HANGOUTS_KEY);
  return Array.isArray(data.hangouts) ? data.hangouts : [];
}

export async function logHangout(connectionId: string, locationName: string | null): Promise<PendingHangout> {
  const data = await requestJson<{ hangout: PendingHangout }>(PENDING_HANGOUTS_KEY, {
    method: 'POST',
    body: JSON.stringify({ connection_id: connectionId, ...(locationName ? { location_name: locationName } : {}) }),
  });
  return data.hangout;
}

export async function respondToHangout(id: string, confirm: boolean): Promise<void> {
  await requestJson(`/api/hangouts/${encodeURIComponent(id)}/${confirm ? 'confirm' : 'decline'}`, { method: 'POST' });
}
