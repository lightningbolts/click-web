'use client';

import {
  authorizeMedia,
  decryptMessage,
  decryptMediaPayload,
  encryptMessage,
  encryptMediaPayload,
  generateEpochKey,
  generateDeviceIdentity,
  parseE2eeV2Envelope,
  unwrapEpochKey,
  wrapEpochKey,
  type DeviceIdentity,
} from '@/lib/chat/e2eeV2';
import { thisBrowserDeviceLabel } from '@/lib/chat/deviceLabel';
import { recoveredHistoryFor } from '@/lib/chat/recoveredHistoryKeys';

type DeviceRow = {
  id: string;
  user_id?: string;
  device_id: string;
  identity_public_key: string;
  key_algorithm: string;
  crypto_version: number;
  revoked_at?: string | null;
};

type EpochEnvelopeRow = {
  chat_id: string;
  epoch: number;
  recipient_device_id: string;
  sender_device_id: string;
  envelope: string;
};

type EpochState = {
  chat_id: string;
  device_id: string;
  current_epoch: number | null;
  membership_fingerprint?: string | null;
  envelopes: EpochEnvelopeRow[];
};

export type E2eeV2Session = {
  identity: DeviceIdentity;
  deviceId: string;
  deviceRowId: string;
  currentEpoch: number;
  epochKeys: ReadonlyMap<number, Uint8Array>;
};

export class E2eeV2UnavailableError extends Error {
  readonly code = 'E2EE_V2_UNAVAILABLE';
}

type StoredIdentity = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeySpkiBase64: string;
};

const DB_NAME = 'click-e2ee-v2';
const STORE_NAME = 'identities';
const IDENTITY_KEY = 'current';
const sessionCache = new Map<string, E2eeV2Session>();
/** When each cached session was resolved; writes reuse one for `SEND_SESSION_REUSE_MS` (iOS parity). */
const sessionResolvedAt = new Map<string, number>();
const SEND_SESSION_REUSE_MS = 60_000;
/** Devices registered from this page; registration is idempotent, so once per page is enough. */
const registeredDeviceIds = new Set<string>();

/** Sign-out boundary: no decrypted session can outlive the account it was resolved for. */
export function clearWebE2eeV2SessionCaches(): void {
  for (const session of sessionCache.values()) {
    for (const key of session.epochKeys.values()) key.fill(0);
  }
  sessionCache.clear();
  sessionResolvedAt.clear();
  registeredDeviceIds.clear();
}

function browserIndexedDb(): IDBFactory {
  if (typeof indexedDB === 'undefined') throw new E2eeV2UnavailableError('IndexedDB is required for E2EE v2');
  return indexedDB;
}

function openIdentityDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = browserIndexedDb().open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open E2EE v2 key storage'));
  });
}

async function readStoredIdentity(): Promise<StoredIdentity | null> {
  const db = await openIdentityDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(IDENTITY_KEY);
      request.onsuccess = () => resolve((request.result as StoredIdentity | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Unable to read E2EE v2 key storage'));
    });
  } finally {
    db.close();
  }
}

/**
 * Stores [value] unless an identity is already stored (another tab got there first), and returns
 * the stored one. The read and the write share one readwrite transaction, which IndexedDB runs one
 * at a time across tabs, so a browser never ends up with two identities.
 */
async function storeIdentityIfAbsent(value: StoredIdentity): Promise<StoredIdentity> {
  const db = await openIdentityDb();
  try {
    return await new Promise<StoredIdentity>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      let stored = value;
      const existing = store.get(IDENTITY_KEY);
      existing.onsuccess = () => {
        if (existing.result) stored = existing.result as StoredIdentity;
        else store.put(value, IDENTITY_KEY);
      };
      transaction.oncomplete = () => resolve(stored);
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to persist E2EE v2 key storage'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Unable to persist E2EE v2 key storage'));
    });
  } finally {
    db.close();
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deviceIdForSpki(spki: string): Promise<string> {
  const binary = atob(spki);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
  return bytesToHex(new Uint8Array(digest));
}

async function identityWithDeviceId(identity: DeviceIdentity): Promise<DeviceIdentity & { deviceId: string }> {
  return { ...identity, deviceId: await deviceIdForSpki(identity.publicKeySpkiBase64) };
}

/**
 * This browser's one device identity. Concurrent callers share one load: on a first visit the
 * page's chat, approval and sharing code all ask at once, and each minting its own identity made
 * the server see several new devices (a push, an approval prompt and an email for each).
 */
let identityLoad: Promise<DeviceIdentity & { deviceId: string }> | null = null;

export function loadOrCreateWebE2eeV2Identity(): Promise<DeviceIdentity & { deviceId: string }> {
  identityLoad ??= loadOrCreateIdentity().catch((error: unknown) => {
    identityLoad = null; // e.g. storage was briefly unavailable: the next caller tries again
    throw error;
  });
  return identityLoad;
}

async function loadOrCreateIdentity(): Promise<DeviceIdentity & { deviceId: string }> {
  let stored = await readStoredIdentity();
  if (!stored) {
    const { privateKey, publicKey, publicKeySpkiBase64 } = await generateDeviceIdentity();
    stored = await storeIdentityIfAbsent({ privateKey, publicKey, publicKeySpkiBase64 });
  }
  if (stored.privateKey.type !== 'private' || stored.privateKey.extractable || stored.publicKey.type !== 'public') {
    throw new E2eeV2UnavailableError('Stored E2EE v2 identity is not non-extractable');
  }
  return identityWithDeviceId({
    privateKey: stored.privateKey,
    publicKey: stored.publicKey,
    publicKeySpkiBase64: stored.publicKeySpkiBase64,
    cryptoVersion: 2,
  });
}

async function fetchJson<T>(url: string, headers: HeadersInit, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } | string };
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : payload.error?.message;
    throw new E2eeV2UnavailableError(message || `E2EE v2 request failed (${response.status})`);
  }
  return payload as T;
}

/**
 * Registers this browser (idempotent; "already registered" is success). The label says what
 * kind of device it is ("Chrome on Mac") so the account's other devices know what they approve;
 * registering again also marks the device as active.
 */
async function registerDevice(identity: DeviceIdentity & { deviceId: string }, headers: HeadersInit): Promise<void> {
  if (registeredDeviceIds.has(identity.deviceId)) return;
  await fetchJson<{ device?: DeviceRow }>('/api/chat/devices', headers, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: identity.deviceId,
      identity_public_key: identity.publicKeySpkiBase64,
      device_label: thisBrowserDeviceLabel(),
    }),
  }).catch((error: unknown) => {
    if (error instanceof E2eeV2UnavailableError && /already registered/i.test(error.message)) return null;
    throw error;
  });
  registeredDeviceIds.add(identity.deviceId);
}

/** Registers this browser for the signed-in account, so chats started from now on include it. */
export async function registerWebE2eeV2Device(getAuthHeaders: () => Promise<HeadersInit>): Promise<void> {
  const identity = await loadOrCreateWebE2eeV2Identity();
  await registerDevice(identity, await getAuthHeaders());
}

/**
 * Conversation kind for epoch keys. Chats (direct and group) and Community Hubs (event chat)
 * share the v2 wire format; they differ only in which BFF routes hold devices and epochs.
 */
export type E2eeV2Scope = 'chat' | 'hub';

function scopeBase(scope: E2eeV2Scope): string {
  return scope === 'hub' ? '/api/hub' : '/api/chat';
}

function scopeParam(scope: E2eeV2Scope): string {
  return scope === 'hub' ? 'hub_id' : 'chat_id';
}

async function discoverDevices(chatId: string, headers: HeadersInit, scope: E2eeV2Scope = 'chat'): Promise<DeviceRow[]> {
  const payload = await fetchJson<{ devices?: DeviceRow[] }>(
    `${scopeBase(scope)}/devices?${scopeParam(scope)}=${encodeURIComponent(chatId)}`,
    headers,
  );
  return (payload.devices ?? []).filter(
    (device) => device.key_algorithm === 'X25519' && device.crypto_version === 2 && device.revoked_at == null,
  );
}

async function getEpochState(
  chatId: string,
  deviceId: string,
  headers: HeadersInit,
  scope: E2eeV2Scope = 'chat',
): Promise<EpochState> {
  type HubEnvelopeRow = Omit<EpochEnvelopeRow, 'chat_id'> & { chat_id?: string; hub_id?: string };
  const state = await fetchJson<Omit<EpochState, 'envelopes'> & { envelopes?: HubEnvelopeRow[] }>(
    `${scopeBase(scope)}/epochs?${scopeParam(scope)}=${encodeURIComponent(chatId)}&device_id=${encodeURIComponent(deviceId)}`,
    headers,
  );
  if (scope === 'chat') return state as EpochState;
  // Hub rows carry `hub_id`; the wrap metadata binds the hub id as its `chatId`.
  return {
    ...state,
    chat_id: chatId,
    envelopes: (state.envelopes ?? []).map((row) => ({ ...row, chat_id: row.chat_id ?? row.hub_id ?? chatId })),
  };
}

async function membershipFingerprint(devices: DeviceRow[]): Promise<string> {
  const canonical = devices
    .map((device) => `${device.user_id ?? ''}:${device.device_id}`)
    .sort()
    .join('|');
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))));
}

async function createEpoch(
  chatId: string,
  identity: DeviceIdentity & { deviceId: string },
  devices: DeviceRow[],
  epoch: number,
  headers: HeadersInit,
  scope: E2eeV2Scope = 'chat',
): Promise<void> {
  const epochKey = generateEpochKey();
  const envelopes = await Promise.all(devices.map(async (recipient) => ({
    recipient_device_id: recipient.device_id,
    envelope: await wrapEpochKey({
      chatId,
      epoch,
      senderDeviceId: identity.deviceId,
      recipientDeviceId: recipient.device_id,
      epochKey,
      recipientPublicKey: await importPublicKey(recipient.identity_public_key),
    }),
  })));
  await fetchJson(`${scopeBase(scope)}/epochs`, headers, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      [scopeParam(scope)]: chatId,
      epoch,
      sender_device_id: identity.deviceId,
      membership_fingerprint: await membershipFingerprint(devices),
      envelopes,
    }),
  });
}

async function createInitialEpoch(
  chatId: string,
  identity: DeviceIdentity & { deviceId: string },
  devices: DeviceRow[],
  headers: HeadersInit,
  scope: E2eeV2Scope = 'chat',
): Promise<void> {
  return createEpoch(chatId, identity, devices, 1, headers, scope);
}

async function importPublicKey(spki: string): Promise<CryptoKey> {
  const binary = atob(spki);
  return crypto.subtle.importKey(
    'spki',
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    { name: 'X25519' },
    true,
    [],
  );
}

async function unwrapSession(
  identity: DeviceIdentity & { deviceId: string },
  deviceRowId: string,
  state: EpochState,
  scope: E2eeV2Scope = 'chat',
  accountId: string | null = null,
): Promise<E2eeV2Session> {
  const currentEpoch = state.current_epoch;
  if (!currentEpoch) throw new E2eeV2UnavailableError('E2EE v2 epoch is not initialized');
  const keys = new Map<number, Uint8Array>();
  for (const row of state.envelopes) {
    try {
      const key = await unwrapEpochKey({
        chatId: row.chat_id,
        epoch: row.epoch,
        senderDeviceId: row.sender_device_id,
        recipientDeviceId: identity.deviceId,
        envelope: row.envelope,
        recipientPrivateKey: identity.privateKey,
      });
      keys.set(row.epoch, key);
    } catch {
      // A matching authenticated passkey recovery may supply this epoch instead.
      if (row.epoch === currentEpoch &&
          !(accountId && recoveredHistoryFor(scope, state.chat_id, accountId)?.has(currentEpoch))) {
        throw new E2eeV2UnavailableError('Unable to unlock the current E2EE v2 epoch');
      }
    }
  }
  // A passkey-unlocked backup is held only in memory and bound to the signed-in account.
  // Never replace keys delivered by the existing per-device X25519 envelopes.
  const recovered = accountId ? recoveredHistoryFor(scope, state.chat_id, accountId) : null;
  if (recovered) {
    for (const [epoch, key] of recovered) {
      if (!keys.has(epoch)) keys.set(epoch, key);
    }
  }
  if (!keys.has(currentEpoch)) throw new E2eeV2UnavailableError('This device is not approved for the current E2EE v2 epoch');
  return { identity, deviceId: identity.deviceId, deviceRowId, currentEpoch, epochKeys: keys };
}

type ResolveSessionOptions = {
  /** Chat id, or the hub id when `scope` is `'hub'`. */
  chatId: string;
  scope?: E2eeV2Scope;
  participantUserIds: string[];
  getAuthHeaders: () => Promise<HeadersInit>;
  allowUpgrade?: boolean;
  forceRefresh?: boolean;
  /**
   * Writes only: return a cached session even when older than the reuse window, re-checking it
   * in the background. For callers that retry once after `invalidateWebE2eeV2Session` when the
   * server rejects the epoch (it always validates epoch and devices).
   */
  staleWhileRevalidate?: boolean;
  /** Email-approval pages must not turn an arbitrary browser into another account device. */
  registerDeviceIfNeeded?: boolean;
};

/** Read-only resolutions in flight per chat, so an inbox of N rows plus an open thread share one round trip. */
const sessionReadsInFlight = new Map<string, Promise<E2eeV2Session | null>>();

export async function resolveWebE2eeV2Session(options: ResolveSessionOptions): Promise<E2eeV2Session | null> {
  const key = sessionKey(options);
  const cached = sessionCache.get(key);
  // Writes re-check membership and rotation, but not on every message: a session resolved in
  // the last minute is reused (iOS `sendSessionReuse`), so a send is one round trip, not four.
  if (cached && (options.forceRefresh || options.allowUpgrade)) {
    if (Date.now() - (sessionResolvedAt.get(key) ?? 0) < SEND_SESSION_REUSE_MS) return cached;
    if (options.staleWhileRevalidate) {
      // Never make a send wait on the re-check; the next send gets the fresh session.
      if (!writeRefreshesInFlight.has(key)) {
        const refresh = resolveSessionUncached(options)
          .catch(() => null)
          .finally(() => writeRefreshesInFlight.delete(key));
        writeRefreshesInFlight.set(key, refresh);
      }
      return cached;
    }
  }
  if (!options.forceRefresh && !options.allowUpgrade) {
    if (cached) return cached;
    const inFlight = sessionReadsInFlight.get(key);
    if (inFlight) return inFlight;
    const pending = resolveSessionUncached(options).finally(() => {
      sessionReadsInFlight.delete(key);
    });
    sessionReadsInFlight.set(key, pending);
    return pending;
  }
  return resolveSessionUncached(options);
}

/** Background write re-checks per chat (`staleWhileRevalidate`), so a burst of sends starts one. */
const writeRefreshesInFlight = new Map<string, Promise<E2eeV2Session | null>>();

/** Drops a chat's cached session: the server rejected its epoch, so the next resolve re-reads it. */
export function invalidateWebE2eeV2Session(chatId: string, scope: E2eeV2Scope = 'chat'): void {
  const key = sessionKey({ chatId, scope });
  sessionCache.delete(key);
  sessionResolvedAt.delete(key);
}

/** Read the account ID from already-authenticated request headers for local cache isolation.
 * The API still validates the JWT; decoding here never authorizes server access.
 */
function authenticatedAccountId(headers: HeadersInit): string | null {
  try {
    const authorization = new Headers(headers).get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return null;
    const token = authorization.slice(7);
    const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!base64) return null;
    const decoded = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as { sub?: unknown };
    return typeof decoded.sub === 'string' ? decoded.sub : null;
  } catch {
    return null;
  }
}

function sessionKey(options: Pick<ResolveSessionOptions, 'chatId' | 'scope'>): string {
  return options.scope === 'hub' ? `hub:${options.chatId}` : options.chatId;
}

async function resolveSessionUncached(options: ResolveSessionOptions): Promise<E2eeV2Session | null> {
  const scope = options.scope ?? 'chat';
  const id = options.chatId;
  const headers = await options.getAuthHeaders();
  const identity = await loadOrCreateWebE2eeV2Identity();
  const shouldRegister = options.registerDeviceIfNeeded !== false;
  const wasRegistered = registeredDeviceIds.has(identity.deviceId);
  if (shouldRegister) await registerDevice(identity, headers);
  // Independent reads: the device list and this device's epoch envelopes, together.
  const read = () => {
    const epochState = getEpochState(id, identity.deviceId, headers, scope);
    epochState.catch(() => {}); // Awaited below; ignored when discovery retries first.
    return { devices: discoverDevices(id, headers, scope), epochState };
  };
  let reads = read();
  let devices = await reads.devices;
  if (shouldRegister && wasRegistered && !devices.some((device) => device.device_id === identity.deviceId)) {
    // Registered from this page under another account (or revoked since): register again, re-read once.
    registeredDeviceIds.delete(identity.deviceId);
    await registerDevice(identity, headers);
    reads = read();
    devices = await reads.devices;
  }
  const own = devices.find((device) => device.device_id === identity.deviceId);
  if (!own) throw new E2eeV2UnavailableError('The current E2EE v2 device is not registered in this chat');
  let state = await reads.epochState;
  const participants = [...new Set(options.participantUserIds.map((pid) => pid.trim()).filter(Boolean))];
  const deviceUsers = new Set(devices.map((device) => device.user_id).filter((uid): uid is string => Boolean(uid)));
  const allParticipantsHaveV2Devices =
    participants.length > 0 && participants.every((pid) => deviceUsers.has(pid));
  if (state.current_epoch == null) {
    if (options.allowUpgrade && allParticipantsHaveV2Devices) {
      await createInitialEpoch(id, identity, devices, headers, scope).catch(async (error: unknown) => {
        // A concurrent device may have initialized epoch 1; re-read before failing.
        if (!(error instanceof E2eeV2UnavailableError)) throw error;
        state = await getEpochState(id, identity.deviceId, headers, scope);
        if (state.current_epoch == null) throw error;
      });
      state = await getEpochState(id, identity.deviceId, headers, scope);
    } else {
      return null;
    }
  } else if (options.allowUpgrade) {
    // Hub participant lists can be hidden (host-only guest lists); the server RPC verifies
    // every participant has a device, so only chats require the full list here (iOS parity).
    if (scope === 'chat' && !allParticipantsHaveV2Devices) {
      throw new E2eeV2UnavailableError('All chat participants must have an active E2EE v2 device');
    }
    const fingerprint = await membershipFingerprint(devices);
    // Hubs rotate on any fingerprint difference; chats only when one is recorded.
    const mismatch =
      scope === 'hub'
        ? state.membership_fingerprint !== fingerprint
        : Boolean(state.membership_fingerprint && state.membership_fingerprint !== fingerprint);
    if (mismatch) {
      await createEpoch(id, identity, devices, state.current_epoch + 1, headers, scope).catch(async (error: unknown) => {
        // Another active device may have rotated first; the fresh state is authoritative.
        if (!(error instanceof E2eeV2UnavailableError)) throw error;
        state = await getEpochState(id, identity.deviceId, headers, scope);
        if (state.membership_fingerprint !== fingerprint) throw error;
      });
      state = await getEpochState(id, identity.deviceId, headers, scope);
    }
  }
  const session = await unwrapSession(identity, own.id, state, scope, authenticatedAccountId(headers));
  sessionCache.set(sessionKey(options), session);
  sessionResolvedAt.set(sessionKey(options), Date.now());
  return session;
}

export async function encryptWebE2eeV2Message(
  session: E2eeV2Session,
  chatId: string,
  plaintext: string,
  clientMessageId = crypto.randomUUID(),
): Promise<{ wireContent: string; metadata: Record<string, unknown> }> {
  return {
    wireContent: await encryptMessage({
      chatId,
      epoch: session.currentEpoch,
      senderDeviceId: session.deviceId,
      clientMessageId,
      epochKey: session.epochKeys.get(session.currentEpoch)!,
      plaintext,
    }),
    metadata: {
      crypto_version: 2,
      epoch: session.currentEpoch,
      sender_device_id: session.deviceId,
      client_message_id: clientMessageId,
    },
  };
}

/** Mobile HubChatViewModelE2eeV2 contract. Never use the direct-chat session cache for hubs. */
export async function resolveWebHubE2eeV2Session(options: {
  hubId: string;
  participantUserIds: string[];
  getAuthHeaders: () => Promise<HeadersInit>;
}): Promise<E2eeV2Session | null> {
  const headers = await options.getAuthHeaders();
  const identity = await loadOrCreateWebE2eeV2Identity();
  await registerDevice(identity, headers);
  const { devices: rows } = await fetchJson<{ devices: DeviceRow[] }>(
    `/api/hub/devices?hub_id=${encodeURIComponent(options.hubId)}`, headers,
  );
  const devices = rows.filter((d) => d.key_algorithm === 'X25519' && d.crypto_version === 2 && !d.revoked_at);
  const own = devices.find((d) => d.device_id === identity.deviceId);
  if (!own) throw new E2eeV2UnavailableError('This device is not registered in this hub');
  type HubState = Omit<EpochState, 'chat_id' | 'envelopes'> & {
    hub_id: string;
    envelopes: (Omit<EpochEnvelopeRow, 'chat_id'> & { hub_id: string })[];
  };
  const readState = () => fetchJson<HubState>(
    `/api/hub/epochs?hub_id=${encodeURIComponent(options.hubId)}&device_id=${encodeURIComponent(identity.deviceId)}`, headers,
  );
  let state = await readState();
  const fingerprint = await membershipFingerprint(devices);
  if (state.current_epoch == null) {
    const participants = options.participantUserIds;
    if (!participants.length || !participants.every((id) => devices.some((d) => d.user_id === id))) return null;
  }
  if (state.current_epoch == null || state.membership_fingerprint !== fingerprint) {
    const epoch = (state.current_epoch ?? 0) + 1;
    const epochKey = generateEpochKey();
    try {
      const envelopes = await Promise.all(devices.map(async (recipient) => ({
        recipient_device_id: recipient.device_id,
        envelope: await wrapEpochKey({
          chatId: options.hubId, epoch, senderDeviceId: identity.deviceId,
          recipientDeviceId: recipient.device_id, epochKey,
          recipientPublicKey: await importPublicKey(recipient.identity_public_key),
        }),
      })));
      await fetchJson('/api/hub/epochs', headers, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hub_id: options.hubId, epoch, sender_device_id: identity.deviceId, membership_fingerprint: fingerprint, envelopes }),
      }).catch(async (error: unknown) => {
        const concurrent = await readState();
        if (concurrent.current_epoch !== epoch || concurrent.membership_fingerprint !== fingerprint) throw error;
      });
    } finally { epochKey.fill(0); }
    state = await readState();
  }
  if (state.hub_id !== options.hubId || state.device_id !== identity.deviceId) {
    throw new E2eeV2UnavailableError('Hub encryption response identity mismatch');
  }
  return unwrapSession(identity, own.id, {
    ...state, chat_id: state.hub_id,
    envelopes: state.envelopes
      .filter((row) => row.hub_id === options.hubId && row.recipient_device_id === own.id)
      .map((row) => ({ ...row, chat_id: row.hub_id })),
  }, 'hub', authenticatedAccountId(headers));
}

/**
 * Approve a new device and transfer every historical epoch key readable by the approving
 * device. The transferred values remain opaque to the server; only the recipient can unwrap
 * them with its non-extractable private key.
 */
export async function approveWebE2eeV2KeyTransfer(options: {
  chatId: string;
  session: E2eeV2Session;
  recipientDevice: Pick<DeviceRow, 'device_id' | 'identity_public_key'>;
  getAuthHeaders: () => Promise<HeadersInit>;
  epochs?: number[];
}): Promise<unknown> {
  if (options.recipientDevice.device_id === options.session.deviceId) {
    throw new E2eeV2UnavailableError('A device cannot approve itself for key transfer');
  }
  const selectedEpochs = options.epochs
    ? [...new Set(options.epochs)].sort((a, b) => a - b)
    : [...options.session.epochKeys.keys()].sort((a, b) => a - b);
  if (selectedEpochs.length === 0) {
    throw new E2eeV2UnavailableError('No readable historical E2EE v2 epochs are available for transfer');
  }
  const recipientPublicKey = await importPublicKey(options.recipientDevice.identity_public_key);
  const historicalEnvelopes = await Promise.all(selectedEpochs.map(async (epoch) => {
    const epochKey = options.session.epochKeys.get(epoch);
    if (!epochKey) throw new E2eeV2UnavailableError(`Missing readable E2EE v2 epoch ${epoch}`);
    return {
      epoch,
      recipient_device_id: options.recipientDevice.device_id,
      sender_device_id: options.session.deviceId,
      envelope: await wrapEpochKey({
        chatId: options.chatId,
        epoch,
        senderDeviceId: options.session.deviceId,
        recipientDeviceId: options.recipientDevice.device_id,
        epochKey,
        recipientPublicKey,
      }),
    };
  }));
  return fetchJson('/api/chat/key-transfer', await options.getAuthHeaders(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: options.chatId,
      approving_device_id: options.session.deviceId,
      recipient_device_id: options.recipientDevice.device_id,
      historical_envelopes: historicalEnvelopes,
    }),
  });
}

type HistoryBackfillItem = {
  request_id: string;
  recipient_device_id: string;
  recipient_public_key: string;
  chat_id: string;
  epochs: number[];
};

/**
 * One share pass at a time per page: the shell, Settings and a fresh approval can all ask. A
 * call during a pass queues one more after it (that pass may have read the approvals before
 * the one just made); every call during that wait shares it.
 */
let historyShareInFlight: Promise<number> | null = null;
let historyShareQueued: Promise<number> | null = null;

/**
 * On a device already in use: shares the chat history this browser can read with the account's
 * newer devices whose request was approved (here, in the apps, or by the emailed link). For each
 * chat it re-wraps the epoch keys it holds to the new device's public key and uploads them; the
 * server only relays the envelopes and checks the approval (`approve_chat_key_transfer`).
 * Returns how many chats were shared. iOS `shareHistoryWithApprovedDevices` parity.
 */
export function shareWebE2eeV2HistoryWithApprovedDevices(options: {
  /** Optional for read-only history backfill; retained for existing callers and diagnostics. */
  currentUserId?: string;
  getAuthHeaders: () => Promise<HeadersInit>;
  /** False on email approval pages: only an already-registered browser may donate old keys. */
  registerDeviceIfNeeded?: boolean;
}): Promise<number> {
  if (historyShareInFlight) {
    historyShareQueued ??= historyShareInFlight
      .catch(() => 0)
      .then(() => {
        historyShareQueued = null;
        return shareWebE2eeV2HistoryWithApprovedDevices(options);
      });
    return historyShareQueued;
  }
  historyShareInFlight = shareHistoryOnce(options).finally(() => {
    historyShareInFlight = null;
  });
  return historyShareInFlight;
}

async function shareHistoryOnce({
  currentUserId,
  getAuthHeaders,
  registerDeviceIfNeeded = true,
}: {
  currentUserId?: string;
  getAuthHeaders: () => Promise<HeadersInit>;
  registerDeviceIfNeeded?: boolean;
}): Promise<number> {
  const identity = await loadOrCreateWebE2eeV2Identity();
  const headers = await getAuthHeaders();
  if (registerDeviceIfNeeded) await registerDevice(identity, headers);
  const { items = [] } = await fetchJson<{ items?: HistoryBackfillItem[] }>(
    `/api/chat/devices/history-backfill?device_id=${encodeURIComponent(identity.deviceId)}`,
    headers,
  );
  let shared = 0;
  for (const item of items) {
    if (item.recipient_device_id === identity.deviceId || item.epochs.length === 0) continue;
    try {
      // A fresh read, so every key this browser was given is available to share.
      invalidateWebE2eeV2Session(item.chat_id);
      const session = await resolveWebE2eeV2Session({
        chatId: item.chat_id,
        participantUserIds: currentUserId ? [currentUserId] : [],
        getAuthHeaders,
        registerDeviceIfNeeded,
      });
      if (!session) continue;
      const epochs = item.epochs.filter((epoch) => session.epochKeys.has(epoch));
      if (epochs.length === 0) continue;
      await approveWebE2eeV2KeyTransfer({
        chatId: item.chat_id,
        session,
        recipientDevice: { device_id: item.recipient_device_id, identity_public_key: item.recipient_public_key },
        getAuthHeaders,
        epochs,
      });
      shared += 1;
    } catch {
      // One chat this browser can't read (or a transient failure) never blocks the rest.
    }
  }
  return shared;
}

export async function encryptWebE2eeV2Media(
  session: E2eeV2Session,
  metadata: { chatId: string; clientMessageId: string },
  plaintext: ArrayBuffer | Uint8Array,
): Promise<{
  payload: Uint8Array;
  authorizationEnvelope: string;
  metadata: Record<string, unknown>;
}> {
  const messageMetadata = {
    chatId: metadata.chatId,
    epoch: session.currentEpoch,
    senderDeviceId: session.deviceId,
    clientMessageId: metadata.clientMessageId,
  };
  const epochKey = session.epochKeys.get(session.currentEpoch)!;
  const encrypted = await encryptMediaPayload({ ...messageMetadata, epochKey, plaintext });
  const authorizationEnvelope = await authorizeMedia({
    ...messageMetadata,
    epochKey,
    mediaCiphertextSha256: encrypted.mediaCiphertextSha256,
  });
  return {
    payload: encrypted.payload,
    authorizationEnvelope,
    metadata: {
      crypto_version: 2,
      epoch: session.currentEpoch,
      sender_device_id: session.deviceId,
      client_message_id: metadata.clientMessageId,
      media_ciphertext_sha256: encrypted.mediaCiphertextSha256,
      media_authorization_envelope: authorizationEnvelope,
    },
  };
}

export async function decryptWebE2eeV2Message(session: E2eeV2Session, wireContent: string): Promise<string> {
  const envelope = parseE2eeV2Envelope(wireContent);
  if (envelope.type !== 'message') throw new Error('Unexpected E2EE v2 envelope type');
  const epochKey = session.epochKeys.get(envelope.epoch);
  if (!epochKey) throw new E2eeV2UnavailableError('This device does not have the required E2EE v2 epoch key');
  return decryptMessage({ ...envelope, epochKey, envelope: wireContent });
}

/**
 * A v2 message's plaintext for display, or null when this browser can't read it (callers keep
 * the ciphertext, so it can be decrypted again once keys arrive). A message from an epoch newer
 * than the cached session (someone rotated since) re-reads the chat's keys once.
 */
export async function decryptWebE2eeV2ForDisplay(
  chatId: string,
  wireContent: string,
  getSession: () => Promise<E2eeV2Session | null>,
): Promise<string | null> {
  let epoch: number;
  try {
    epoch = parseE2eeV2Envelope(wireContent).epoch;
  } catch {
    return null;
  }
  let session = await getSession().catch(() => null);
  if (session && !session.epochKeys.has(epoch) && epoch > session.currentEpoch) {
    // Concurrent decrypts share one re-read: only the first to see this session drops it.
    if (sessionCache.get(chatId) === session) invalidateWebE2eeV2Session(chatId);
    session = await getSession().catch(() => null);
  }
  if (!session) return null;
  return decryptWebE2eeV2Message(session, wireContent).catch(() => null);
}

export async function decryptWebE2eeV2Media(
  session: E2eeV2Session,
  metadata: { chatId: string; epoch: number; senderDeviceId: string; clientMessageId: string; mediaCiphertextSha256?: string },
  payload: ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  const epochKey = session.epochKeys.get(metadata.epoch);
  if (!epochKey) throw new E2eeV2UnavailableError('This device does not have the required E2EE v2 media key');
  return decryptMediaPayload(metadata, epochKey, payload, metadata.mediaCiphertextSha256);
}

export { authorizeMedia };
