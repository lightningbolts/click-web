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

async function writeStoredIdentity(value: StoredIdentity): Promise<void> {
  const db = await openIdentityDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(value, IDENTITY_KEY);
      transaction.oncomplete = () => resolve();
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

export async function loadOrCreateWebE2eeV2Identity(): Promise<DeviceIdentity & { deviceId: string }> {
  const stored = await readStoredIdentity();
  if (stored) {
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
  const identity = await generateDeviceIdentity();
  await writeStoredIdentity({
    privateKey: identity.privateKey,
    publicKey: identity.publicKey,
    publicKeySpkiBase64: identity.publicKeySpkiBase64,
  });
  return identityWithDeviceId(identity);
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

async function registerDevice(identity: DeviceIdentity & { deviceId: string }, headers: HeadersInit): Promise<void> {
  const response = await fetchJson<{ device?: DeviceRow }>('/api/chat/devices', headers, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: identity.deviceId, identity_public_key: identity.publicKeySpkiBase64 }),
  }).catch((error: unknown) => {
    if (error instanceof E2eeV2UnavailableError && /already registered/i.test(error.message)) return null;
    throw error;
  });
  void response;
}

async function discoverDevices(chatId: string, headers: HeadersInit): Promise<DeviceRow[]> {
  const payload = await fetchJson<{ devices?: DeviceRow[] }>(
    `/api/chat/devices?chat_id=${encodeURIComponent(chatId)}`,
    headers,
  );
  return (payload.devices ?? []).filter(
    (device) => device.key_algorithm === 'X25519' && device.crypto_version === 2 && device.revoked_at == null,
  );
}

async function getEpochState(chatId: string, deviceId: string, headers: HeadersInit): Promise<EpochState> {
  return fetchJson<EpochState>(
    `/api/chat/epochs?chat_id=${encodeURIComponent(chatId)}&device_id=${encodeURIComponent(deviceId)}`,
    headers,
  );
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
  await fetchJson('/api/chat/epochs', headers, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
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
): Promise<void> {
  return createEpoch(chatId, identity, devices, 1, headers);
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
      if (row.epoch === currentEpoch) throw new E2eeV2UnavailableError('Unable to unlock the current E2EE v2 epoch');
    }
  }
  if (!keys.has(currentEpoch)) throw new E2eeV2UnavailableError('This device is not approved for the current E2EE v2 epoch');
  return { identity, deviceId: identity.deviceId, deviceRowId, currentEpoch, epochKeys: keys };
}

export async function resolveWebE2eeV2Session(options: {
  chatId: string;
  participantUserIds: string[];
  getAuthHeaders: () => Promise<HeadersInit>;
  allowUpgrade?: boolean;
  forceRefresh?: boolean;
}): Promise<E2eeV2Session | null> {
  if (!options.forceRefresh && !options.allowUpgrade) {
    const cached = sessionCache.get(options.chatId);
    if (cached) return cached;
  }
  const headers = await options.getAuthHeaders();
  const identity = await loadOrCreateWebE2eeV2Identity();
  await registerDevice(identity, headers);
  const devices = await discoverDevices(options.chatId, headers);
  const own = devices.find((device) => device.device_id === identity.deviceId);
  if (!own) throw new E2eeV2UnavailableError('The current E2EE v2 device is not registered in this chat');
  let state = await getEpochState(options.chatId, identity.deviceId, headers);
  const participants = [...new Set(options.participantUserIds.map((id) => id.trim()).filter(Boolean))];
  const deviceUsers = new Set(devices.map((device) => device.user_id).filter((id): id is string => Boolean(id)));
  const allParticipantsHaveV2Devices =
    participants.length > 0 && participants.every((id) => deviceUsers.has(id));
  if (state.current_epoch == null) {
    if (options.allowUpgrade && allParticipantsHaveV2Devices) {
      await createInitialEpoch(options.chatId, identity, devices, headers).catch(async (error: unknown) => {
        // A concurrent device may have initialized epoch 1; re-read before failing.
        if (!(error instanceof E2eeV2UnavailableError)) throw error;
        state = await getEpochState(options.chatId, identity.deviceId, headers);
        if (state.current_epoch == null) throw error;
      });
      state = await getEpochState(options.chatId, identity.deviceId, headers);
    } else {
      return null;
    }
  } else if (options.allowUpgrade) {
    if (!allParticipantsHaveV2Devices) {
      throw new E2eeV2UnavailableError('All chat participants must have an active E2EE v2 device');
    }
    const fingerprint = await membershipFingerprint(devices);
    if (state.membership_fingerprint && state.membership_fingerprint !== fingerprint) {
      await createEpoch(options.chatId, identity, devices, state.current_epoch + 1, headers).catch(async (error: unknown) => {
        // Another active device may have rotated first; the fresh state is authoritative.
        if (!(error instanceof E2eeV2UnavailableError)) throw error;
        state = await getEpochState(options.chatId, identity.deviceId, headers);
        if (state.membership_fingerprint !== fingerprint) throw error;
      });
      state = await getEpochState(options.chatId, identity.deviceId, headers);
    }
  }
  const session = await unwrapSession(identity, own.id, state);
  sessionCache.set(options.chatId, session);
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
