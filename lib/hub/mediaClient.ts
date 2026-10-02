'use client';

import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { encryptWebE2eeV2Media, encryptWebE2eeV2Message, type E2eeV2Session } from '@/lib/chat/e2eeV2Client';

export async function uploadHubAttachment(options: {
  file: File; userId: string; hubId: string; session: E2eeV2Session;
  coords: { user_lat?: number; user_long?: number };
}) {
  const { file, userId, hubId, session, coords } = options;
  if (!file.size || file.size > 25 * 1024 * 1024 - 1024) throw new Error('Choose a non-empty file smaller than 25 MiB.');
  const clientMessageId = crypto.randomUUID();
  const encrypted = await encryptWebE2eeV2Media(session, { chatId: hubId, clientMessageId }, await file.arrayBuffer());
  const path = `${userId}/hub/${hubId}/${clientMessageId}.enc`;
  const form = new FormData();
  form.set('hub_id', hubId); form.set('object_path', path);
  form.set('file', new Blob([encrypted.payload as BlobPart], { type: 'application/octet-stream' }), 'attachment.enc');
  form.set('mime_type', 'application/octet-stream');
  form.set('e2ee_v2_envelope', encrypted.authorizationEnvelope);
  for (const key of ['epoch', 'sender_device_id', 'client_message_id', 'media_ciphertext_sha256']) form.set(key, String(encrypted.metadata[key]));
  if (coords.user_lat != null) form.set('user_lat', String(coords.user_lat));
  if (coords.user_long != null) form.set('user_long', String(coords.user_long));
  const response = await fetch('/api/hub/media', { method: 'POST', headers: await getFreshAuthHeaders(), body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || (typeof result.error === 'string' ? result.error : result.error?.message) || 'Attachment upload failed');
  const message = await encryptWebE2eeV2Message(session, hubId, file.name, clientMessageId);
  return {
    body: message.wireContent,
    message_type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file',
    metadata: { ...message.metadata, ...encrypted.metadata, media_path: path, media_bucket: 'hub-media', media_chat_id: hubId,
      media_epoch: session.currentEpoch, media_sender_device_id: session.deviceId, media_client_message_id: clientMessageId,
      is_encrypted_media: true, media_authorization_envelope: encrypted.authorizationEnvelope,
      original_mime_type: file.type || 'application/octet-stream' },
  };
}
