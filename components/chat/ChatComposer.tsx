'use client';

import { type Dispatch, type RefObject, type SetStateAction } from 'react';
import { motion } from 'framer-motion';
import { Send, Loader2, ImagePlus, Paperclip, Mic, Square, X } from 'lucide-react';
import type { Message } from '@/lib/chat/types';
import { ATTACHMENT_ACCEPT_STRING } from '@/lib/chat/attachmentValidator';

/**
 * ChatView's input area: reply banner, photo/file/voice controls, the
 * auto-resizing textarea, and the send button. Extracted verbatim from
 * ChatView.
 */
export function ChatComposer({
  chatId,
  isGroupClique,
  otherUserName,
  inputText,
  setInputText,
  inputRef,
  replyingTo,
  setReplyingTo,
  replyBannerText,
  editingId,
  mediaBusy,
  isRecording,
  recordingMs,
  photoInputRef,
  attachmentInputRef,
  onPhotoSelected,
  onAttachmentSelected,
  beginVoiceRecording,
  stopVoiceRecording,
  cancelVoiceRecording,
  broadcastTyping,
  sendMessage,
}: {
  chatId: string | null;
  isGroupClique: boolean;
  otherUserName: string;
  inputText: string;
  setInputText: Dispatch<SetStateAction<string>>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  replyingTo: Message | null;
  setReplyingTo: Dispatch<SetStateAction<Message | null>>;
  replyBannerText: string;
  editingId: string | null;
  mediaBusy: boolean;
  isRecording: boolean;
  recordingMs: number;
  photoInputRef: RefObject<HTMLInputElement | null>;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  onPhotoSelected: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onAttachmentSelected: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  beginVoiceRecording: () => Promise<void>;
  stopVoiceRecording: () => void;
  cancelVoiceRecording: () => void;
  broadcastTyping: () => void;
  sendMessage: () => Promise<void>;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="relative z-40 mt-2 shrink-0 overflow-visible rounded-[16px] border border-border-hard bg-surface px-4 py-2">
      {replyingTo && replyingTo.message_type !== 'call_log' && !editingId && (
        <div className="mb-2 flex w-full items-start gap-2 rounded-[8px] border border-border-hard bg-surface-container px-3 py-2.5 text-xs">
          <span className="shrink-0 font-medium text-primary">Replying</span>
          <p className="min-w-0 flex-1 line-clamp-2 text-on-surface-variant">{replyBannerText}</p>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="shrink-0 text-on-surface-variant hover:text-on-surface"
            aria-label="Cancel reply"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex w-full min-w-0 items-end gap-2 sm:gap-3">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={onPhotoSelected}
        />
        <input
          ref={attachmentInputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT_STRING}
          className="hidden"
          onChange={onAttachmentSelected}
        />
        <div className="flex shrink-0 flex-row items-center gap-1.5">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={!chatId || mediaBusy || isRecording}
            className="rounded-[8px] border border-border-hard bg-surface-container p-2.5 text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
            title="Attach photo"
          >
            {mediaBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={!chatId || mediaBusy || isRecording}
            className="rounded-[8px] border border-border-hard bg-surface-container p-2.5 text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
            title="Attach file (2 MB max)"
            aria-label="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          {!isRecording ? (
            <button
              type="button"
              onClick={() => void beginVoiceRecording()}
              disabled={!chatId || mediaBusy}
              className="rounded-[8px] border border-border-hard bg-surface-container p-2.5 text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
              title="Record voice message"
            >
              <Mic className="w-4 h-4" />
            </button>
          ) : (
            <>
              <span className="min-w-[2.5rem] text-center font-mono text-[10px] tabular-nums text-red-700 dark:text-red-400">
                {`${Math.floor(recordingMs / 60000)}:${String(Math.floor((recordingMs % 60000) / 1000)).padStart(2, '0')}`}
              </span>
              <button
                type="button"
                onClick={stopVoiceRecording}
                className="rounded-[8px] border-2 border-primary/40 bg-on-primary-container p-2.5 text-primary"
                title="Stop and send"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
              <button
                type="button"
                onClick={cancelVoiceRecording}
                className="rounded-[8px] border border-border-hard p-2.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center rounded-[8px] border border-border-hard bg-surface-container px-4 py-[7px] transition-colors focus-within:border-primary">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              broadcastTyping();
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isRecording
                ? 'Optional caption…'
                : isGroupClique
                  ? 'Message the group…'
                  : `Message ${otherUserName}…`
            }
            rows={1}
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-on-surface placeholder:text-outline focus:outline-none"
            style={{ minHeight: '24px', maxHeight: '120px' }}
          />
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={sendMessage}
          disabled={!inputText.trim() || mediaBusy || isRecording}
          className="p-3 rounded-xl bg-gradient-to-br from-[#8338EC] to-[#6520c0]
            hover:from-[#9b4dff] hover:to-[#7b30e0] disabled:opacity-30
            disabled:cursor-not-allowed transition-all shrink-0 glow-violet"
        >
          <Send className="w-4 h-4" />
        </motion.button>
      </div>
      <p className="text-[10px] text-zinc-600 mt-1 text-left hidden sm:block">
        Press Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
