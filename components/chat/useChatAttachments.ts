'use client';

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { Message } from '@/lib/chat/types';
import { uploadChatMediaBlob } from '@/lib/chat/chatMediaStorage';
import { uploadChatAttachmentBlob } from '@/lib/chat/chatAttachmentStorage';
import { validateAttachment } from '@/lib/chat/attachmentValidator';
import {
  encodeEnvelope,
  encodeFileMasterKeyBase64,
  encryptFileBytes,
  generateFileMasterKey,
  sha256Base64,
  type AttachmentEnvelope,
} from '@/lib/chat/attachmentCrypto';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import {
  encryptContent,
  encryptGroupMessageContent,
  type DerivedKeys,
} from '@/lib/chat/crypto';

/**
 * Photo and encrypted file-attachment sending, including drag-and-drop.
 * Extracted verbatim from ChatView.
 */
export function useChatAttachments({
  connection,
  currentUserId,
  isGroupClique,
  chatId,
  e2eKeys,
  groupMasterKey,
  mediaBusy,
  setMediaBusy,
  isRecording,
  setReplyingTo,
  setActionToast,
  setInputText,
  setIsDraggingAttachment,
  inputTextRef,
  inputRef,
  photoInputRef,
  getAuthHeaders,
  appendReplyToMetadata,
}: {
  connection: ConnectionRecord;
  currentUserId: string;
  isGroupClique: boolean;
  chatId: string | null;
  e2eKeys: DerivedKeys | null;
  groupMasterKey: ArrayBuffer | null;
  mediaBusy: boolean;
  setMediaBusy: Dispatch<SetStateAction<boolean>>;
  isRecording: boolean;
  setReplyingTo: Dispatch<SetStateAction<Message | null>>;
  setActionToast: Dispatch<SetStateAction<{ type: 'success' | 'error'; message: string } | null>>;
  setInputText: Dispatch<SetStateAction<string>>;
  setIsDraggingAttachment: Dispatch<SetStateAction<boolean>>;
  inputTextRef: MutableRefObject<string>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  photoInputRef: RefObject<HTMLInputElement | null>;
  getAuthHeaders: () => Promise<HeadersInit>;
  appendReplyToMetadata: (meta: Record<string, unknown>) => Promise<Record<string, unknown>>;
}) {
  const onPhotoSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !chatId || mediaBusy || isRecording) return;
      if (!file.type.startsWith('image/')) {
        setActionToast({ type: 'error', message: 'Please choose an image file' });
        return;
      }
      setMediaBusy(true);
      inputRef.current?.focus();
      try {
        const { publicUrl } = await uploadChatMediaBlob(currentUserId, file, file.type);
        const caption = inputTextRef.current.trim();
        setInputText('');
        const wireContent =
          isGroupClique && groupMasterKey && caption
            ? await encryptGroupMessageContent(caption, groupMasterKey)
            : e2eKeys && caption
              ? await encryptContent(caption, e2eKeys)
              : caption;
        const headers = await getAuthHeaders();
        const metadata = await appendReplyToMetadata({ media_url: publicUrl });
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chatId,
            ...(!isGroupClique ? { connectionId: connection.id } : {}),
            content: wireContent,
            message_type: 'image',
            metadata,
          }),
        });
        if (!res.ok) throw new Error('Send failed');
        setReplyingTo(null);
      } catch (err) {
        console.error('Photo send error:', err);
        setActionToast({ type: 'error', message: 'Could not send photo' });
      } finally {
        setMediaBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      chatId,
      mediaBusy,
      isRecording,
      currentUserId,
      e2eKeys,
      groupMasterKey,
      isGroupClique,
      connection.id,
      getAuthHeaders,
      appendReplyToMetadata,
    ],
  );

  const sendAttachmentFile = useCallback(
    async (file: File) => {
      if (!chatId || mediaBusy || isRecording) return;

      const validation = validateAttachment({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!validation.ok) {
        setActionToast({ type: 'error', message: validation.message });
        return;
      }

      setMediaBusy(true);
      try {
        const plainBytes = new Uint8Array(await file.arrayBuffer());
        const masterKey = generateFileMasterKey();
        const ciphertext = await encryptFileBytes(plainBytes, masterKey);
        const sha = await sha256Base64(plainBytes);
        const mimeType = (file.type || 'application/octet-stream').toLowerCase();

        const { path } = await uploadChatAttachmentBlob(
          chatId,
          ciphertext,
          mimeType,
          file.name,
          getAuthHeaders,
        );

        const envelope: AttachmentEnvelope = {
          v: 1,
          type: 'file',
          name: file.name,
          mime: mimeType,
          size: plainBytes.byteLength,
          path,
          key: encodeFileMasterKeyBase64(masterKey),
          sha256: sha,
        };
        const envelopeBody = encodeEnvelope(envelope);

        const wireContent =
          isGroupClique && groupMasterKey
            ? await encryptGroupMessageContent(envelopeBody, groupMasterKey)
            : e2eKeys
              ? await encryptContent(envelopeBody, e2eKeys)
              : envelopeBody;

        const headers = await getAuthHeaders();
        const metadata = await appendReplyToMetadata({
          attachment_path: path,
          attachment_name: file.name,
          attachment_mime: mimeType,
          attachment_size: plainBytes.byteLength,
        });
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chatId,
            ...(!isGroupClique ? { connectionId: connection.id } : {}),
            content: wireContent,
            message_type: 'file',
            metadata,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`Send failed (${res.status}): ${txt.slice(0, 200)}`);
        }
        setReplyingTo(null);
      } catch (err) {
        console.error('Attachment send error:', err);
        setActionToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Could not send attachment',
        });
      } finally {
        setMediaBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      chatId,
      mediaBusy,
      isRecording,
      e2eKeys,
      groupMasterKey,
      isGroupClique,
      connection.id,
      getAuthHeaders,
      appendReplyToMetadata,
    ],
  );

  const onAttachmentSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      await sendAttachmentFile(file);
    },
    [sendAttachmentFile],
  );

  const onAttachmentDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingAttachment(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (file.type.startsWith('image/')) {
        // Photos continue to route through the existing media pipeline so previews/compression
        // stay consistent with the image attach button.
        if (photoInputRef.current) {
          const dt = new DataTransfer();
          dt.items.add(file);
          photoInputRef.current.files = dt.files;
          photoInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      await sendAttachmentFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendAttachmentFile],
  );

  const onAttachmentDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      setIsDraggingAttachment(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAttachmentDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingAttachment(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    onPhotoSelected,
    sendAttachmentFile,
    onAttachmentSelected,
    onAttachmentDrop,
    onAttachmentDragOver,
    onAttachmentDragLeave,
  };
}
