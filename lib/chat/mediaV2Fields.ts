/** The v2 E2EE media fields a message (or a Click Drop's gated original) carries in metadata. */
export type MediaV2Fields = {
  chatId: string;
  epoch: number;
  senderDeviceId: string;
  clientMessageId: string;
  mediaCiphertextSha256: string;
};

export function mediaV2Fields(meta: unknown, chatId: string): MediaV2Fields | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  const epoch = Number(m.epoch);
  if (
    Number(m.crypto_version) !== 2 ||
    !Number.isSafeInteger(epoch) ||
    typeof m.sender_device_id !== 'string' ||
    typeof m.client_message_id !== 'string' ||
    typeof m.media_ciphertext_sha256 !== 'string'
  ) {
    return null;
  }
  return {
    chatId,
    epoch,
    senderDeviceId: m.sender_device_id,
    clientMessageId: m.client_message_id,
    mediaCiphertextSha256: m.media_ciphertext_sha256,
  };
}
