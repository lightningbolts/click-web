'use client';

import { unwrapEpochKey } from '@/lib/chat/e2eeV2';
import { loadOrCreateWebE2eeV2Identity } from '@/lib/chat/e2eeV2Client';
import { clearRecoveredHistory, installRecoveredHistory } from '@/lib/chat/recoveredHistoryKeys';
import {
  decryptHistoryManifest, deriveWrappingKey, encryptHistoryManifest, generateBackupKey,
  unwrapBackupKey, wrapBackupKey,
  type EncryptedRecoveryPayload, type HistoryKeyManifest, type HistoryKeyRecord,
} from '@/lib/chat/keyRecoveryCrypto';

type AuthHeaders = () => Promise<HeadersInit>;
type CredentialEnvelope = {
  credentialId: string;
  encryptedBackupKey: EncryptedRecoveryPayload;
};
type Vault = { version: number; encryptedManifest: EncryptedRecoveryPayload };
type Exported = {
  scope: 'chat' | 'hub'; id: string; epoch: number;
  senderDeviceId: string; recipientDeviceId: string; envelope: string;
};

let activeBackup: { userId: string; key: Uint8Array } | null = null;
let lastBackup = 0;
const REFRESH_INTERVAL_MS = 5 * 60_000;

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new Error('Invalid recovery credential ID');
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
}
function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
async function json<T>(getAuthHeaders: AuthHeaders, url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(await getAuthHeaders());
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...init, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as {error?: string}).error || 'Could not access encrypted history backup');
  return data as T;
}
function challenge(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}
async function prfInput(userId: string): Promise<Uint8Array<ArrayBuffer>> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('click/history-prf/v1/' + userId));
  return new Uint8Array(digest);
}
function requirePasskeys(): void {
  if (typeof window === 'undefined' || !window.isSecureContext || !('PublicKeyCredential' in window)) {
    throw new Error('Passkey recovery requires a compatible secure browser');
  }
}
async function credentialPRF(credentialIds: string[], userId: string): Promise<{ credentialId: string; output: Uint8Array }> {
  requirePasskeys();
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: challenge(),
    userVerification: 'required',
    allowCredentials: credentialIds.map((id) => ({ type: 'public-key' as const, id: new Uint8Array(fromB64url(id)) })),
    extensions: { prf: { eval: { first: await prfInput(userId) } } },
  };
  const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential | null;
  if (!credential || !credentialIds.includes(b64url(new Uint8Array(credential.rawId)))) {
    throw new Error('Recovery passkey not available');
  }
  const extension = credential.getClientExtensionResults() as AuthenticationExtensionsClientOutputs & {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const first = extension.prf?.results?.first;
  if (!first || first.byteLength !== 32) {
    throw new Error('This passkey does not support encrypted-history recovery');
  }
  return { credentialId: b64url(new Uint8Array(credential.rawId)), output: new Uint8Array(first) };
}
async function createCredential(userId: string): Promise<string> {
  requirePasskeys();
  const userHandle = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId)));
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: challenge(),
    rp: { name: 'Click' },
    user: { id: userHandle, name: 'Click history recovery', displayName: 'Click' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    timeout: 120_000,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    attestation: 'none',
    extensions: { prf: { eval: { first: await prfInput(userId) } } },
  };
  const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential | null;
  if (!credential) throw new Error('Passkey enrollment was canceled');
  return b64url(new Uint8Array(credential.rawId));
}

async function existingCredentials(getAuthHeaders: AuthHeaders): Promise<CredentialEnvelope[]> {
  const response = await json<{ credentials: CredentialEnvelope[] }>(getAuthHeaders, '/api/chat/key-recovery/credentials');
  return response.credentials;
}
async function currentVault(getAuthHeaders: AuthHeaders): Promise<Vault | null> {
  const response = await json<{vault: Vault | null}>(getAuthHeaders, '/api/chat/key-recovery/vault');
  return response.vault;
}
function keyId(record: HistoryKeyRecord): string {
  return record.scope + ':' + record.id + ':' + record.epoch;
}

/** Gather all ciphertext envelopes already shared with this browser, and unwrap only locally. */
async function exportedHistory(userId: string, getAuthHeaders: AuthHeaders): Promise<HistoryKeyManifest> {
  const identity = await loadOrCreateWebE2eeV2Identity();
  const result = new Map<string, HistoryKeyRecord>();
  for (const scope of ['chat', 'hub'] as const) {
    for (let page = 0; page < 500; page++) {
      const url = '/api/chat/key-recovery/export?device_id=' + encodeURIComponent(identity.deviceId)
        + '&scope=' + scope + '&page=' + page;
      const response = await json<{items: Exported[]; nextPage: number | null}>(getAuthHeaders, url);
      for (const item of response.items) {
        if (item.scope !== scope || item.recipientDeviceId !== identity.deviceId) continue;
        try {
          const key = await unwrapEpochKey({
            chatId: item.id, epoch: item.epoch,
            senderDeviceId: item.senderDeviceId, recipientDeviceId: identity.deviceId,
            recipientPrivateKey: identity.privateKey, envelope: item.envelope,
          });
          if (key.length !== 32) continue;
          const record: HistoryKeyRecord = { scope, id: item.id, epoch: item.epoch, key: b64(key) };
          result.set(keyId(record), record);
        } catch {
          // An envelope with an invalid signature/metadata cannot enter the backup.
        }
      }
      if (response.nextPage === null) break;
      if (page === 499) throw new Error('Encrypted history export exceeds supported page limit');
    }
  }
  return { version: 1, userId, keys: [...result.values()] };
}

/** One-time setup on an already approved browser: the server never sees the recovery key. */
export async function enrollBrowserHistoryRecovery(userId: string, getAuthHeaders: AuthHeaders): Promise<number> {
  if (await currentVault(getAuthHeaders)) throw new Error('History recovery is already set up');
  const manifest = await exportedHistory(userId, getAuthHeaders);
  if (manifest.keys.length === 0) {
    throw new Error('Approve this browser to read your historical messages before setting up recovery');
  }
  const credentialId = await createCredential(userId);
  const prf = await credentialPRF([credentialId], userId);
  const wrappingKey = await deriveWrappingKey(prf.output);
  const backupKey = generateBackupKey();
  const [encryptedManifest, encryptedBackupKey] = await Promise.all([
    encryptHistoryManifest(backupKey, manifest),
    wrapBackupKey(wrappingKey, backupKey, userId),
  ]);
  await json(getAuthHeaders, '/api/chat/key-recovery/enroll', {
    method: 'POST', body: JSON.stringify({ credentialId, encryptedManifest, encryptedBackupKey }),
  });
  activeBackup = { userId, key: backupKey };
  installRecoveredHistory(manifest);
  lastBackup = Date.now();
  return manifest.keys.length;
}

/** A newly signed-in browser asks its synced passkey to release only the PRF output locally. */
export async function restoreBrowserHistory(userId: string, getAuthHeaders: AuthHeaders): Promise<number> {
  const [vault, credentials] = await Promise.all([currentVault(getAuthHeaders), existingCredentials(getAuthHeaders)]);
  if (!vault || credentials.length === 0) throw new Error('Encrypted history recovery is not set up');
  const prf = await credentialPRF(credentials.map((credential) => credential.credentialId), userId);
  const selected = credentials.find((credential) => credential.credentialId === prf.credentialId);
  if (!selected) throw new Error('Unrecognized recovery passkey');
  const wrappingKey = await deriveWrappingKey(prf.output);
  const backupKey = await unwrapBackupKey(wrappingKey, selected.encryptedBackupKey, userId);
  const manifest = await decryptHistoryManifest(backupKey, vault.encryptedManifest, userId);
  activeBackup = { userId, key: backupKey };
  installRecoveredHistory(manifest);
  lastBackup = 0;
  return manifest.keys.length;
}

/** Register a second recovery credential using the already-unlocked backup key. */
export async function addBrowserHistoryRecoveryPasskey(userId: string, getAuthHeaders: AuthHeaders): Promise<void> {
  if (!activeBackup || activeBackup.userId !== userId) {
    throw new Error('Unlock your existing recovery passkey before adding another');
  }
  const credentialId = await createCredential(userId);
  const prf = await credentialPRF([credentialId], userId);
  const key = await deriveWrappingKey(prf.output);
  const encryptedBackupKey = await wrapBackupKey(key, activeBackup.key, userId);
  await json(getAuthHeaders, '/api/chat/key-recovery/credentials', {
    method: 'POST', body: JSON.stringify({ credentialId, encryptedBackupKey }),
  });
}
export function hasUnlockedHistoryRecovery(userId: string): boolean {
  return activeBackup?.userId === userId;
}

/** Refresh held keys without another passkey prompt while the recovery key is already in memory. */
export async function refreshBrowserHistoryBackup(userId: string, getAuthHeaders: AuthHeaders): Promise<number> {
  if (!activeBackup || activeBackup.userId !== userId || Date.now() - lastBackup < REFRESH_INTERVAL_MS) return 0;
  lastBackup = Date.now();
  let succeeded = false;
  const key = activeBackup.key;
  try {
    const newlyAvailable = await exportedHistory(userId, getAuthHeaders);
    for (let attempt = 0; attempt < 2; attempt++) {
      const vault = await currentVault(getAuthHeaders);
      if (!vault) return 0;
      const existing = await decryptHistoryManifest(key, vault.encryptedManifest, userId);
      const merged = new Map(existing.keys.map((record) => [keyId(record), record]));
      for (const record of newlyAvailable.keys) merged.set(keyId(record), record);
      if (merged.size === existing.keys.length) { succeeded = true; return 0; }
      const manifest: HistoryKeyManifest = { version: 1, userId, keys: [...merged.values()] };
      const encryptedManifest = await encryptHistoryManifest(key, manifest);
      try {
        await json(getAuthHeaders, '/api/chat/key-recovery/vault', {
          method: 'PUT', body: JSON.stringify({ expectedVersion: vault.version, encryptedManifest }),
        });
        installRecoveredHistory(manifest);
        succeeded = true;
        return merged.size - existing.keys.length;
      } catch (error) {
        if (!(error instanceof Error) || !/Version conflict/.test(error.message) || attempt === 1) throw error;
      }
    }
  } finally {
    // Failure is retryable; do not throttle an unsuccessful backup.
    if (!succeeded) lastBackup = 0;
  }
  return 0;
}
export function resetBrowserHistoryRecovery(): void {
  if (activeBackup) activeBackup.key.fill(0);
  activeBackup = null;
  lastBackup = 0;
  clearRecoveredHistory();
}
