import { authedJson } from '@/lib/api/authedJson';
import { unwrapEpochKey } from '@/lib/chat/e2eeV2';
import { loadOrCreateWebE2eeV2Identity } from '@/lib/chat/e2eeV2Client';

type Challenge = { challenge_id: string; envelope: string; chat_id: string; epoch: number; sender_device_id: string };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Approve or deny sharing chat history with another of your devices, from this browser. The
 * browser proves it holds its identity key the same way the apps do: the server wraps a one-time
 * challenge to this device's key, the browser unwraps it and sends it back with the decision.
 * Throws with the server's message (e.g. this browser isn't set up for chat yet).
 */
export async function decideDeviceRequest(requestId: string, decision: 'approve' | 'deny'): Promise<void> {
  const identity = await loadOrCreateWebE2eeV2Identity();
  const base = `/api/chat/devices/history-requests/${encodeURIComponent(requestId)}`;
  const challenge = await authedJson<Challenge>(`${base}/challenge`, {
    method: 'POST',
    body: { approving_device_id: identity.deviceId },
    fallback: 'This browser can’t approve devices yet. Open a chat here first, or approve on your phone.',
  });
  const nonce = await unwrapEpochKey({
    envelope: challenge.envelope,
    chatId: challenge.chat_id,
    epoch: challenge.epoch,
    senderDeviceId: challenge.sender_device_id,
    recipientDeviceId: identity.deviceId,
    recipientPrivateKey: identity.privateKey,
  });
  await authedJson(base, {
    method: 'POST',
    body: { decision, approving_device_id: identity.deviceId, challenge_id: challenge.challenge_id, proof: bytesToBase64(nonce) },
    fallback: 'Couldn’t save your decision.',
  });
}
