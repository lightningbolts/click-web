'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { Send, Loader2, ImagePlus, Paperclip, Mic, Square, X, Plus, CalendarPlus, Clock } from 'lucide-react';
import type { Message } from '@/lib/chat/types';
import { ATTACHMENT_ACCEPT_STRING } from '@/lib/chat/attachmentValidator';
import type { KlipyGifItem } from '@/lib/chat/klipy';
import { GifPicker } from './GifPicker';

/**
 * ChatView's input area: reply banner, photo/file/voice controls, the
 * auto-resizing textarea, and the send button. Extracted verbatim from
 * ChatView. The GIF button appears only when KLIPY is configured (`gifCustomerId`).
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
  gifCustomerId,
  sendGif,
  onPlan,
  onSchedule,
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
  gifCustomerId: string | null;
  sendGif: (item: KlipyGifItem, query: string) => Promise<void>;
  /** Opens the plan dialog (direct chats and verified cliques). */
  onPlan?: () => void;
  /** Opens the schedule dialog for the current text. */
  onSchedule?: () => void;
}) {
  const [showGifPicker, setShowGifPicker] = useState(false);
  const closeGifPicker = useCallback(() => setShowGifPicker(false), []);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);
  const toolButton =
    'inline-flex h-10 w-10 items-center justify-center rounded-[8px] text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary disabled:cursor-not-allowed disabled:opacity-30';
  const menuItem =
    'flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-left text-sm font-semibold text-on-surface hover:bg-surface-container-low disabled:opacity-40';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="relative z-40 shrink-0 overflow-visible border-t border-border-hard bg-surface px-3 py-3 md:px-4">
      {showGifPicker && gifCustomerId && (
        <GifPicker
          customerId={gifCustomerId}
          onClose={closeGifPicker}
          onSelect={(item, query) => {
            setShowGifPicker(false);
            void sendGif(item, query);
          }}
        />
      )}
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
      <div className="flex w-full min-w-0 items-end gap-1.5 sm:gap-2">
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
        <div className="flex shrink-0 flex-row items-center gap-0.5">
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              disabled={!chatId || isRecording}
              className={toolButton}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              title="More"
            >
              <Plus className="h-5 w-5" />
            </button>
            {moreOpen ? (
              <div
                role="menu"
                className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-56 rounded-[12px] border border-border-hard bg-surface p-1.5 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  className={menuItem}
                  disabled={mediaBusy}
                  onClick={() => {
                    setMoreOpen(false);
                    attachmentInputRef.current?.click();
                  }}
                >
                  <Paperclip className="h-4 w-4 text-on-surface-variant" aria-hidden />
                  File (2 MB max)
                </button>
                {onPlan ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItem}
                    onClick={() => {
                      setMoreOpen(false);
                      onPlan();
                    }}
                  >
                    <CalendarPlus className="h-4 w-4 text-on-surface-variant" aria-hidden />
                    Plan a hangout
                  </button>
                ) : null}
                {onSchedule ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItem}
                    disabled={!inputText.trim() || Boolean(editingId)}
                    onClick={() => {
                      setMoreOpen(false);
                      onSchedule();
                    }}
                  >
                    <Clock className="h-4 w-4 text-on-surface-variant" aria-hidden />
                    Schedule message
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={!chatId || mediaBusy || isRecording}
            className={toolButton}
            title="Attach photo"
            aria-label="Attach photo"
          >
            {mediaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </button>
          {gifCustomerId && (
            <button
              type="button"
              data-gif-toggle
              onClick={() => setShowGifPicker((open) => !open)}
              disabled={!chatId || isRecording}
              className={`${toolButton} text-[11px] font-bold tracking-wide ${showGifPicker ? 'bg-primary-container text-on-primary-container' : ''}`}
              title="Send a GIF"
              aria-label="Send a GIF"
              aria-expanded={showGifPicker}
            >
              GIF
            </button>
          )}
          {!isRecording ? (
            <button
              type="button"
              onClick={() => void beginVoiceRecording()}
              disabled={!chatId || mediaBusy}
              className={toolButton}
              title="Record voice message"
              aria-label="Record voice message"
            >
              <Mic className="h-5 w-5" />
            </button>
          ) : (
            <>
              <span className="min-w-[2.5rem] text-center text-xs font-semibold tabular-nums text-error">
                {`${Math.floor(recordingMs / 60000)}:${String(Math.floor((recordingMs % 60000) / 1000)).padStart(2, '0')}`}
              </span>
              <button
                type="button"
                onClick={stopVoiceRecording}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] bg-primary-container text-on-primary-container"
                title="Stop and send"
                aria-label="Stop and send voice message"
              >
                <Square className="h-4 w-4 fill-current" />
              </button>
              <button
                type="button"
                onClick={cancelVoiceRecording}
                className={toolButton}
                title="Cancel"
                aria-label="Cancel recording"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <div className="flex min-h-10 min-w-0 flex-1 items-center rounded-[16px] border border-border-hard bg-surface-container-low px-4 py-2 transition-colors focus-within:border-primary">
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
        {onSchedule && inputText.trim() && !editingId ? (
          <button
            type="button"
            onClick={onSchedule}
            className={`${toolButton} hidden sm:inline-flex`}
            title="Schedule message"
            aria-label="Schedule message"
          >
            <Clock className="h-5 w-5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={sendMessage}
          disabled={!inputText.trim() || mediaBusy || isRecording}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-primary text-on-primary transition-[filter] hover:brightness-[0.92] disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1.5 hidden text-xs text-on-surface-variant sm:block">
        Enter to send · Shift+Enter for a new line · End-to-end encrypted
      </p>
    </div>
  );
}
