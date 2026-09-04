'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { Message } from '@/lib/chat/types';
import { normalizeDbMessage } from '@/lib/chat/messages';
import { uploadChatMediaBlob, uploadChatMediaV2Blob } from '@/lib/chat/chatMediaStorage';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import {
  encryptContent,
  encryptGroupMessageContent,
  type DerivedKeys,
} from '@/lib/chat/crypto';
import {
  encryptWebE2eeV2Media,
  encryptWebE2eeV2Message,
  type E2eeV2Session,
} from '@/lib/chat/e2eeV2Client';

/**
 * Voice-note recording and upload: MediaRecorder lifecycle plus the
 * upload-and-send pipeline. Extracted verbatim from ChatView; the recorder
 * refs are private to this hook.
 */
export function useVoiceMessages({
  connection,
  currentUserId,
  isGroupClique,
  chatId,
  e2eKeys,
  groupMasterKey,
  mediaBusy,
  setMediaBusy,
  isRecording,
  setIsRecording,
  setRecordingMs,
  setMessages,
  setReplyingTo,
  setActionToast,
  setInputText,
  inputTextRef,
  getAuthHeaders,
  getE2eeV2Session,
  appendReplyToMetadata,
  decryptWireMessageContent,
  isNearBottom,
  scrollToBottom,
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
  setIsRecording: Dispatch<SetStateAction<boolean>>;
  setRecordingMs: Dispatch<SetStateAction<number>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setReplyingTo: Dispatch<SetStateAction<Message | null>>;
  setActionToast: Dispatch<SetStateAction<{ type: 'success' | 'error'; message: string } | null>>;
  setInputText: Dispatch<SetStateAction<string>>;
  inputTextRef: MutableRefObject<string>;
  getAuthHeaders: () => Promise<HeadersInit>;
  getE2eeV2Session: (allowUpgrade?: boolean, forceRefresh?: boolean) => Promise<E2eeV2Session | null>;
  appendReplyToMetadata: (meta: Record<string, unknown>) => Promise<Record<string, unknown>>;
  decryptWireMessageContent: (content: string, messageType: string) => Promise<string>;
  isNearBottom: () => boolean;
  scrollToBottom: (smooth?: boolean) => void;
}) {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingMimeRef = useRef<string>('audio/webm');
  const recordingStartedAtRef = useRef<number>(0);
  const voiceCancelRef = useRef(false);

  useEffect(() => {
    if (!isRecording) {
      setRecordingMs(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => setRecordingMs(Date.now() - t0), 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const uploadAndSendVoice = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      if (!chatId) return;
      setMediaBusy(true);
      try {
        const caption = inputTextRef.current.trim();
        setInputText('');
        const mimeType = blob.type || recordingMimeRef.current || 'audio/webm';
        const v2Session = await getE2eeV2Session(true, true);
        let wireContent: string;
        let metadata: Record<string, unknown>;
        if (v2Session) {
          const clientMessageId = crypto.randomUUID();
          const media = await encryptWebE2eeV2Media(
            v2Session,
            { chatId, clientMessageId },
            new Uint8Array(await blob.arrayBuffer()),
          );
          const upload = await uploadChatMediaV2Blob(
            chatId,
            media.payload,
            mimeType,
            media.authorizationEnvelope,
            media.metadata.media_ciphertext_sha256 as string,
            getAuthHeaders,
          );
          const message = await encryptWebE2eeV2Message(v2Session, chatId, caption, clientMessageId);
          wireContent = message.wireContent;
          metadata = await appendReplyToMetadata({
            ...message.metadata,
            ...media.metadata,
            media_path: upload.path,
            duration_seconds: durationSeconds,
            original_mime_type: mimeType,
            is_encrypted_media: true,
          });
        } else {
          wireContent =
            isGroupClique && groupMasterKey && caption
              ? await encryptGroupMessageContent(caption, groupMasterKey)
              : e2eKeys && caption
                ? await encryptContent(caption, e2eKeys)
                : caption;
          const { publicUrl } = await uploadChatMediaBlob(currentUserId, blob, mimeType);
          metadata = await appendReplyToMetadata({
            media_url: publicUrl,
            duration_seconds: durationSeconds,
            original_mime_type: mimeType,
            is_encrypted_media: false,
          });
        }
        const headers = await getAuthHeaders();
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            chatId,
            ...(!isGroupClique ? { connectionId: connection.id } : {}),
            content: wireContent,
            message_type: 'audio',
            metadata,
          }),
        });
        if (!res.ok) throw new Error('Send failed');
        const payload = (await res.json()) as { message?: Record<string, unknown> };
        const row = payload.message;
        if (row) {
          const mt = typeof row.message_type === 'string' ? row.message_type : 'audio';
          const plainContent = await decryptWireMessageContent(String(row.content ?? ''), mt);
          const msg = normalizeDbMessage({
            ...row,
            content: plainContent,
            reactions: {},
          });
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            const updated = [...prev, msg];
            if (isNearBottom()) setTimeout(() => scrollToBottom(), 60);
            return updated;
          });
        }
        setReplyingTo(null);
      } catch (err) {
        console.error('Voice send error:', err);
        setActionToast({ type: 'error', message: 'Could not send voice message' });
      } finally {
        setMediaBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      chatId,
      currentUserId,
      connection.id,
      e2eKeys,
      groupMasterKey,
      isGroupClique,
      getAuthHeaders,
      getE2eeV2Session,
      appendReplyToMetadata,
      decryptWireMessageContent,
      scrollToBottom,
    ],
  );

  const beginVoiceRecording = useCallback(async () => {
    if (!chatId || mediaBusy || isRecording) return;
    voiceCancelRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const candidates = [
        'audio/mp4',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/aac',
        'audio/webm;codecs=opus',
        'audio/webm',
      ];
      const preferred =
        typeof MediaRecorder !== 'undefined'
          ? candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
          : '';
      const mr = preferred
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      recordingMimeRef.current = mr.mimeType || 'audio/webm';
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordingChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        if (voiceCancelRef.current) {
          voiceCancelRef.current = false;
          return;
        }
        const blob = new Blob(recordingChunksRef.current, { type: recordingMimeRef.current });
        recordingChunksRef.current = [];
        if (blob.size < 32) return;
        const elapsedSec = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        void uploadAndSendVoice(blob, elapsedSec);
      };
      mediaRecorderRef.current = mr;
      mr.start(400);
      setIsRecording(true);
    } catch {
      setActionToast({ type: 'error', message: 'Microphone access denied or unavailable' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, mediaBusy, isRecording, uploadAndSendVoice]);

  const stopVoiceRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') mr.stop();
  }, []);

  const cancelVoiceRecording = useCallback(() => {
    voiceCancelRef.current = true;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') mr.stop();
    else {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
      voiceCancelRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    uploadAndSendVoice,
    beginVoiceRecording,
    stopVoiceRecording,
    cancelVoiceRecording,
  };
}
