/**
 * Client-only primitives for the opt-in E2EE historical-key recovery design.
 *
 * This module never accepts Supabase tokens, OAuth tokens, or server-held secrets
 * as a recovery key. No persistence or automatic enrollment is performed here.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const BK_BYTES = 32;
const IV_BYTES = 12;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
const INFO = encoder.encode('click-e2ee-history-backup-wrap-v1');
const SALT = encoder.encode('click-e2ee-history-backup-prf-v1');

export type EncryptedRecoveryPayload = {
  version: 1;
  iv: string;
  ciphertext: string;
};
export type HistoryKeyRecord = {
  scope: 'chat' | 'hub';
  id: string;
  epoch: number;
  key: string;
};
export type HistoryKeyManifest = {
  version: 1;
  userId: string;
  keys: HistoryKeyRecord[];
};

function toB64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromB64(value: string, maxBytes = MAX_PAYLOAD_BYTES): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid recovery payload encoding');
  }
  const binary = atob(value);
  if (binary.length > maxBytes) throw new Error('Recovery payload too large');
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (toB64(bytes) !== value) throw new Error('Non-canonical recovery payload');
  return bytes;
}
function aad(userId: string, kind: string): Uint8Array {
  if (!userId || userId.length > 256) throw new Error('Invalid recovery account');
  return encoder.encode(JSON.stringify({ application: 'click', version: 1, userId, kind }));
}
function validateManifest(data: unknown, userId: string): asserts data is HistoryKeyManifest {
  if (!data || typeof data !== 'object') throw new Error('Invalid history key manifest');
  const manifest = data as Partial<HistoryKeyManifest>;
  if (manifest.version !== 1 || manifest.userId !== userId || !Array.isArray(manifest.keys)) {
    throw new Error('Recovery manifest does not match account');
  }
  if (manifest.keys.length > 100_000) throw new Error('Too many history keys');
  for (const item of manifest.keys) {
    if (!item || (item.scope !== 'chat' && item.scope !== 'hub') ||
        typeof item.id !== 'string' || !item.id || item.id.length > 256 ||
        !Number.isSafeInteger(item.epoch) || item.epoch < 1 ||
        typeof item.key !== 'string' || fromB64(item.key, 64).length !== 32) {
      throw new Error('Invalid historical epoch key');
    }
  }
}
async function aesKey(key: Uint8Array): Promise<CryptoKey> {
  if (key.length !== BK_BYTES) throw new Error('Recovery key must be 256 bits');
  return crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function generateBackupKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(BK_BYTES));
}

/** Derive an AES wrapping key from a WebAuthn PRF output; PRF support must be checked by the caller. */
export async function deriveWrappingKey(prfOutput: Uint8Array): Promise<Uint8Array> {
  if (prfOutput.length !== BK_BYTES) throw new Error('Invalid WebAuthn PRF output');
  const material = await crypto.subtle.importKey('raw', new Uint8Array(prfOutput), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: INFO }, material, 256,
  );
  return new Uint8Array(bits);
}

async function seal(key: Uint8Array, plaintext: Uint8Array, userId: string, kind: string): Promise<EncryptedRecoveryPayload> {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error('Recovery payload too large');
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(userId, kind), tagLength: 128 },
    await aesKey(key), new Uint8Array(plaintext),
  );
  return { version: 1, iv: toB64(iv), ciphertext: toB64(new Uint8Array(ciphertext)) };
}
async function open(key: Uint8Array, payload: EncryptedRecoveryPayload, userId: string, kind: string): Promise<Uint8Array> {
  if (payload.version !== 1) throw new Error('Unsupported recovery format');
  const iv = fromB64(payload.iv, IV_BYTES);
  if (iv.length !== IV_BYTES) throw new Error('Invalid recovery IV');
  const ciphertext = fromB64(payload.ciphertext);
  if (ciphertext.length > MAX_PAYLOAD_BYTES) throw new Error('Recovery payload too large');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad(userId, kind), tagLength: 128 },
    await aesKey(key), ciphertext,
  );
  return new Uint8Array(plain);
}

/** The server stores only this encrypted manifest, not the 256-bit backup key. */
export async function encryptHistoryManifest(backupKey: Uint8Array, manifest: HistoryKeyManifest): Promise<EncryptedRecoveryPayload> {
  validateManifest(manifest, manifest.userId);
  return seal(backupKey, encoder.encode(JSON.stringify(manifest)), manifest.userId, 'manifest');
}
export async function decryptHistoryManifest(backupKey: Uint8Array, payload: EncryptedRecoveryPayload, userId: string): Promise<HistoryKeyManifest> {
  const bytes = await open(backupKey, payload, userId, 'manifest');
  const parsed: unknown = JSON.parse(decoder.decode(bytes));
  validateManifest(parsed, userId);
  return parsed;
}

/** A separate wrapping envelope per enrolled recovery credential. */
export async function wrapBackupKey(wrappingKey: Uint8Array, backupKey: Uint8Array, userId: string): Promise<EncryptedRecoveryPayload> {
  if (backupKey.length !== BK_BYTES) throw new Error('Invalid backup key');
  return seal(wrappingKey, backupKey, userId, 'backup-key');
}
export async function unwrapBackupKey(wrappingKey: Uint8Array, payload: EncryptedRecoveryPayload, userId: string): Promise<Uint8Array> {
  const bytes = await open(wrappingKey, payload, userId, 'backup-key');
  if (bytes.length !== BK_BYTES) throw new Error('Invalid restored backup key');
  return bytes;
}
