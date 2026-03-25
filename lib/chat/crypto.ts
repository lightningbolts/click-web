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
const IV_LENGTH = 16;
const HMAC_LENGTH = 32;
const E2EE_SALT = 'click-platforms-e2ee-v1-2024';

export interface DerivedKeys {
  encKey: CryptoKey;
  macKey: CryptoKey;
  encKeyRaw: ArrayBuffer;
  macKeyRaw: ArrayBuffer;
}

const keyCache = new Map<string, DerivedKeys>();

async function sha256(data: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', data);
}

function concatBuffers(...buffers: (Uint8Array | ArrayBuffer)[]): Uint8Array {
  const arrays = buffers.map((b) => (b instanceof Uint8Array ? b : new Uint8Array(b)));
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function toUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function fromUtf8(data: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(data);
}

function toBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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
  const master = new Uint8Array(await sha256(toUtf8(input)));

  const encKeyRaw = await sha256(concatBuffers(master, new Uint8Array([0x01])));
  const macKeyRaw = await sha256(concatBuffers(master, new Uint8Array([0x02])));

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
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, keys.encKey, toUtf8(plaintext))
  );
  const hmac = new Uint8Array(
    await crypto.subtle.sign('HMAC', keys.macKey, concatBuffers(iv, ciphertext))
  );
  const payload = concatBuffers(iv, hmac, ciphertext);
  return E2EE_PREFIX + toBase64(payload);
}

export async function decryptContent(content: string, keys: DerivedKeys): Promise<string> {
  if (!content.startsWith(E2EE_PREFIX)) return content;

  try {
    const payload = fromBase64(content.slice(E2EE_PREFIX.length));
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

export function isEncrypted(content: string): boolean {
  return content.startsWith(E2EE_PREFIX);
}
