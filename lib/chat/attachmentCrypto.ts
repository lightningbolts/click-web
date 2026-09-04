/**
 * Per-file E2EE pipeline for chat attachments (Phase 2 — B3).
 *
 * Strict parity with the KMP implementation at
 * `click/composeApp/src/commonMain/kotlin/compose/project/click/click/chat/attachments/AttachmentCrypto.kt`.
 *
 * Wire format (raw attachment bytes): `IV[16] || HMAC[32] || ciphertext` (AES-256-CBC, encrypt-
 * then-MAC). Each attachment gets a fresh 32-byte master key; enc/mac subkeys are derived
 * identically to `MessageCrypto.deriveMessageKeysFromGroupMaster`. The master travels inside the
 * normal E2EE message body as a JSON envelope prefixed with [ENVELOPE_PREFIX].
 */

/** Envelope prefix used inside the decrypted E2EE message body. */
export const ENVELOPE_PREFIX = 'ccx:v1:';
/** Prefix for file descriptors whose bytes use the chat epoch AES-GCM media protocol. */
export const E2EE_V2_ATTACHMENT_PREFIX = 'ccx:v2:';

/** Length of the per-file master key, in bytes. */
export const FILE_MASTER_KEY_BYTES = 32;

const IV_LENGTH = 16;
const HMAC_LENGTH = 32;

export interface AttachmentEnvelope {
  v: 1;
  type: 'file';
  name: string;
  mime: string;
  size: number;
  path: string;
  /** Base64 of the 32-byte per-file master key. */
  key: string;
  /** Base64 of the SHA-256 of the *plaintext* bytes. */
  sha256: string;
}

export interface AttachmentV2Descriptor {
  v: 2;
  type: 'file';
  name: string;
  mime: string;
  size: number;
  path: string;
  /** Base64(SHA-256 of the exact uploaded AES-GCM payload). */
  mediaCiphertextSha256: string;
}

type Bytes = Uint8Array<ArrayBuffer>;

function toBytes(data: ArrayBuffer | Uint8Array): Bytes {
  return (data instanceof Uint8Array ? (data as Bytes) : (new Uint8Array(data) as Bytes));
}

function concatBytes(...parts: (Bytes | ArrayBuffer)[]): Bytes {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)) as Bytes);
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total) as Bytes;
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function toBase64(data: Bytes): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Bytes {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length) as Bytes;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Bytes(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data)) as Bytes;
}

async function importEncKey(rawEnc: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawEnc, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
}

async function importMacKey(rawMac: Bytes): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawMac, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function deriveSubkeys(masterKey32: Bytes): Promise<{ enc: CryptoKey; mac: CryptoKey }> {
  if (masterKey32.length !== FILE_MASTER_KEY_BYTES) {
    throw new Error(`File master key must be ${FILE_MASTER_KEY_BYTES} bytes`);
  }
  const encRaw = await sha256Bytes(concatBytes(masterKey32, new Uint8Array([0x01]) as Bytes));
  const macRaw = await sha256Bytes(concatBytes(masterKey32, new Uint8Array([0x02]) as Bytes));
  const [enc, mac] = await Promise.all([importEncKey(encRaw), importMacKey(macRaw)]);
  return { enc, mac };
}

/** Fresh 32-byte per-file master key. Never reuse across attachments. */
export function generateFileMasterKey(): Bytes {
  return crypto.getRandomValues(new Uint8Array(FILE_MASTER_KEY_BYTES)) as Bytes;
}

/** Encrypt attachment bytes. Returns `IV || HMAC || ciphertext`. */
export async function encryptFileBytes(
  plain: ArrayBuffer | Uint8Array,
  fileMasterKey32: ArrayBuffer | Uint8Array,
): Promise<Bytes> {
  const key = toBytes(fileMasterKey32);
  const { enc, mac } = await deriveSubkeys(key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as Bytes;
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, enc, toBytes(plain)),
  ) as Bytes;
  const hmac = new Uint8Array(
    await crypto.subtle.sign('HMAC', mac, concatBytes(iv, ciphertext)),
  ) as Bytes;
  return concatBytes(iv, hmac, ciphertext);
}

/** Decrypt attachment bytes. Throws on HMAC failure or malformed input. */
export async function decryptFileBytes(
  blob: ArrayBuffer | Uint8Array,
  fileMasterKey32: ArrayBuffer | Uint8Array,
): Promise<Bytes> {
  const bytes = toBytes(blob);
  if (bytes.length < IV_LENGTH + HMAC_LENGTH + 1) {
    throw new Error('Encrypted attachment blob too short');
  }
  const key = toBytes(fileMasterKey32);
  const { enc, mac } = await deriveSubkeys(key);

  const iv = bytes.slice(0, IV_LENGTH) as Bytes;
  const storedHmac = bytes.slice(IV_LENGTH, IV_LENGTH + HMAC_LENGTH) as Bytes;
  const ciphertext = bytes.slice(IV_LENGTH + HMAC_LENGTH) as Bytes;

  const isValid = await crypto.subtle.verify('HMAC', mac, storedHmac, concatBytes(iv, ciphertext));
  if (!isValid) {
    throw new Error('Attachment HMAC verification failed');
  }
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, enc, ciphertext);
  return new Uint8Array(decrypted) as Bytes;
}

export function encodeFileMasterKeyBase64(key: ArrayBuffer | Uint8Array): string {
  const b = toBytes(key);
  if (b.length !== FILE_MASTER_KEY_BYTES) throw new Error('File master key must be 32 bytes');
  return toBase64(b);
}

export function decodeFileMasterKeyBase64(b64: string): Bytes {
  const raw = fromBase64(b64.trim());
  if (raw.length !== FILE_MASTER_KEY_BYTES) throw new Error('Decoded file master key must be 32 bytes');
  return raw;
}

export async function sha256Base64(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  return toBase64(await sha256Bytes(toBytes(bytes)));
}

/** Serialise an envelope to the wire form `ccx:v1:<json>`. */
export function encodeEnvelope(env: AttachmentEnvelope): string {
  return ENVELOPE_PREFIX + JSON.stringify(env);
}

/** Serialize a file descriptor whose payload was encrypted with an E2EE v2 chat epoch key. */
export function encodeV2AttachmentDescriptor(env: AttachmentV2Descriptor): string {
  return E2EE_V2_ATTACHMENT_PREFIX + JSON.stringify(env);
}

/**
 * Try to parse an envelope. Returns `null` if [content] is not an attachment payload — the
 * caller should then treat it as a plain text message (backwards-compatible fallback).
 */
export function tryDecodeEnvelope(content: string): AttachmentEnvelope | null {
  if (!content.startsWith(ENVELOPE_PREFIX)) return null;
  try {
    const body = content.slice(ENVELOPE_PREFIX.length);
    const parsed = JSON.parse(body);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.name !== 'string' ||
      typeof parsed.mime !== 'string' ||
      typeof parsed.path !== 'string' ||
      typeof parsed.key !== 'string' ||
      typeof parsed.sha256 !== 'string' ||
      typeof parsed.size !== 'number'
    ) {
      return null;
    }
    return parsed as AttachmentEnvelope;
  } catch {
    return null;
  }
}

function isSha256Base64(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  try {
    return atob(value).length === 32;
  } catch {
    return false;
  }
}

/** Strictly parse a v2 file descriptor after the surrounding message is decrypted. */
export function tryDecodeV2AttachmentDescriptor(content: string): AttachmentV2Descriptor | null {
  if (!content.startsWith(E2EE_V2_ATTACHMENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(content.slice(E2EE_V2_ATTACHMENT_PREFIX.length)) as Record<string, unknown>;
    const keys = Object.keys(parsed).sort();
    if (keys.join('|') !== 'mediaCiphertextSha256|mime|name|path|size|type|v') return null;
    if (
      parsed.v !== 2 ||
      parsed.type !== 'file' ||
      typeof parsed.name !== 'string' ||
      parsed.name.length === 0 ||
      parsed.name.length > 256 ||
      typeof parsed.mime !== 'string' ||
      parsed.mime.length === 0 ||
      parsed.mime.length > 256 ||
      typeof parsed.path !== 'string' ||
      parsed.path.length === 0 ||
      parsed.path.startsWith('/') ||
      parsed.path.includes('..') ||
      typeof parsed.size !== 'number' ||
      !Number.isSafeInteger(parsed.size) ||
      parsed.size < 0 ||
      !isSha256Base64(parsed.mediaCiphertextSha256)
    ) {
      return null;
    }
    return parsed as unknown as AttachmentV2Descriptor;
  } catch {
    return null;
  }
}

export function isAttachmentEnvelope(content: string): boolean {
  return content.startsWith(ENVELOPE_PREFIX) || content.startsWith(E2EE_V2_ATTACHMENT_PREFIX);
}
