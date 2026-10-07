'use client';

import { useEffect, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Lock, Phone } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { toast } from '@/components/ds/Toast';
import type { Message, MessageReaction } from '@/lib/chat/types';
import { isClientOptimisticMessageId } from '@/lib/chat/clientOptimistic';
import { getReplyFromMetadata } from '@/lib/chat/reply';
import { LinkifiedText } from '@/lib/chat/linkify';
import {
  chatAttachmentPathFromSignedUrl,
  durationSecondsFromMetadata,
  isEncryptedMediaFromMetadata,
  mediaPathFromMetadata,
  mediaUrlFromMetadata,
  originalMimeTypeFromMetadata,
} from '@/lib/chat/mediaMetadata';
import { isEncryptedWireContent, type DerivedKeys } from '@/lib/chat/crypto';
import { tryDecodeEnvelope, tryDecodeV2AttachmentDescriptor } from '@/lib/chat/attachmentCrypto';
import { isBeaconChatMessage } from '@/lib/chat/messages';
import { chatGifFromMessage } from '@/lib/chat/gif';
import { mediaV2Fields } from '@/lib/chat/mediaV2Fields';
import { PLAN_DECLINED_REACTION, PLAN_GOING_REACTION, parsePlan } from '@/lib/chat/plans';
import { useSecureMedia } from '@/lib/chat/useSecureMedia';
import type { E2eeV2Session } from '@/lib/chat/e2eeV2Client';
import { cn } from '@/lib/cn';
import AttachmentBubble from './AttachmentBubble';
import BeaconChatCard from './BeaconChatCard';
import ChatThemeAudioPlayer from './ChatThemeAudioPlayer';
import { ClickDropBubble } from './ClickDropBubble';
import { DropReplyHeader } from '@/components/drops/DropReplyHeader';
import { dropReplyFromMetadata } from '@/lib/drops/dropReply';
import { MessageActionBar } from './MessageActionBar';
import { MessageMeta, callLogLabel, formatMessageTime, isSafeMediaUrl } from './messageMeta';
import { PlanCard } from './PlanCard';

/** How long ciphertext shimmers before we call it undecryptable. */
const DECRYPT_GRACE_MS = 6000;

export type MessageSender = { id: string; name: string; avatarUrl?: string | null };

export type DropState = {
  developedAt: string | null;
  onDeveloped: (id: string, at: string) => void;
  nowMs: number;
};

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  currentUserId: string;
  /** Position in a run of messages from one sender: names go on the first, avatars on the last. */
  first: boolean;
  last: boolean;
  /** Set in groups for other people's messages. */
  sender?: MessageSender | null;
  onReply?: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, currentContent: string) => void;
  onDelete: (messageId: string) => void;
  mediaChatKey?: DerivedKeys | ArrayBuffer | null;
  getAuthHeaders?: () => Promise<HeadersInit>;
  getE2eeV2Session?: (allowUpgrade?: boolean, forceRefresh?: boolean) => Promise<E2eeV2Session | null>;
  /** Jump / search highlight. */
  highlighted?: boolean;
  pinned?: boolean;
  onTogglePin?: (message: Message) => void;
  onPlanRsvp?: (message: Message, going: boolean) => void;
  /** On-device quote text for a reply target (replies carry no plaintext excerpt). */
  resolveReplySnippet?: (messageId: string) => string | null;
  /** Who wrote the quoted message ("You", a name), when it's loaded. */
  resolveReplyAuthor?: (messageId: string) => string | null;
  /** Scroll to the message a reply quotes. */
  onJumpTo?: (messageId: string) => void;
  /** Click Drops only. */
  drop?: DropState;
  /**
   * Set when this browser is known not to hold the keys for some of the thread (not approved
   * yet, or set up after those messages): ciphertext says this at once instead of shimmering.
   */
  lockedText?: string | null;
}

/**
 * Ciphertext shimmers while keys load; after a grace period it says so instead of spinning
 * forever. When the thread already knows this browser can't read it ([lockedText]), it says
 * that right away.
 */
function EncryptedText({ mine, lockedText }: { mine: boolean; lockedText?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (lockedText) return;
    const t = window.setTimeout(() => setFailed(true), DECRYPT_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [lockedText]);
  if (!failed && !lockedText) {
    return <span aria-busy aria-label="Decrypting message" className={cn('block h-4 w-40 max-w-full animate-pulse rounded-xs', mine ? 'bg-white/20' : 'bg-fill-strong')} />;
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 italic', mine ? 'text-white/80' : 'text-fg-secondary')}>
      <Lock size={14} aria-hidden className="shrink-0" />
      {lockedText ?? 'Couldn’t decrypt this message'}
    </span>
  );
}

function ReplyQuote({
  author,
  snippet,
  mine,
  inBubble,
  onClick,
}: {
  author: string | null;
  snippet: string;
  mine: boolean;
  inBubble: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`Replying to: ${snippet}. Show message`}
      className={cn(
        'type-meta flex w-full min-w-0 max-w-full items-stretch gap-2 rounded-sm py-1 pl-1 pr-2 text-left',
        inBubble ? 'mb-1.5' : 'mb-1 w-auto',
        inBubble && mine ? 'bg-white/[0.14] text-white/90' : 'bg-fill-subtle text-fg-secondary',
        onClick && 'cursor-pointer hover:opacity-90',
      )}
    >
      <span aria-hidden className={cn('w-[3px] shrink-0 rounded-pill', inBubble && mine ? 'bg-white/85' : 'bg-accent')} />
      <span className="min-w-0">
        {author ? <span className={cn('block truncate font-semibold', inBubble && mine ? 'text-white' : 'text-fg')}>{author}</span> : null}
        <span className="line-clamp-2">{snippet}</span>
      </span>
    </button>
  );
}

/** One message in the thread (spec §7.2). */
export default function MessageBubble({
  message,
  isMine,
  currentUserId,
  first,
  last,
  sender,
  onReply,
  onReact,
  onEdit,
  onDelete,
  mediaChatKey,
  getAuthHeaders,
  getE2eeV2Session,
  highlighted = false,
  pinned = false,
  onTogglePin,
  onPlanRsvp,
  resolveReplySnippet,
  resolveReplyAuthor,
  onJumpTo,
  drop,
  lockedText = null,
}: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const meta = (message.metadata && typeof message.metadata === 'object' ? message.metadata : {}) as Record<string, unknown>;
  const mediaUrl = mediaUrlFromMetadata(message.metadata);
  const isEncryptedMedia = isEncryptedMediaFromMetadata(message.metadata);
  const secureMedia = useSecureMedia({
    storageUrl: mediaUrl,
    storagePath: mediaPathFromMetadata(message.metadata) ?? chatAttachmentPathFromSignedUrl(mediaUrl),
    chatKey: mediaChatKey,
    mimeType: originalMimeTypeFromMetadata(message.metadata),
    isEncryptedMedia,
    getE2eeV2Session,
    getAuthHeaders,
    v2Metadata: mediaV2Fields(meta, message.chat_id),
  });

  if (message.message_type === 'call_log') {
    const { text, missed } = callLogLabel(message);
    return (
      <div data-message-id={message.id} className="flex w-full justify-center py-2" role="status">
        <span className="type-meta inline-flex items-center gap-2 rounded-pill bg-bg-elevated px-3.5 py-1.5 shadow-overlay">
          <Phone size={14} className={missed ? 'text-destructive' : 'text-fg-tertiary'} aria-hidden />
          <span className={cn('font-semibold', missed ? 'text-destructive' : 'text-fg')}>{text}</span>
          <span className="tabular text-fg-tertiary">{formatMessageTime(message.time_created)}</span>
        </span>
      </div>
    );
  }

  const content = message.content;
  const caption = content.trim();
  const plan = message.message_type === 'text' ? parsePlan(message.metadata) : null;
  const gif = chatGifFromMessage(message);
  const isDrop = meta.disposable_roll === true && message.message_type === 'image' && drop != null;
  const isImage = message.message_type === 'image';
  const isAudio = message.message_type === 'audio';
  const isBeacon = isBeaconChatMessage(message);
  const attachment =
    message.message_type === 'file' || caption.startsWith('ccx:v1:')
      ? (tryDecodeEnvelope(caption) ?? (message.message_type === 'file' ? tryDecodeV2AttachmentDescriptor(caption) : null))
      : null;
  const ciphertext = isEncryptedWireContent(caption);
  const isText = !plan && !gif && !isImage && !isAudio && !isBeacon && !attachment;
  const dropReply = message.message_type === 'text' ? dropReplyFromMetadata(meta) : null;

  // RSVPs on a plan are counted on its card, not repeated as reaction chips.
  const reactions = Object.entries(message.reactions ?? {})
    .filter(([emoji]) => !plan || (emoji !== PLAN_GOING_REACTION && emoji !== PLAN_DECLINED_REACTION))
    .map(([emoji, users]) => ({
      emoji,
      count: (users as MessageReaction[]).length,
      mine: (users as MessageReaction[]).some((r) => r.user_id === currentUserId),
    }))
    .filter((r) => r.count > 0);
  const myReactions = new Set(reactions.filter((r) => r.mine).map((r) => r.emoji));

  const reply = getReplyFromMetadata(message.metadata);
  const replySnippet = reply ? reply.snippet || resolveReplySnippet?.(reply.id) || 'Message' : '';
  const replyAuthor = reply ? (resolveReplyAuthor?.(reply.id) ?? null) : null;
  const jumpToReply = reply && onJumpTo ? () => onJumpTo(reply.id) : undefined;
  const optimistic = isClientOptimisticMessageId(message.id);
  const imageSrc = secureMedia.src && isSafeMediaUrl(secureMedia.src) ? secureMedia.src : null;
  const variant = isMine ? 'mine' : 'theirs';
  const tail = last ? (isMine ? 'rounded-br-xs' : 'rounded-bl-xs') : '';
  const bubbleTone = isMine ? 'bg-bubble-out text-white' : 'bg-bubble-in text-fg';
  const metaBelow = <MessageMeta message={message} mine={isMine} pinned={pinned} tone="plain" className="mt-1 px-1" />;
  const metaOverlay = (
    <MessageMeta message={message} mine={isMine} pinned={pinned} tone="media" className="material-glass-dark absolute bottom-2 right-2 rounded-pill px-2 py-0.5" />
  );

  const save = () => {
    if (!imageSrc) return;
    const a = document.createElement('a');
    a.href = imageSrc;
    a.download = `click-photo-${message.id.slice(0, 8)}`;
    a.rel = 'noopener';
    a.click();
  };
  const copy = () => {
    void navigator.clipboard
      .writeText(content)
      .then(() => toast('Copied'))
      .catch(() => toast.error('Couldn’t copy. Try again.'));
  };

  const react = (emoji: string) => onReact(message.id, emoji);
  const active = hovered || focused || menuOpen || pickerOpen;

  const onRowKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === '.') {
      e.preventDefault();
      setMenuOpen(true);
    } else if ((e.key === 'r' || e.key === 'R') && onReply && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onReply(message);
    }
  };
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    // Leave the browser menu for selected text and links.
    if (window.getSelection()?.toString() || (e.target as HTMLElement).closest('a')) return;
    e.preventDefault();
    setFocused(true);
    setMenuOpen(true);
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };

  let body: ReactNode;
  if (isDrop && drop) {
    body = (
      <div className="relative">
        <ClickDropBubble
          message={message}
          previewSrc={imageSrc}
          previewLoading={secureMedia.isLoading}
          developedAt={drop.developedAt}
          onDeveloped={drop.onDeveloped}
          mediaChatKey={mediaChatKey}
          getAuthHeaders={getAuthHeaders}
          getE2eeV2Session={getE2eeV2Session}
          nowMs={drop.nowMs}
        />
        {metaOverlay}
      </div>
    );
  } else if (isBeacon) {
    body = (
      <>
        {reply ? <ReplyQuote author={replyAuthor} snippet={replySnippet} mine={isMine} inBubble={false} onClick={jumpToReply} /> : null}
        <BeaconChatCard message={message} />
        {metaBelow}
      </>
    );
  } else if (attachment) {
    body = (
      <>
        {reply ? <ReplyQuote author={replyAuthor} snippet={replySnippet} mine={isMine} inBubble={false} onClick={jumpToReply} /> : null}
        <AttachmentBubble
          envelope={attachment}
          isMine={isMine}
          getAuthHeaders={getAuthHeaders ?? (async () => ({ 'Content-Type': 'application/json' }))}
          chatId={message.chat_id}
          messageMetadata={mediaV2Fields(meta, message.chat_id)}
          getE2eeV2Session={getE2eeV2Session}
        />
        {metaBelow}
      </>
    );
  } else if (plan) {
    body = (
      <>
        <PlanCard plan={plan} message={message} currentUserId={currentUserId} isMine={isMine} onRsvp={onPlanRsvp} />
        {metaBelow}
      </>
    );
  } else if (gif) {
    const width = Math.min(256, Math.round((288 * gif.width) / gif.height));
    body = (
      <>
        {reply ? <ReplyQuote author={replyAuthor} snippet={replySnippet} mine={isMine} inBubble={false} onClick={jumpToReply} /> : null}
        <div className="relative max-w-full overflow-hidden rounded-lg bg-fill-subtle" style={{ width, aspectRatio: `${gif.width} / ${gif.height}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- KLIPY media must load from the URL the API returned */}
          <img src={gif.url} alt="GIF" loading="lazy" referrerPolicy="no-referrer" className="block size-full object-cover" />
          {metaOverlay}
        </div>
      </>
    );
  } else if (isImage || isAudio) {
    const unavailable = (
      <p className={cn('type-meta rounded-bubble px-3 py-2', bubbleTone)}>
        <Lock size={12} className="mr-1 inline" aria-hidden />
        {isImage ? 'Photo' : 'Voice message'} unavailable
      </p>
    );
    body = (
      <>
        {reply ? <ReplyQuote author={replyAuthor} snippet={replySnippet} mine={isMine} inBubble={false} onClick={jumpToReply} /> : null}
        {isImage ? (
          secureMedia.isLoading ? (
            <div className="aspect-[4/3] w-[320px] max-w-full animate-pulse rounded-lg bg-fill-subtle" aria-busy aria-label="Decrypting photo" />
          ) : imageSrc ? (
            <div className="relative max-w-[min(100%,320px)] overflow-hidden rounded-lg bg-fill-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element -- decrypted or signed media URL */}
              <img src={imageSrc} alt="Photo" loading="lazy" className="block max-h-[360px] w-auto max-w-full object-cover" />
              {!caption ? metaOverlay : null}
            </div>
          ) : (
            unavailable
          )
        ) : secureMedia.isLoading ? (
          <div className="h-[52px] w-[240px] max-w-full animate-pulse rounded-bubble bg-fill-subtle" aria-busy aria-label="Decrypting voice message" />
        ) : imageSrc ? (
          <ChatThemeAudioPlayer src={imageSrc} variant={variant} durationHint={durationSecondsFromMetadata(message.metadata)} />
        ) : (
          unavailable
        )}
        {caption ? (
          <div className={cn('relative mt-0.5 max-w-full rounded-bubble px-3 py-2 type-body break-words pointer-coarse:text-[16px]', bubbleTone, tail)}>
            {ciphertext ? <EncryptedText mine={isMine} lockedText={lockedText} /> : <LinkifiedText text={content} variant={variant} />}
            <InlineMeta message={message} mine={isMine} pinned={pinned} />
          </div>
        ) : isAudio ? (
          metaBelow
        ) : null}
      </>
    );
  } else {
    const bubble = (
      <div className={cn('relative max-w-full rounded-bubble px-3 py-2 type-body break-words whitespace-pre-wrap pointer-coarse:text-[16px]', bubbleTone, tail)}>
        {reply ? <ReplyQuote author={replyAuthor} snippet={replySnippet} mine={isMine} inBubble onClick={jumpToReply} /> : null}
        {ciphertext ? <EncryptedText mine={isMine} lockedText={lockedText} /> : <LinkifiedText text={content} variant={variant} />}
        <InlineMeta message={message} mine={isMine} pinned={pinned} />
      </div>
    );
    // A shared drop's reply or reaction: the drop over the text; a reaction is just its emoji on the photo.
    body = dropReply ? (
      <>
        <DropReplyHeader reply={dropReply} mine={isMine} emoji={dropReply.reaction && !ciphertext ? caption : null} />
        {dropReply.reaction ? metaBelow : bubble}
      </>
    ) : (
      bubble
    );
  }

  const canEdit = isMine && isText && !ciphertext && !optimistic;

  return (
    <div
      data-message-id={message.id}
      tabIndex={0}
      aria-label={`${isMine ? 'You' : (sender?.name ?? 'Them')}, ${formatMessageTime(message.time_created)}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      onKeyDown={onRowKeyDown}
      onContextMenu={onContextMenu}
      className={cn(
        'relative flex w-full items-end gap-2 rounded-md py-[1.5px] outline-none transition-colors duration-[1200ms] focus-visible:ring-2 focus-visible:ring-accent',
        isMine ? 'justify-end pl-16' : 'justify-start pr-16',
        first && 'mt-2',
        highlighted && 'bg-selection',
      )}
    >
      {sender ? (
        <span className="w-8 shrink-0">
          {last ? <Avatar seed={sender.id} name={sender.name} src={sender.avatarUrl ?? null} size={32} /> : null}
        </span>
      ) : null}

      <div
        className={cn('relative flex min-w-0 max-w-[min(75%,520px)] flex-col', isMine ? 'items-end' : 'items-start')}
        onDoubleClick={() => {
          window.getSelection()?.removeAllRanges();
          react('❤️');
        }}
      >
        {sender && first ? <span className="type-meta mb-0.5 truncate px-3 font-semibold text-fg-secondary">{sender.name}</span> : null}

        {active && !optimistic ? (
          <MessageActionBar
            mine={isMine}
            myReactions={myReactions}
            onReact={react}
            onReply={onReply ? () => onReply(message) : undefined}
            onCopy={isText && !ciphertext && caption ? copy : undefined}
            onEdit={canEdit ? () => onEdit(message.id, content) : undefined}
            pinned={pinned}
            onTogglePin={onTogglePin ? () => onTogglePin(message) : undefined}
            onSaveImage={isImage && imageSrc && !isDrop ? save : undefined}
            onDelete={isMine ? () => onDelete(message.id) : undefined}
            menuOpen={menuOpen}
            onMenuOpenChange={setMenuOpen}
            pickerOpen={pickerOpen}
            onPickerOpenChange={setPickerOpen}
          />
        ) : null}

        {body}

        {reactions.length > 0 ? (
          <div className={cn('relative z-[1] -mt-1 flex flex-wrap gap-1 px-2', isMine ? 'justify-end' : 'justify-start')}>
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => react(r.emoji)}
                aria-pressed={r.mine}
                aria-label={`${r.emoji} ${r.count}${r.mine ? ', including you' : ''}`}
                className={cn(
                  'press type-badge tabular inline-flex items-center gap-1 rounded-pill border px-2 py-[3px]',
                  r.mine ? 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-selection text-accent' : 'border-hairline bg-bubble-in text-fg-secondary',
                )}
              >
                <span aria-hidden>{r.emoji}</span>
                {r.count > 1 ? <span aria-hidden className="font-semibold">{r.count}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Time and receipt tucked into the bubble's last line (spec §7.2): an invisible copy reserves
 * the space so text wraps around it, and the visible one sits in the corner.
 */
function InlineMeta({ message, mine, pinned }: { message: Message; mine: boolean; pinned: boolean }) {
  const tone = mine ? 'out' : 'in';
  return (
    <>
      <MessageMeta message={message} mine={mine} pinned={pinned} tone={tone} className="invisible ml-2 align-bottom" />
      <MessageMeta message={message} mine={mine} pinned={pinned} tone={tone} className="absolute bottom-1.5 right-3" />
    </>
  );
}
