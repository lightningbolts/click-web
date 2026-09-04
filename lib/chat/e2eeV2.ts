/**
 * Release Train C E2EE v2 foundation.
 *
 * This module is deliberately transport- and persistence-agnostic. The rollout flag and
 * route/API integration are a follow-up gate; existing `e2e:` v1 content is never rewritten
 * here. Keep `privateKey` in IndexedDB (or equivalent non-extractable platform storage). This
 * library intentionally has no private-key export API and never logs plaintext or key material.
 */

export const E2EE_V2_PREFIX = 'e2e2:';
export const E2EE_V2_CRYPTO_VERSION = 2 as const;
export const E2EE_V2_NONCE_BYTES = 12;
export const E2EE_V2_EPOCH_KEY_BYTES = 32;

const AES_GCM_TAG_BITS = 128;
const X25519_NAME = 'X25519';
const HKDF_SALT = 'click-platforms-e2ee-v2-hkdf-sha256';
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type Bytes = Uint8Array<ArrayBuffer>;

export interface DeviceIdentity {
  /** Non-extractable private key; persist this CryptoKey in IndexedDB, never as raw bytes. */
  readonly privateKey: CryptoKey;
  readonly publicKey: CryptoKey;
  /** SPKI/base64 public key for registration in public.chat_devices. */
  readonly publicKeySpkiBase64: string;
  readonly cryptoVersion: typeof E2EE_V2_CRYPTO_VERSION;
}

export interface MessageMetadata {
  readonly chatId: string;
  readonly epoch: number;
  readonly senderDeviceId: string;
  readonly clientMessageId: string;
}

export interface MediaAuthorizationMetadata extends MessageMetadata {
  /** Base64(SHA-256(uploaded ciphertext bytes)); authenticated by the authorization envelope. */
  readonly mediaCiphertextSha256: string;
}

export interface MessageEnvelope extends MessageMetadata {
  readonly v: typeof E2EE_V2_CRYPTO_VERSION;
  readonly type: 'message';
  readonly cryptoVersion: typeof E2EE_V2_CRYPTO_VERSION;
  readonly nonce: string;
  readonly ciphertext: string;
}

export interface MediaAuthorizationEnvelope extends MediaAuthorizationMetadata {
  readonly v: typeof E2EE_V2_CRYPTO_VERSION;
  readonly type: 'media';
  readonly cryptoVersion: typeof E2EE_V2_CRYPTO_VERSION;
  readonly nonce: string;
  readonly ciphertext: string;
}

export interface EncryptMessageRequest extends MessageMetadata {
  readonly epochKey: ArrayBuffer | Uint8Array;
  readonly plaintext: string;
  readonly replayGuard?: ReplayGuard;
}

export interface AuthorizeMediaRequest extends MediaAuthorizationMetadata {
  readonly epochKey: ArrayBuffer | Uint8Array;
  readonly replayGuard?: ReplayGuard;
}

export interface EncryptMediaPayloadRequest extends MessageMetadata {
  readonly epochKey: ArrayBuffer | Uint8Array;
  readonly plaintext: ArrayBuffer | Uint8Array;
}

export interface DecryptMessageRequest extends MessageMetadata {
  readonly epochKey: ArrayBuffer | Uint8Array;
  readonly envelope: string;
  readonly replayGuard?: ReplayGuard;
}

export interface EpochKeyWrapMetadata {
  readonly chatId: string;
  readonly epoch: number;
  readonly senderDeviceId: string;
  readonly recipientDeviceId: string;
}

export interface EpochKeyWrapEnvelope extends EpochKeyWrapMetadata {
  readonly v: typeof E2EE_V2_CRYPTO_VERSION;
  readonly type: 'epoch-key-wrap';
  readonly cryptoVersion: typeof E2EE_V2_CRYPTO_VERSION;
  readonly ephemeralPublicKey: string;
  readonly nonce: string;
  readonly ciphertext: string;
}

export interface WrapEpochKeyRequest extends EpochKeyWrapMetadata {
  readonly epochKey: ArrayBuffer | Uint8Array;
  readonly recipientPublicKey: CryptoKey;
  readonly replayGuard?: ReplayGuard;
}

export interface UnwrapEpochKeyRequest extends EpochKeyWrapMetadata {
  readonly envelope: string;
  readonly recipientPrivateKey: CryptoKey;
  readonly replayGuard?: ReplayGuard;
}

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('WebCrypto is required for E2EE v2');
  }
  return globalThis.crypto;
}

function toBytes(value: ArrayBuffer | Uint8Array): Bytes {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value) as Bytes;
  }
  return new Uint8Array(value) as Bytes;
}

function utf8(value: string): Bytes {
  return new TextEncoder().encode(value) as Bytes;
}

function fromUtf8(value: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(toBytes(value));
}

function toBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = toBytes(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string, field: string): Bytes {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value) ||
    value.slice(0, -2).includes('=')
  ) {
    throw new Error(`Malformed ${field}`);
  }
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0)) as Bytes;
  } catch {
    throw new Error(`Malformed ${field}`);
  }
}

function validateIdentifier(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim() !== value || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${field} must be a strict identifier`);
  }
  return value;
}

function validateEpoch(epoch: number): number {
  if (!Number.isSafeInteger(epoch) || epoch <= 0) {
    throw new Error('epoch must be a positive integer');
  }
  return epoch;
}

function validateEpochKey(value: ArrayBuffer | Uint8Array): Bytes {
  const key = toBytes(value);
  if (key.byteLength !== E2EE_V2_EPOCH_KEY_BYTES) {
    throw new Error(`epochKey must be exactly ${E2EE_V2_EPOCH_KEY_BYTES} bytes`);
  }
  return key;
}

function validateNonce(value: Bytes): Bytes {
  if (value.byteLength !== E2EE_V2_NONCE_BYTES) {
    throw new Error(`nonce must be exactly ${E2EE_V2_NONCE_BYTES} bytes`);
  }
  return value;
}

function validateDigest(value: string): string {
  const digest = fromBase64(value, 'media ciphertext digest');
  if (digest.byteLength !== 32) throw new Error('media ciphertext digest must be SHA-256');
  return value;
}

function validateMetadata(metadata: MessageMetadata): MessageMetadata {
  return {
    chatId: validateIdentifier(metadata.chatId, 'chatId'),
    epoch: validateEpoch(metadata.epoch),
    senderDeviceId: validateIdentifier(metadata.senderDeviceId, 'senderDeviceId'),
    clientMessageId: validateIdentifier(metadata.clientMessageId, 'clientMessageId'),
  };
}

function validateMediaMetadata(metadata: MediaAuthorizationMetadata): MediaAuthorizationMetadata {
  return {
    ...validateMetadata(metadata),
    mediaCiphertextSha256: validateDigest(metadata.mediaCiphertextSha256),
  };
}

function validateWrapMetadata(metadata: EpochKeyWrapMetadata): EpochKeyWrapMetadata {
  return {
    chatId: validateIdentifier(metadata.chatId, 'chatId'),
    epoch: validateEpoch(metadata.epoch),
    senderDeviceId: validateIdentifier(metadata.senderDeviceId, 'senderDeviceId'),
    recipientDeviceId: validateIdentifier(metadata.recipientDeviceId, 'recipientDeviceId'),
  };
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'algorithm' in value &&
    'extractable' in value
  );
}

function validateX25519Key(key: CryptoKey, type: 'private' | 'public'): void {
  if (!isCryptoKey(key) || key.type !== type || key.algorithm.name !== X25519_NAME) {
    throw new Error(`${type} key must be an X25519 CryptoKey`);
  }
  if (type === 'private' && key.extractable) {
    throw new Error('X25519 private key must be non-extractable');
  }
}

function canonicalMessageMetadata(metadata: MessageMetadata): Bytes {
  const checked = validateMetadata(metadata);
  const value: Record<string, unknown> = {
      chatId: checked.chatId,
      epoch: checked.epoch,
      senderDeviceId: checked.senderDeviceId,
      cryptoVersion: E2EE_V2_CRYPTO_VERSION,
      clientMessageId: checked.clientMessageId,
  };
  const mediaDigest = (metadata as Partial<MediaAuthorizationMetadata>).mediaCiphertextSha256;
  if (mediaDigest !== undefined) value.mediaCiphertextSha256 = validateDigest(mediaDigest);
  return utf8(JSON.stringify(value));
}

function canonicalMediaMetadata(metadata: MediaAuthorizationMetadata): Bytes {
  const checked = validateMediaMetadata(metadata);
  return utf8(JSON.stringify({
    chatId: checked.chatId,
    epoch: checked.epoch,
    senderDeviceId: checked.senderDeviceId,
    cryptoVersion: E2EE_V2_CRYPTO_VERSION,
    clientMessageId: checked.clientMessageId,
    mediaCiphertextSha256: checked.mediaCiphertextSha256,
    purpose: 'media-authorization',
  }));
}

function canonicalMediaPayloadMetadata(metadata: MessageMetadata): Bytes {
  const checked = validateMetadata(metadata);
  return utf8(JSON.stringify({
    chatId: checked.chatId,
    epoch: checked.epoch,
    senderDeviceId: checked.senderDeviceId,
    cryptoVersion: E2EE_V2_CRYPTO_VERSION,
    clientMessageId: checked.clientMessageId,
    purpose: 'media-payload',
  }));
}

function canonicalWrapMetadata(metadata: EpochKeyWrapMetadata): Bytes {
  const checked = validateWrapMetadata(metadata);
  return utf8(
    JSON.stringify({
      chatId: checked.chatId,
      epoch: checked.epoch,
      senderDeviceId: checked.senderDeviceId,
      recipientDeviceId: checked.recipientDeviceId,
      cryptoVersion: E2EE_V2_CRYPTO_VERSION,
      purpose: 'epoch-key-wrap',
    }),
  );
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function parseJsonEnvelope(wire: string): Record<string, unknown> {
  if (typeof wire !== 'string' || !wire.startsWith(E2EE_V2_PREFIX)) {
    throw new Error('Not an e2e2 envelope');
  }
  const encoded = wire.slice(E2EE_V2_PREFIX.length);
  const decoded = fromBase64(encoded, 'envelope');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromUtf8(decoded));
  } catch {
    throw new Error('Malformed e2e2 envelope JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Malformed e2e2 envelope');
  }
  return parsed as Record<string, unknown>;
}

function validateCommonEnvelope(value: Record<string, unknown>, type: string): void {
  if (
    value.v !== E2EE_V2_CRYPTO_VERSION ||
    value.type !== type ||
    value.cryptoVersion !== E2EE_V2_CRYPTO_VERSION ||
    typeof value.nonce !== 'string' ||
    validateNonce(fromBase64(value.nonce, 'nonce')).byteLength !== E2EE_V2_NONCE_BYTES ||
    typeof value.ciphertext !== 'string' ||
    fromBase64(value.ciphertext, 'ciphertext').byteLength < AES_GCM_TAG_BITS / 8
  ) {
    throw new Error('Malformed e2e2 envelope');
  }
}

function parseMessageEnvelope(wire: string): MessageEnvelope {
  const value = parseJsonEnvelope(wire);
  const baseKeys = [
      'v',
      'type',
      'chatId',
      'epoch',
      'senderDeviceId',
      'cryptoVersion',
      'clientMessageId',
      'nonce',
      'ciphertext',
  ];
  const expectedKeys = value.mediaCiphertextSha256 === undefined
    ? baseKeys
    : [...baseKeys, 'mediaCiphertextSha256'];
  if (!exactKeys(value, expectedKeys)) {
    throw new Error('Malformed message envelope fields');
  }
  validateCommonEnvelope(value, 'message');
  const metadata = validateMetadata({
    chatId: value.chatId as string,
    epoch: value.epoch as number,
    senderDeviceId: value.senderDeviceId as string,
    clientMessageId: value.clientMessageId as string,
  });
  const result: MessageEnvelope = {
    ...metadata,
    v: E2EE_V2_CRYPTO_VERSION,
    type: 'message',
    cryptoVersion: E2EE_V2_CRYPTO_VERSION,
    nonce: value.nonce as string,
    ciphertext: value.ciphertext as string,
  };
  if (value.mediaCiphertextSha256 !== undefined) {
    (result as MessageEnvelope & { mediaCiphertextSha256: string }).mediaCiphertextSha256 =
      validateDigest(value.mediaCiphertextSha256 as string);
  }
  return result;
}

function parseMediaAuthorizationEnvelope(wire: string): MediaAuthorizationEnvelope {
  const value = parseJsonEnvelope(wire);
  if (!exactKeys(value, [
    'v', 'type', 'chatId', 'epoch', 'senderDeviceId', 'cryptoVersion', 'clientMessageId',
    'mediaCiphertextSha256', 'nonce', 'ciphertext',
  ])) {
    throw new Error('Malformed media authorization envelope fields');
  }
  validateCommonEnvelope(value, 'media');
  const metadata = validateMediaMetadata({
    chatId: value.chatId as string,
    epoch: value.epoch as number,
    senderDeviceId: value.senderDeviceId as string,
    clientMessageId: value.clientMessageId as string,
    mediaCiphertextSha256: value.mediaCiphertextSha256 as string,
  });
  return {
    ...metadata,
    v: E2EE_V2_CRYPTO_VERSION,
    type: 'media',
    cryptoVersion: E2EE_V2_CRYPTO_VERSION,
    nonce: value.nonce as string,
    ciphertext: value.ciphertext as string,
  };
}

function parseWrapEnvelope(wire: string): EpochKeyWrapEnvelope {
  const value = parseJsonEnvelope(wire);
  if (
    !exactKeys(value, [
      'v',
      'type',
      'chatId',
      'epoch',
      'senderDeviceId',
      'recipientDeviceId',
      'cryptoVersion',
      'ephemeralPublicKey',
      'nonce',
      'ciphertext',
    ])
  ) {
    throw new Error('Malformed epoch-key envelope fields');
  }
  validateCommonEnvelope(value, 'epoch-key-wrap');
  const metadata = validateWrapMetadata({
    chatId: value.chatId as string,
    epoch: value.epoch as number,
    senderDeviceId: value.senderDeviceId as string,
    recipientDeviceId: value.recipientDeviceId as string,
  });
  if (typeof value.ephemeralPublicKey !== 'string') {
    throw new Error('Malformed ephemeral public key');
  }
  fromBase64(value.ephemeralPublicKey, 'ephemeral public key');
  return {
    ...metadata,
    v: E2EE_V2_CRYPTO_VERSION,
    type: 'epoch-key-wrap',
    cryptoVersion: E2EE_V2_CRYPTO_VERSION,
    ephemeralPublicKey: value.ephemeralPublicKey,
    nonce: value.nonce as string,
    ciphertext: value.ciphertext as string,
  };
}

function encodeJsonEnvelope(value: MessageEnvelope | EpochKeyWrapEnvelope | MediaAuthorizationEnvelope): string {
  return E2EE_V2_PREFIX + toBase64(utf8(JSON.stringify(value)));
}

async function importAesKey(raw: Bytes): Promise<CryptoKey> {
  return getCrypto().subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function deriveWrappingKey(
  sharedSecret: CryptoKey,
  metadata: EpochKeyWrapMetadata,
): Promise<CryptoKey> {
  return getCrypto().subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8(HKDF_SALT),
      info: canonicalWrapMetadata(metadata),
    },
    sharedSecret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function deriveSharedSecretKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  validateX25519Key(privateKey, 'private');
  validateX25519Key(publicKey, 'public');
  const bits = await getCrypto().subtle.deriveBits(
    { name: X25519_NAME, public: publicKey } as AlgorithmIdentifier,
    privateKey,
    256,
  );
  return getCrypto().subtle.importKey('raw', bits, { name: 'HKDF' }, false, ['deriveKey']);
}

/** Generate an X25519 device identity. The private CryptoKey is non-extractable by construction. */
export async function generateDeviceIdentity(): Promise<DeviceIdentity> {
  const pair = (await getCrypto().subtle.generateKey(
    { name: X25519_NAME },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair;
  validateX25519Key(pair.publicKey, 'public');
  const publicKeySpkiBase64 = await exportPublicKeySpkiBase64(pair.publicKey);
  // Some WebCrypto implementations apply the extractable flag to both keys in a pair. Export
  // only the generated private PKCS8 long enough to re-import it as a non-extractable CryptoKey;
  // the bytes never leave this function and there is no private-key export API.
  const privatePkcs8 = await getCrypto().subtle.exportKey('pkcs8', pair.privateKey);
  const privateKey = await getCrypto().subtle.importKey(
    'pkcs8',
    privatePkcs8,
    { name: X25519_NAME },
    false,
    ['deriveBits'],
  );
  validateX25519Key(privateKey, 'private');
  return {
    privateKey,
    publicKey: pair.publicKey,
    publicKeySpkiBase64,
    cryptoVersion: E2EE_V2_CRYPTO_VERSION,
  };
}

/** Export only an X25519 public key as standard SPKI/base64 for device registration. */
export async function exportPublicKeySpkiBase64(publicKey: CryptoKey): Promise<string> {
  validateX25519Key(publicKey, 'public');
  return toBase64(await getCrypto().subtle.exportKey('spki', publicKey));
}

/** Import an X25519 SPKI/base64 public key; private-key material is not accepted. */
export async function importPublicKeySpkiBase64(spkiBase64: string): Promise<CryptoKey> {
  const spki = fromBase64(spkiBase64, 'public key');
  try {
    return await getCrypto().subtle.importKey('spki', spki, { name: X25519_NAME }, true, []);
  } catch {
    throw new Error('Invalid X25519 public key');
  }
}

/** Derive a non-extractable HKDF base key from an X25519 key agreement. */
export async function deriveX25519SharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<CryptoKey> {
  return deriveSharedSecretKey(privateKey, publicKey);
}

/** Generate a fresh random 32-byte epoch key. */
export function generateEpochKey(): Bytes {
  return getCrypto().getRandomValues(new Uint8Array(E2EE_V2_EPOCH_KEY_BYTES)) as Bytes;
}

/**
 * Tracks authenticated envelope identities and nonces. A nonce is reserved before decryption so
 * concurrent calls and failed-authentication retries fail closed rather than permitting reuse.
 */
export class ReplayGuard {
  private readonly nonces = new Set<string>();
  private readonly envelopes = new Set<string>();

  reserve(nonce: string, envelopeIdentity: string): void {
    if (this.nonces.has(nonce) || this.envelopes.has(envelopeIdentity)) {
      throw new Error('E2EE v2 replay or nonce reuse detected');
    }
    this.nonces.add(nonce);
    this.envelopes.add(envelopeIdentity);
  }

  hasSeenNonce(nonce: string): boolean {
    return this.nonces.has(nonce);
  }

  get size(): number {
    return this.envelopes.size;
  }
}

/** Parse and strictly validate a message or epoch-key envelope without decrypting it. */
export function parseE2eeV2Envelope(
  wire: string,
): MessageEnvelope | EpochKeyWrapEnvelope | MediaAuthorizationEnvelope {
  const value = parseJsonEnvelope(wire);
  if (value.type === 'message') return parseMessageEnvelope(wire);
  if (value.type === 'media') return parseMediaAuthorizationEnvelope(wire);
  return parseWrapEnvelope(wire);
}

/** Encrypt a message with AES-256-GCM and authenticated canonical metadata. */
export async function encryptMessage(request: EncryptMessageRequest): Promise<string> {
  const metadata = validateMetadata(request);
  if (typeof request.plaintext !== 'string') throw new Error('plaintext must be a string');
  const epochKey = validateEpochKey(request.epochKey);
  const nonce = validateNonce(getCrypto().getRandomValues(new Uint8Array(E2EE_V2_NONCE_BYTES)) as Bytes);
  const nonceBase64 = toBase64(nonce);
  request.replayGuard?.reserve(nonceBase64, JSON.stringify({ ...metadata, nonce: nonceBase64 }));
  const ciphertext = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: canonicalMessageMetadata(metadata), tagLength: AES_GCM_TAG_BITS },
    await importAesKey(epochKey),
    utf8(request.plaintext),
  );
  const envelope: MessageEnvelope = {
    ...metadata,
    v: E2EE_V2_CRYPTO_VERSION,
    type: 'message',
    cryptoVersion: E2EE_V2_CRYPTO_VERSION,
    nonce: nonceBase64,
    ciphertext: toBase64(ciphertext),
  };
  return encodeJsonEnvelope(envelope);
}

/** Create an opaque authorization envelope for one encrypted media blob. */
export async function authorizeMedia(request: AuthorizeMediaRequest): Promise<string> {
  const metadata = validateMediaMetadata(request);
  const epochKey = validateEpochKey(request.epochKey);
  const nonce = validateNonce(getCrypto().getRandomValues(new Uint8Array(E2EE_V2_NONCE_BYTES)) as Bytes);
  const nonceBase64 = toBase64(nonce);
  request.replayGuard?.reserve(nonceBase64, JSON.stringify({ ...metadata, nonce: nonceBase64 }));
  const ciphertext = await getCrypto().subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: canonicalMediaMetadata(metadata),
      tagLength: AES_GCM_TAG_BITS,
    },
    await importAesKey(epochKey),
    utf8('click-e2ee-v2-media-authorization'),
  );
  return encodeJsonEnvelope({
    ...metadata,
    v: E2EE_V2_CRYPTO_VERSION,
    type: 'media',
    cryptoVersion: E2EE_V2_CRYPTO_VERSION,
    nonce: nonceBase64,
    ciphertext: toBase64(ciphertext),
  } as MediaAuthorizationEnvelope);
}

/** Encrypt media as nonce || AES-GCM(ciphertext+tag); the upload digest is separately authorized. */
export async function encryptMediaPayload(
  request: EncryptMediaPayloadRequest,
): Promise<{ payload: Bytes; mediaCiphertextSha256: string }> {
  const metadata = validateMetadata(request);
  const epochKey = validateEpochKey(request.epochKey);
  const nonce = validateNonce(getCrypto().getRandomValues(new Uint8Array(E2EE_V2_NONCE_BYTES)) as Bytes);
  const ciphertext = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: canonicalMediaPayloadMetadata(metadata), tagLength: AES_GCM_TAG_BITS },
    await importAesKey(epochKey),
    toBytes(request.plaintext),
  );
  const payload = new Uint8Array(nonce.byteLength + ciphertext.byteLength) as Bytes;
  payload.set(nonce, 0);
  payload.set(new Uint8Array(ciphertext), nonce.byteLength);
  const digest = await getCrypto().subtle.digest('SHA-256', payload);
  return { payload, mediaCiphertextSha256: toBase64(digest) };
}

export async function decryptMediaPayload(
  metadata: MessageMetadata,
  epochKey: ArrayBuffer | Uint8Array,
  payload: ArrayBuffer | Uint8Array,
  expectedMediaCiphertextSha256?: string,
): Promise<Bytes> {
  const bytes = toBytes(payload);
  if (bytes.byteLength < E2EE_V2_NONCE_BYTES + AES_GCM_TAG_BITS / 8) throw new Error('Malformed E2EE v2 media payload');
  if (expectedMediaCiphertextSha256 !== undefined) {
    const digest = toBase64(await getCrypto().subtle.digest('SHA-256', bytes));
    if (digest !== validateDigest(expectedMediaCiphertextSha256)) throw new Error('E2EE v2 media ciphertext digest mismatch');
  }
  const plaintext = await getCrypto().subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes.slice(0, E2EE_V2_NONCE_BYTES),
      additionalData: canonicalMediaPayloadMetadata(metadata),
      tagLength: AES_GCM_TAG_BITS,
    },
    await importAesKey(validateEpochKey(epochKey)),
    bytes.slice(E2EE_V2_NONCE_BYTES),
  );
  return new Uint8Array(plaintext) as Bytes;
}

/** Decrypt a message only when all caller-supplied metadata exactly matches the authenticated envelope. */
export async function decryptMessage(request: DecryptMessageRequest): Promise<string> {
  const expected = validateMetadata(request);
  const envelope = parseMessageEnvelope(request.envelope);
  if (
    envelope.chatId !== expected.chatId ||
    envelope.epoch !== expected.epoch ||
    envelope.senderDeviceId !== expected.senderDeviceId ||
    envelope.clientMessageId !== expected.clientMessageId
  ) {
    throw new Error('E2EE v2 authenticated metadata mismatch');
  }
  const nonce = fromBase64(envelope.nonce, 'nonce');
  const identity = JSON.stringify({ ...expected, nonce: envelope.nonce });
  request.replayGuard?.reserve(envelope.nonce, identity);
  try {
    const plaintext = await getCrypto().subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: canonicalMessageMetadata(expected),
        tagLength: AES_GCM_TAG_BITS,
      },
      await importAesKey(validateEpochKey(request.epochKey)),
      fromBase64(envelope.ciphertext, 'ciphertext'),
    );
    return fromUtf8(plaintext);
  } catch {
    throw new Error('E2EE v2 message authentication failed');
  }
}

/** Wrap one epoch key for a device using ephemeral X25519, HKDF-SHA-256, and AES-256-GCM. */
export async function wrapEpochKey(request: WrapEpochKeyRequest): Promise<string> {
  const metadata = validateWrapMetadata(request);
  const epochKey = validateEpochKey(request.epochKey);
  validateX25519Key(request.recipientPublicKey, 'public');
  const ephemeral = await generateDeviceIdentity();
  const sharedSecret = await deriveSharedSecretKey(ephemeral.privateKey, request.recipientPublicKey);
  const wrappingKey = await deriveWrappingKey(sharedSecret, metadata);
  const nonce = validateNonce(getCrypto().getRandomValues(new Uint8Array(E2EE_V2_NONCE_BYTES)) as Bytes);
  const nonceBase64 = toBase64(nonce);
  request.replayGuard?.reserve(nonceBase64, JSON.stringify({ ...metadata, nonce: nonceBase64 }));
  const ciphertext = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: canonicalWrapMetadata(metadata), tagLength: AES_GCM_TAG_BITS },
    wrappingKey,
    epochKey,
  );
  const envelope: EpochKeyWrapEnvelope = {
    ...metadata,
    v: E2EE_V2_CRYPTO_VERSION,
    type: 'epoch-key-wrap',
    cryptoVersion: E2EE_V2_CRYPTO_VERSION,
    ephemeralPublicKey: ephemeral.publicKeySpkiBase64,
    nonce: nonceBase64,
    ciphertext: toBase64(ciphertext),
  };
  return encodeJsonEnvelope(envelope);
}

/** Unwrap an epoch key after checking recipient, chat, epoch, and sender metadata. */
export async function unwrapEpochKey(request: UnwrapEpochKeyRequest): Promise<Bytes> {
  const expected = validateWrapMetadata(request);
  const envelope = parseWrapEnvelope(request.envelope);
  if (
    envelope.chatId !== expected.chatId ||
    envelope.epoch !== expected.epoch ||
    envelope.senderDeviceId !== expected.senderDeviceId ||
    envelope.recipientDeviceId !== expected.recipientDeviceId
  ) {
    throw new Error('E2EE v2 epoch-key metadata mismatch');
  }
  validateX25519Key(request.recipientPrivateKey, 'private');
  const ephemeralPublicKey = await importPublicKeySpkiBase64(envelope.ephemeralPublicKey);
  const sharedSecret = await deriveSharedSecretKey(request.recipientPrivateKey, ephemeralPublicKey);
  const wrappingKey = await deriveWrappingKey(sharedSecret, expected);
  const nonce = fromBase64(envelope.nonce, 'nonce');
  request.replayGuard?.reserve(envelope.nonce, JSON.stringify({ ...expected, nonce: envelope.nonce }));
  try {
    const epochKey = await getCrypto().subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: canonicalWrapMetadata(expected),
        tagLength: AES_GCM_TAG_BITS,
      },
      wrappingKey,
      fromBase64(envelope.ciphertext, 'ciphertext'),
    );
    return validateEpochKey(epochKey);
  } catch {
    throw new Error('E2EE v2 epoch-key authentication failed');
  }
}

/**
 * Compatibility boundary for callers that still receive v1. Existing `e2e:` content is returned
 * byte-for-byte and is never parsed; only an `e2e2:` value enters the v2 decryptor.
 */
export async function decryptContentCompatible(
  content: string,
  request: Omit<DecryptMessageRequest, 'envelope'>,
): Promise<string> {
  if (!content.startsWith(E2EE_V2_PREFIX)) return content;
  return decryptMessage({ ...request, envelope: content });
}
