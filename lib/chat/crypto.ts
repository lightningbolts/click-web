/**
 * Client-side E2EE utilities for Click chat messages.
 *
 * Scheme (matches the KMP implementation exactly):
 *   AES-256-CBC + HMAC-SHA256 (encrypt-then-MAC)
 *   Wire format: "e2e:" + Base64( IV[16] || HMAC[32] || ciphertext )
 *
 * Key derivation per connection:
 *   master  = SHA-256( SALT || sorted_uid_1 || sorted_uid_2 || connection_id )
 *   enc_key = SHA-256( master || 0x01 )
 *   mac_key = SHA-256( master || 0x02 )
 */

const E2EE_PREFIX = 'e2e:';
/** Group clique message wire format (matches KMP `MessageCrypto`). */
export const E2EE_GROUP_MSG_PREFIX = 'e2e_grp:';
const IV_LENGTH = 16;
const HMAC_LENGTH = 32;
const E2EE_SALT = 'click-platforms-e2ee-v1-2024';
export const GROUP_MASTER_KEY_BYTES = 32;

export interface DerivedKeys {
  encKey: CryptoKey;
  macKey: CryptoKey;
  encKeyRaw: ArrayBuffer;
  macKeyRaw: ArrayBuffer;
}

const keyCache = new Map<string, DerivedKeys>();

type Bytes = Uint8Array<ArrayBuffer>;

async function sha256(data: Bytes): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', data);
}

function concatBuffers(...buffers: (Bytes | ArrayBuffer)[]): Bytes {
  const arrays = buffers.map((b) => (b instanceof Uint8Array ? b : new Uint8Array(b)) as Bytes);
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLength) as Bytes;
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function toUtf8(str: string): Bytes {
  return new TextEncoder().encode(str) as Bytes;
}

function fromUtf8(data: ArrayBuffer | Bytes): string {
  return new TextDecoder().decode(data);
}

function toBase64(data: Bytes): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Bytes {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length) as Bytes;
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Per-message AES/HMAC keys derived from the 32-byte shared group master (same derivation as KMP).
 */
export async function deriveKeysFromGroupMaster(groupMaster32: ArrayBuffer): Promise<DerivedKeys> {
  const master = new Uint8Array(groupMaster32) as Bytes;
  if (master.byteLength !== GROUP_MASTER_KEY_BYTES) {
    throw new Error(`Group master key must be ${GROUP_MASTER_KEY_BYTES} bytes`);
  }
  const encKeyRaw = await sha256(concatBuffers(master, new Uint8Array([0x01]) as Bytes));
  const macKeyRaw = await sha256(concatBuffers(master, new Uint8Array([0x02]) as Bytes));

  const encKey = await crypto.subtle.importKey('raw', encKeyRaw, { name: 'AES-CBC' }, false, [
    'encrypt',
    'decrypt',
  ]);

  const macKey = await crypto.subtle.importKey(
    'raw',
    macKeyRaw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

  return { encKey, macKey, encKeyRaw, macKeyRaw };
}

/** Decode standard Base64 group master (32 raw bytes) after 1:1 unwrap from `encrypted_group_key`. */
export function decodeGroupMasterKeyBase64(b64: string): ArrayBuffer {
  const bytes = fromBase64(b64.trim());
  if (bytes.byteLength !== GROUP_MASTER_KEY_BYTES) {
    throw new Error(`Decoded group key must be ${GROUP_MASTER_KEY_BYTES} bytes`);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export async function deriveKeysForConnection(
  connectionId: string,
  userIds: string[]
): Promise<DerivedKeys> {
  const cacheKey = connectionId;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const sorted = [...userIds].sort();
  const input = `${E2EE_SALT}:${sorted.join(':')}:${connectionId}`;
  const master = new Uint8Array(await sha256(toUtf8(input))) as Bytes;

  const encKeyRaw = await sha256(concatBuffers(master, new Uint8Array([0x01]) as Bytes));
  const macKeyRaw = await sha256(concatBuffers(master, new Uint8Array([0x02]) as Bytes));

  const encKey = await crypto.subtle.importKey('raw', encKeyRaw, { name: 'AES-CBC' }, false, [
    'encrypt',
    'decrypt',
  ]);

  const macKey = await crypto.subtle.importKey(
    'raw',
    macKeyRaw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  const keys: DerivedKeys = { encKey, macKey, encKeyRaw, macKeyRaw };
  keyCache.set(cacheKey, keys);
  return keys;
}

export async function encryptContent(plaintext: string, keys: DerivedKeys): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Bytes;
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, keys.encKey, toUtf8(plaintext))
  ) as Bytes;
  const hmac = new Uint8Array(
    await crypto.subtle.sign('HMAC', keys.macKey, concatBuffers(iv, ciphertext))
  ) as Bytes;
  const payload = concatBuffers(iv, hmac, ciphertext);
  return E2EE_PREFIX + toBase64(payload);
}

async function encryptWithPrefix(plaintext: string, keys: DerivedKeys, prefix: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Bytes;
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, keys.encKey, toUtf8(plaintext))
  ) as Bytes;
  const hmac = new Uint8Array(
    await crypto.subtle.sign('HMAC', keys.macKey, concatBuffers(iv, ciphertext))
  ) as Bytes;
  const payload = concatBuffers(iv, hmac, ciphertext);
  return prefix + toBase64(payload);
}

async function decryptWithPrefix(content: string, keys: DerivedKeys, prefix: string): Promise<string> {
  if (!content.startsWith(prefix)) return content;

  try {
    const payload = fromBase64(content.slice(prefix.length));
    if (payload.length < IV_LENGTH + HMAC_LENGTH + 1) return content;

    const iv = payload.slice(0, IV_LENGTH);
    const storedHmac = payload.slice(IV_LENGTH, IV_LENGTH + HMAC_LENGTH);
    const ciphertext = payload.slice(IV_LENGTH + HMAC_LENGTH);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      keys.macKey,
      storedHmac,
      concatBuffers(iv, ciphertext)
    );
    if (!isValid) {
      console.warn('MessageCrypto: HMAC verification failed');
      return content;
    }

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, keys.encKey, ciphertext);
    return fromUtf8(decrypted);
  } catch (err) {
    console.warn('MessageCrypto: decryption failed', err);
    return content;
  }
}

export async function decryptContent(content: string, keys: DerivedKeys): Promise<string> {
  return decryptWithPrefix(content, keys, E2EE_PREFIX);
}

export async function encryptGroupMessageContent(
  plaintext: string,
  groupMasterKey32: ArrayBuffer,
): Promise<string> {
  const keys = await deriveKeysFromGroupMaster(groupMasterKey32);
  return encryptWithPrefix(plaintext, keys, E2EE_GROUP_MSG_PREFIX);
}

export async function decryptGroupMessageContent(
  content: string,
  groupMasterKey32: ArrayBuffer,
): Promise<string> {
  const keys = await deriveKeysFromGroupMaster(groupMasterKey32);
  return decryptWithPrefix(content, keys, E2EE_GROUP_MSG_PREFIX);
}

export function isEncrypted(content: string): boolean {
  return content.startsWith(E2EE_PREFIX);
}

export function isGroupMessageEncrypted(content: string): boolean {
  return content.startsWith(E2EE_GROUP_MSG_PREFIX);
}

export function isAnyE2eeWireContent(content: string): boolean {
  return isEncrypted(content) || isGroupMessageEncrypted(content);
}
