/**
 * Browser client for event chat, which is a Community Hub linked to the event beacon.
 * Same routes and wire format as iOS `ChatRepository` hub transport: resolve the canonical
 * hub (`GET /api/beacons/{id}/event-chat`), read `GET /api/hub/messages`, send
 * `POST /api/hub/messages` (E2EE v2 once the hub has an epoch; the server gate enforces it).
 * Event hubs authorize by RSVP, so no geofence coordinates are sent (never faked).
 */
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { decryptContent, deriveKeysForHub, isEncrypted } from '@/lib/chat/crypto';
import {
  decryptWebE2eeV2Message,
  encryptWebE2eeV2Message,
  resolveWebE2eeV2Session,
  type E2eeV2Session,
} from '@/lib/chat/e2eeV2Client';
import { hubCreatedAtToMs, normalizeHubMessageRow, type HubThreadMessage } from '@/lib/hub/hubThread';

export type EventChatTarget = { hubId: string; title: string; creatorId: string | null };

export type EventChatResolveError = 'unauthorized' | 'forbidden' | 'expired' | 'not_ready' | 'failed';

export class EventChatError extends Error {
  constructor(readonly code: EventChatResolveError, message: string) {
    super(message);
  }
}

export async function resolveEventChat(beaconId: string): Promise<EventChatTarget> {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(`/api/beacons/${encodeURIComponent(beaconId)}/event-chat`, { headers });
  const json = (await res.json().catch(() => ({}))) as {
    hub_id?: string;
    title?: string;
    creator_id?: string | null;
    message?: string;
    error?: string;
  };
  if (!res.ok || !json.hub_id) {
    const code: EventChatResolveError =
      res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : res.status === 410 ? 'expired' : res.status === 409 ? 'not_ready' : 'failed';
    throw new EventChatError(code, json.message || 'Could not open this event chat.');
  }
  return { hubId: json.hub_id, title: json.title || 'Event', creatorId: json.creator_id ?? null };
}

export type HubChatMessage = {
  id: string;
  userId: string;
  text: string;
  messageType: string;
  createdAt: number;
  edited: boolean;
  /** Reaction emoji → user ids. */
  reactions: Record<string, string[]>;
  pending?: boolean;
};

export type HubTimeline = {
  messages: HubChatMessage[];
  participantIds: string[];
  occupantCount: number;
};

function mediaLabel(messageType: string): string | null {
  const t = messageType.toLowerCase();
  if (t === 'image' || t === 'photo') return 'Photo';
  if (t === 'audio' || t === 'voice') return 'Voice note';
  if (t === 'system') return null;
  return null;
}

/** Decrypts one hub body on this device; unreadable ciphertext becomes a neutral label. */
export async function decryptHubBody(
  hubId: string,
  body: string,
  messageType: string,
  session: E2eeV2Session | null,
): Promise<string> {
  const label = mediaLabel(messageType);
  if (label) return label;
  try {
    if (body.startsWith('e2e2:')) {
      return session ? await decryptWebE2eeV2Message(session, body) : 'Message';
    }
    if (isEncrypted(body)) {
      return await decryptContent(body, await deriveKeysForHub(hubId));
    }
  } catch {
    return 'Message';
  }
  return body;
}

export async function hubSession(hubId: string, participantIds: string[], allowUpgrade = false) {
  return resolveWebE2eeV2Session({
    chatId: hubId,
    scope: 'hub',
    participantUserIds: participantIds,
    getAuthHeaders: getFreshAuthHeaders,
    allowUpgrade,
    forceRefresh: allowUpgrade,
  }).catch(() => null);
}

function groupReactions(rows: Record<string, unknown>[]): Map<string, Record<string, string[]>> {
  const out = new Map<string, Record<string, string[]>>();
  for (const row of rows) {
    const messageId = typeof row.hub_message_id === 'string' ? row.hub_message_id : null;
    const type = typeof row.reaction_type === 'string' ? row.reaction_type : null;
    const user = typeof row.user_id === 'string' ? row.user_id : null;
    if (!messageId || !type || !user) continue;
    const forMessage = out.get(messageId) ?? {};
    forMessage[type] = [...(forMessage[type] ?? []), user];
    out.set(messageId, forMessage);
  }
  return out;
}

export async function toHubChatMessage(
  row: HubThreadMessage,
  session: E2eeV2Session | null,
  reactions: Record<string, string[]> = {},
): Promise<HubChatMessage> {
  return {
    id: row.id,
    userId: row.user_id,
    text: await decryptHubBody(row.hub_id, row.body, row.message_type, session),
    messageType: row.message_type,
    createdAt: hubCreatedAtToMs(row.created_at),
    edited: row.edited_at != null,
    reactions,
  };
}

export async function fetchHubTimeline(hubId: string): Promise<HubTimeline> {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(`/api/hub/messages?hubId=${encodeURIComponent(hubId)}&limit=120`, { headers });
  if (!res.ok) throw new Error('Could not load the event chat.');
  const json = (await res.json()) as {
    messages?: Record<string, unknown>[];
    reactions?: Record<string, unknown>[];
    participant_ids?: string[];
    occupant_count?: number;
  };
  const rows = (json.messages ?? [])
    .map((r) => normalizeHubMessageRow(r))
    .filter((r): r is HubThreadMessage => r != null);
  const participantIds = Array.isArray(json.participant_ids) ? json.participant_ids : [];
  const session = rows.some((r) => r.body.startsWith('e2e2:')) ? await hubSession(hubId, participantIds) : null;
  const reactionMap = groupReactions(json.reactions ?? []);
  const messages = await Promise.all(rows.map((r) => toHubChatMessage(r, session, reactionMap.get(r.id))));
  return {
    messages: messages.sort((a, b) => a.createdAt - b.createdAt),
    participantIds,
    occupantCount: typeof json.occupant_count === 'number' ? json.occupant_count : participantIds.length,
  };
}

/** Sends a text message, encrypted with the hub's v2 epoch when it has one. */
export async function sendHubText(hubId: string, text: string, participantIds: string[]): Promise<HubThreadMessage> {
  const clientMessageId = crypto.randomUUID();
  const session = await hubSession(hubId, participantIds, true);
  let body = text;
  let metadata: Record<string, unknown> = { client_message_id: clientMessageId };
  if (session) {
    const encrypted = await encryptWebE2eeV2Message(session, hubId, text, clientMessageId);
    body = encrypted.wireContent;
    metadata = { ...encrypted.metadata };
  }
  const headers = await getFreshAuthHeaders();
  const res = await fetch('/api/hub/messages', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ hub_id: hubId, body, message_type: 'text', metadata }),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: Record<string, unknown>; error?: string; message_text?: string };
  const row = normalizeHubMessageRow(json.message ?? null);
  if (!res.ok || !row) {
    throw new Error(typeof json.error === 'string' && json.error !== 'RATE_LIMITED' ? 'Could not send.' : 'Slow down a moment, then try again.');
  }
  return row;
}

export async function hubDisplayNames(userIds: string[]): Promise<Record<string, { name: string; image: string | null }>> {
  if (userIds.length === 0) return {};
  const headers = await getFreshAuthHeaders();
  const res = await fetch('/api/users/display-names', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds }),
  });
  if (!res.ok) return {};
  const json = (await res.json().catch(() => ({}))) as { names?: Record<string, string>; images?: Record<string, string | null> };
  const out: Record<string, { name: string; image: string | null }> = {};
  for (const id of userIds) {
    const name = json.names?.[id];
    if (name) out[id] = { name, image: json.images?.[id] ?? null };
  }
  return out;
}
