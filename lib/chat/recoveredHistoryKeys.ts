/** Client-only, volatile history keys unlocked with a user-controlled recovery credential. */
import type { HistoryKeyManifest } from '@/lib/chat/keyRecoveryCrypto';

let activeAccount: string | null = null;
const restored = new Map<string, Map<number, Uint8Array>>();

function fromB64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
export function clearRecoveredHistory(): void {
  for (const epochs of restored.values()) {
    for (const key of epochs.values()) key.fill(0);
  }
  restored.clear();
  activeAccount = null;
}
export function installRecoveredHistory(manifest: HistoryKeyManifest): void {
  // A same-account refresh must not zero keys still held by live chat sessions.
  if (activeAccount !== manifest.userId) clearRecoveredHistory();
  activeAccount = manifest.userId;
  for (const key of manifest.keys) {
    const bytes = fromB64(key.key);
    if (bytes.length !== 32) throw new Error('Invalid recovered epoch key');
    const id = key.scope + ':' + key.id;
    let epochs = restored.get(id);
    if (!epochs) {
      epochs = new Map();
      restored.set(id, epochs);
    }
    epochs.set(key.epoch, bytes);
  }
}
export function recoveredHistoryFor(scope: 'chat' | 'hub', id: string, userId: string): ReadonlyMap<number, Uint8Array> | null {
  return userId === activeAccount ? (restored.get(scope + ':' + id) ?? null) : null;
}
