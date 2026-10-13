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
  decryptWebE2eeV2ForDisplay,
  encryptWebE2eeV2Message,
  invalidateWebE2eeV2Session,
  resolveWebE2eeV2Session,
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
  /** Stable across sending → sent → realtime echo: the client message id when the row has one. */
  key: string;
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

/**
 * Decrypts one hub body on this device; unreadable ciphertext becomes a neutral label. A body
 * from an epoch newer than the cached keys (a device joined or left since) re-reads them once.
 */
export async function decryptHubBody(
  hubId: string,
  body: string,
  messageType: string,
  participantIds: string[],
): Promise<string> {
  const label = mediaLabel(messageType);
  if (label) return label;
  try {
    if (body.startsWith('e2e2:')) {
      return (await decryptWebE2eeV2ForDisplay(hubId, body, () => hubSession(hubId, participantIds), 'hub')) ?? 'Message';
    }
    if (isEncrypted(body)) {
      return await decryptContent(body, await deriveKeysForHub(hubId));
    }
  } catch {
    return 'Message';
  }
  return body;
}

/**
 * The hub's v2 keys. Reads reuse the cached keys; writes (`write`) reuse keys checked in the last
 * minute and otherwise re-check devices and rotate. `staleOk` lets a write use older cached keys
 * and re-check in the background, for a caller that retries once if the server refuses them.
 * Null: the hub isn't end-to-end encrypted (yet). A write whose keys can't be resolved throws,
 * so a message is never sent in plaintext because of a failure; a read just shows as locked.
 */
export async function hubSession(hubId: string, participantIds: string[], write: false | { staleOk: boolean } = false) {
  const session = resolveWebE2eeV2Session({
    chatId: hubId,
    scope: 'hub',
    participantUserIds: participantIds,
    getAuthHeaders: getFreshAuthHeaders,
    allowUpgrade: Boolean(write),
    forceRefresh: Boolean(write),
    staleWhileRevalidate: write ? write.staleOk : false,
  });
  return write ? session : session.catch(() => null);
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
  participantIds: string[],
  reactions: Record<string, string[]> = {},
): Promise<HubChatMessage> {
  const meta = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
  return {
    id: row.id,
    key: typeof meta.client_message_id === 'string' && meta.client_message_id ? meta.client_message_id : row.id,
    userId: row.user_id,
    text: await decryptHubBody(row.hub_id, row.body, row.message_type, participantIds),
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
  const reactionMap = groupReactions(json.reactions ?? []);
  const messages = await Promise.all(rows.map((r) => toHubChatMessage(r, participantIds, reactionMap.get(r.id))));
  return {
    messages: messages.sort((a, b) => a.createdAt - b.createdAt),
    participantIds,
    occupantCount: typeof json.occupant_count === 'number' ? json.occupant_count : participantIds.length,
  };
}

/** The server refused the epoch the body was encrypted with: someone's devices changed since. */
const STALE_EPOCH_CODES = new Set(['HUB_E2EE_V2_INVALID', 'HUB_E2EE_V2_REQUIRED']);

/**
 * Sends a text message, encrypted with the hub's v2 epoch when it has one. It goes out with the
 * keys at hand; if the server refuses them as stale, the keys are re-read and it is sent once more
 * (as direct chats do), so a rotation never strands a send.
 */
export async function sendHubText(
  hubId: string,
  text: string,
  participantIds: string[],
  {
    clientMessageId = crypto.randomUUID(),
    fields,
    metadata,
  }: {
    clientMessageId?: string;
    /** Extra request fields, e.g. a place hub's geofence coordinates. */
    fields?: Record<string, unknown>;
    /** Extra metadata, e.g. `reply_to_id`. */
    metadata?: Record<string, unknown>;
  } = {},
): Promise<HubThreadMessage> {
  const headers = await getFreshAuthHeaders();
  const post = async (staleOk: boolean) => {
    const session = await hubSession(hubId, participantIds, { staleOk });
    const encrypted = session ? await encryptWebE2eeV2Message(session, hubId, text, clientMessageId) : null;
    const res = await fetch('/api/hub/messages', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...fields,
        hub_id: hubId,
        body: encrypted?.wireContent ?? text,
        message_type: 'text',
        metadata: { ...metadata, ...(encrypted?.metadata ?? { client_message_id: clientMessageId }) },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: Record<string, unknown> | string; error?: string; code?: string };
    return { res, json };
  };
  let { res, json } = await post(true);
  if (!res.ok && typeof json.code === 'string' && STALE_EPOCH_CODES.has(json.code)) {
    invalidateWebE2eeV2Session(hubId, 'hub');
    ({ res, json } = await post(false));
  }
  const row = typeof json.message === 'object' ? normalizeHubMessageRow(json.message) : null;
  if (!res.ok || !row) {
    // Gate refusals carry a sentence for people in `message` ("You are no longer at this location.").
    const reason = typeof json.message === 'string' && json.message ? json.message : null;
    throw new Error(res.status === 429 ? 'Slow down a moment, then try again.' : (reason ?? 'Could not send.'));
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
