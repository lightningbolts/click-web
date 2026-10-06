'use client';

import { useCallback, useState, type KeyboardEvent, type RefObject, useSyncExternalStore } from 'react';
import {
  ArrowUp,
  CalendarPlus,
  Check,
  Clock,
  Hourglass,
  ImagePlus,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { IconButton } from '@/components/ds/IconButton';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds/Menu';
import { ATTACHMENT_ACCEPT_STRING } from '@/lib/chat/attachmentValidator';
import type { KlipyGifItem } from '@/lib/chat/klipy';
import { cn } from '@/lib/cn';
import { GifPicker } from './GifPicker';

export const COMPOSER_MAX_CHARS = 1000;
const COUNTER_AT = 80;

function StripBar({ icon: Icon, label, text, onCancel }: { icon: typeof Reply; label: string; text: string; onCancel: () => void }) {
  return (
    <div className="material-glass mb-2 flex items-center gap-3 rounded-md border border-hairline py-2 pl-2 pr-1">
      <span aria-hidden className="h-9 w-[3px] shrink-0 rounded-pill bg-accent" />
      <Icon size={16} className="shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="type-meta block font-semibold text-accent">{label}</span>
        <span className="type-meta block truncate text-fg-secondary">{text}</span>
      </span>
      <IconButton icon={X} size="sm" aria-label={`Cancel ${label.toLowerCase()}`} onClick={onCancel} />
    </div>
  );
}

/**
 * The floating composer (spec §7.2): `+` menu, a glass field that grows to 8 lines, and one
 * trailing button that is the mic when empty, send when there's text, and a check while
 * editing. The backdrop shows through; there is no bar behind it.
 */
const noSubscribe = () => () => {};
const hasMediaRecorder = () => typeof window.MediaRecorder !== 'undefined';

export function ChatComposer({
  disabled,
  placeholder,
  value,
  onChange,
  inputRef,
  reply,
  onCancelReply,
  editing,
  onCancelEdit,
  onSubmit,
  onEditLast,
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
  gifCustomerId,
  sendGif,
  onPlan,
  onSchedule,
  onClickDrop,
}: {
  disabled: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Quoted snippet while replying. */
  reply: string | null;
  onCancelReply: () => void;
  editing: boolean;
  onCancelEdit: () => void;
  onSubmit: () => void;
  /** `↑` in an empty field: start editing your last message. */
  onEditLast?: () => void;
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
  gifCustomerId: string | null;
  sendGif: (item: KlipyGifItem, query: string) => Promise<void>;
  onPlan?: () => void;
  onSchedule?: () => void;
  onClickDrop?: () => void;
}) {
  const [gifOpen, setGifOpen] = useState(false);
  const closeGif = useCallback(() => setGifOpen(false), []);
  const hasText = value.trim().length > 0;
  const left = COMPOSER_MAX_CHARS - value.length;
  // Server HTML assumes no recorder; the client upgrades after hydration.
  const voiceSupported = useSyncExternalStore(noSubscribe, hasMediaRecorder, () => false);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (hasText) onSubmit();
    } else if (e.key === 'Escape') {
      if (editing) onCancelEdit();
      else if (reply) onCancelReply();
    } else if (e.key === 'ArrowUp' && !value && !editing && onEditLast) {
      e.preventDefault();
      onEditLast();
    }
  };

  const mmss = `${Math.floor(recordingMs / 60000)}:${String(Math.floor((recordingMs % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <div className="relative z-20 mx-auto w-full max-w-[720px] shrink-0 px-4 pb-4 pt-3">
      {gifOpen && gifCustomerId ? (
        <GifPicker
          customerId={gifCustomerId}
          onClose={closeGif}
          onSelect={(item, query) => {
            setGifOpen(false);
            void sendGif(item, query);
          }}
        />
      ) : null}

      {editing ? (
        <StripBar icon={Pencil} label="Editing" text="Enter saves · Esc cancels" onCancel={onCancelEdit} />
      ) : reply ? (
        <StripBar icon={Reply} label="Replying" text={reply} onCancel={onCancelReply} />
      ) : null}

      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onPhotoSelected} />
      <input ref={attachmentInputRef} type="file" accept={ATTACHMENT_ACCEPT_STRING} className="hidden" onChange={onAttachmentSelected} />

      <div className="flex items-end gap-2">
        <Menu>
          <MenuTrigger asChild>
            <IconButton
              icon={Plus}
              variant="glass"
              aria-label="Add to message"
              className="size-10"
              disabled={disabled || isRecording || editing}
            />
          </MenuTrigger>
          <MenuContent side="top" align="start" className="min-w-56">
            <MenuItem icon={ImagePlus} disabled={mediaBusy} onSelect={() => photoInputRef.current?.click()}>
              Photo
            </MenuItem>
            <MenuItem icon={Paperclip} disabled={mediaBusy} trailing="2 MB" onSelect={() => attachmentInputRef.current?.click()}>
              File
            </MenuItem>
            {gifCustomerId ? (
              <MenuItem icon={ImagePlus} onSelect={() => setGifOpen(true)}>
                GIF
              </MenuItem>
            ) : null}
            {onClickDrop ? (
              <MenuItem icon={Hourglass} onSelect={onClickDrop}>
                Click Drop
              </MenuItem>
            ) : null}
            {onPlan ? (
              <MenuItem icon={CalendarPlus} onSelect={onPlan}>
                Plan a hangout
              </MenuItem>
            ) : null}
            {onSchedule ? (
              <MenuItem icon={Clock} disabled={!hasText} onSelect={onSchedule}>
                Schedule send
              </MenuItem>
            ) : null}
          </MenuContent>
        </Menu>

        {isRecording ? (
          <div className="material-glass flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-hairline px-3.5" role="status">
            <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-destructive motion-reduce:animate-none" />
            <span className="type-body-strong tabular text-fg">{mmss}</span>
            <span className="type-meta flex-1 truncate text-fg-tertiary">Recording voice message</span>
            <IconButton icon={Trash2} size="sm" aria-label="Discard recording" onClick={cancelVoiceRecording} />
          </div>
        ) : (
          <div
            className={cn(
              'material-glass relative min-w-0 flex-1 rounded-lg border border-hairline',
              'focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--accent)_55%,transparent)]',
            )}
          >
            <textarea
              ref={inputRef}
              value={value}
              maxLength={COMPOSER_MAX_CHARS}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              aria-label={placeholder.replace(/…$/, '')}
              rows={1}
              disabled={disabled}
              className="type-body field-sizing-content block max-h-[calc(8*22px+20px)] min-h-11 w-full resize-none bg-transparent px-3.5 py-2.5 text-fg placeholder:text-fg-tertiary focus:outline-none pointer-coarse:text-[16px]"
            />
            {left < COUNTER_AT ? (
              <span className={cn('type-meta tabular absolute bottom-1 right-3', left <= 0 ? 'text-destructive' : 'text-fg-tertiary')} aria-live="polite">
                {left}
              </span>
            ) : null}
          </div>
        )}

        {isRecording ? (
          <IconButton icon={Square} variant="action" aria-label="Send voice message" className="size-10" onClick={stopVoiceRecording} />
        ) : editing ? (
          <IconButton icon={Check} variant="action" aria-label="Save edit" className="size-10" disabled={!hasText} onClick={onSubmit} />
        ) : !hasText && voiceSupported ? (
          <IconButton
            icon={Mic}
            variant="glass"
            aria-label="Record a voice message"
            className="size-10"
            disabled={disabled || mediaBusy}
            onClick={() => void beginVoiceRecording()}
          />
        ) : (
          <IconButton
            icon={ArrowUp}
            variant="action"
            aria-label="Send"
            className="size-10"
            disabled={disabled || !hasText || mediaBusy}
            onClick={onSubmit}
          />
        )}
      </div>
    </div>
  );
}
