'use client';

import {
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
  useEffect,
  type RefObject,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Pencil, Trash2, SmilePlus, Check, Phone, CornerDownRight } from 'lucide-react';
import type { Message, MessageReaction } from '@/lib/chat/types';
import { isClientOptimisticMessageId } from '@/lib/chat/clientOptimistic';
import ReactionPicker from './ReactionPicker';
import { getReplyFromMetadata } from '@/lib/chat/reply';
import { LinkifiedText } from '@/lib/chat/linkify';
import {
  durationSecondsFromMetadata,
  isEncryptedMediaFromMetadata,
  mediaUrlFromMetadata,
  originalMimeTypeFromMetadata,
} from '@/lib/chat/mediaMetadata';
import { isAnyE2eeWireContent, type DerivedKeys } from '@/lib/chat/crypto';
import { tryDecodeEnvelope } from '@/lib/chat/attachmentCrypto';
import AttachmentBubble from './AttachmentBubble';
import { useSecureMedia } from '@/lib/chat/useSecureMedia';
import ChatThemeAudioPlayer from './ChatThemeAudioPlayer';
import { clampBarLeftToBubble, clampTop, placeMineMessageActionBar, placeTheirMessageActionBar } from '@/lib/chat/portalBounds';
import { CHAT_HOVER_ANCHOR_ATTR, pointerMovesWithinHoverGroup } from '@/lib/chat/hoverGroup';

const ACTION_MENU_OPEN_EVENT = 'chat:message-action-open';

/** Crossing gaps to portaled UI + slower movement should not dismiss menus. */
const HIDE_DELAY_MS = 520;
const HIDE_DELAY_REACTION_OPEN_MS = 1400;

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  currentUserId: string;
  /** Show the sender's first initial avatar */
  senderInitial?: string;
  /** Short label for group chats (first two chars of user id) when not the viewer. */
  senderLabel?: string;
  /** Green online dot on the sender avatar (Realtime `room:presence`). */
  showSenderOnline?: boolean;
  onReply?: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, currentContent: string) => void;
  onDelete: (messageId: string) => void;
  /** Messages glass panel — keeps portaled toolbars inside the chat card. */
  portalsBoundsRef?: RefObject<HTMLElement | null>;
  /** Active chat crypto key for decrypting encrypted media payloads. */
  mediaChatKey?: DerivedKeys | ArrayBuffer | null;
  /** Factory returning `Authorization: Bearer …` headers; used to sign attachment URLs. */
  getAuthHeaders?: () => Promise<HeadersInit>;
  /** Transient search deep-link highlight. */
  highlighted?: boolean;
}

function callLogLabel(metadata: unknown): { text: string; missed: boolean } {
  const m = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const state = typeof m.call_state === 'string' ? m.call_state : '';
  const rawDur = m.duration_seconds;
  const dur =
    typeof rawDur === 'number'
      ? rawDur
      : typeof rawDur === 'string'
        ? parseInt(rawDur, 10) || 0
        : 0;
  if (state === 'missed') return { text: 'Missed Voice Call', missed: true };
  if (state === 'declined') return { text: 'Declined Call', missed: false };
  if (state === 'completed') {
    const s = Math.max(0, Math.floor(dur));
    const min = Math.floor(s / 60);
    const sec = s % 60;
    const durLabel = min > 0 ? `${min}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;
    return { text: `Call Ended • ${durLabel}`, missed: false };
  }
  return { text: 'Call', missed: false };
}

function formatMessageTimeLabel(ms: number) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

type MineDeliveryState = 'pending' | 'sent' | 'delivered' | 'read';

function mineDeliveryState(message: Message): MineDeliveryState {
  const meta =
    message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
      ? (message.metadata as Record<string, unknown>)
      : {};
  const optimistic = isClientOptimisticMessageId(message.id);
  const postAck = meta._webPostAck === true || !optimistic;
  const delivered =
    message.delivered_at != null && Number.isFinite(Number(message.delivered_at));
  // Use `read_at` only — optimistic rows used `is_read: true` by mistake, which showed double ticks then dropped to one after merge.
  const read = message.read_at != null && Number.isFinite(Number(message.read_at));
  if (read) return 'read';
  if (delivered) return 'delivered';
  if (postAck) return 'sent';
  return 'pending';
}

/** WhatsApp-style ticks for outgoing non–call-log messages (web). */
function MineDeliveryTicks({ message }: { message: Message }) {
  const state = mineDeliveryState(message);
  const pair = (className: string, title: string) => (
    <span className={`inline-flex items-center -space-x-1.5 ${className}`} title={title}>
      <Check className="w-3 h-3" strokeWidth={2.5} aria-hidden />
      <Check className="w-3 h-3" strokeWidth={2.5} aria-hidden />
    </span>
  );

  if (state === 'read') {
    return pair('text-primary', 'Read');
  }
  if (state === 'delivered') {
    return pair('text-on-surface-variant', 'Delivered');
  }
  if (state === 'sent') {
    return (
      <span className="inline-flex text-on-surface-variant" title="Sent">
        <Check className="w-3 h-3" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  return (
    <span className="inline-flex h-3 w-3 rounded-full border border-border-hard opacity-70" title="Sending…" aria-hidden />
  );
}

function isSafeRenderableMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'blob:';
  } catch {
    return false;
  }
}


/**
 * MessageBubble - renders a single chat message with reactions,
 * edit/delete controls, and a reaction picker.
 */
export default function MessageBubble({
  message,
  isMine,
  currentUserId,
  senderInitial = '?',
  senderLabel,
  showSenderOnline = false,
  onReply,
  onReact,
  onEdit,
  onDelete,
  portalsBoundsRef,
  mediaChatKey,
  getAuthHeaders,
  highlighted = false,
}: MessageBubbleProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  /** Whole message column (bubble + reactions + time); toolbar is positioned from this so it never covers text. */
  const messageColumnRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const layoutApplyRef = useRef<() => void>(() => {});
  /** Portaled toolbar geometry (for layout + emoji picker dock). */
  const [actionBarGeom, setActionBarGeom] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    maxWidthPx?: number;
  } | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    const delay = showPicker ? HIDE_DELAY_REACTION_OPEN_MS : HIDE_DELAY_MS;
    hideTimeout.current = setTimeout(() => {
      setShowActions(false);
      setShowPicker(false);
    }, delay);
  }, [showPicker]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onOtherMenuOpened = (event: Event) => {
      const incomingId = (event as CustomEvent<{ messageId?: string }>).detail?.messageId;
      if (!incomingId || incomingId === message.id) return;
      setShowActions(false);
      setShowPicker(false);
    };
    document.addEventListener(ACTION_MENU_OPEN_EVENT, onOtherMenuOpened as EventListener);
    return () => {
      document.removeEventListener(ACTION_MENU_OPEN_EVENT, onOtherMenuOpened as EventListener);
    };
  }, [message.id]);

  useEffect(() => {
    if (showPicker) cancelHide();
  }, [showPicker, cancelHide]);

  const mediaUrl = mediaUrlFromMetadata(message.metadata);
  const isEncryptedMedia = isEncryptedMediaFromMetadata(message.metadata);
  const originalMimeType = originalMimeTypeFromMetadata(message.metadata);
  const secureMedia = useSecureMedia({
    storageUrl: mediaUrl,
    chatKey: mediaChatKey,
    mimeType: originalMimeType,
    isEncryptedMedia,
  });

  useLayoutEffect(() => {
    if (!showActions || typeof document === 'undefined') {
      setActionBarGeom(null);
      return;
    }
    const gap = 8;
    const pad = 12;
    const estimateBarW = (maxWidthPx?: number) => {
      const mineExtra = isMine ? 88 : 0;
      const replyExtra = typeof onReply === 'function' ? 48 : 0;
      const estimated = 36 + mineExtra + replyExtra;
      return maxWidthPx !== undefined ? Math.min(estimated, maxWidthPx) : estimated;
    };

    const apply = () => {
      const el = messageColumnRef.current;
      if (!el) {
        setActionBarGeom(null);
        return;
      }
      const boundsRect = portalsBoundsRef?.current?.getBoundingClientRect() ?? null;
      const maxWidthPx =
        boundsRect && boundsRect.width > 2 * pad ? boundsRect.width - 2 * pad : undefined;
      const r = el.getBoundingClientRect();
      const bubbleR = bubbleRef.current?.getBoundingClientRect();
      const measuredW = actionBarRef.current?.offsetWidth;
      const measuredH = actionBarRef.current?.offsetHeight;
      const rawBarW = measuredW && measuredW > 0 ? measuredW : estimateBarW(maxWidthPx);
      const barW = maxWidthPx !== undefined ? Math.min(rawBarW, maxWidthPx) : rawBarW;
      const barH = measuredH && measuredH > 0 ? measuredH : 44;

      let leftEdge: number;
      let top: number;

      if (isMine && bubbleR) {
        const placed = placeMineMessageActionBar(bubbleR, barW, barH, gap, pad, boundsRect, pad);
        leftEdge = placed.left;
        top = placed.top;
      } else if (bubbleR) {
        /** Theirs: beside the bubble (right edge) when possible; else above/below, end-aligned. */
        const placed = placeTheirMessageActionBar(bubbleR, barW, barH, gap, pad, boundsRect, pad);
        leftEdge = placed.left;
        top = placed.top;
      } else {
        leftEdge = clampBarLeftToBubble(r.left, r.right, barW, 'start', pad, boundsRect, pad);
        top = clampTop(r.top - barH - gap, barH, pad, boundsRect, pad);
      }

      setActionBarGeom({
        left: leftEdge,
        top,
        width: barW,
        height: barH,
        ...(maxWidthPx !== undefined ? { maxWidthPx } : {}),
      });
    };
    layoutApplyRef.current = apply;
    apply();
    const raf = requestAnimationFrame(apply);
    window.addEventListener('resize', apply);
    window.addEventListener('scroll', apply, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', apply);
      window.removeEventListener('scroll', apply, true);
    };
  }, [showActions, isMine, portalsBoundsRef, onReply]);

  useLayoutEffect(() => {
    if (!showActions || !actionBarGeom) return;
    const el = actionBarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => layoutApplyRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, [showActions, actionBarGeom]);

  const pickerToolbarDock = useMemo(() => {
    if (!showActions || !actionBarGeom) return null;
    return {
      ...actionBarGeom,
      gap: 16,
      preferSide: isMine ? ('left' as const) : ('right' as const),
    };
  }, [isMine, showActions, actionBarGeom]);

  if (message.message_type === 'call_log') {
    const { text, missed } = callLogLabel(message.metadata);
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
        className="flex w-full justify-center px-2 py-2"
      >
        <div
          className="inline-flex max-w-[90%] items-center gap-2 rounded-[20px] border border-border-hard bg-surface-container px-3.5 py-2 text-sm "
          role="status"
        >
          <Phone className={`h-4 w-4 shrink-0 ${missed ? 'text-red-400' : 'text-on-surface-variant'}`} aria-hidden />
          <span className={missed ? 'font-medium text-red-400' : 'font-medium text-on-surface'}>{text}</span>
          <span className="text-[10px] text-on-surface-variant">{formatMessageTimeLabel(message.time_created)}</span>
        </div>
      </motion.div>
    );
  }

  const flatReactions: { emoji: string; count: number; iMine: boolean }[] = Object.entries(
    message.reactions ?? {}
  ).map(([emoji, users]) => ({
    emoji,
    count: (users as MessageReaction[]).length,
    iMine: (users as MessageReaction[]).some((r) => r.user_id === currentUserId),
  }));

  const myReactions = flatReactions.filter((r) => r.iMine).map((r) => r.emoji);

  const handleMouseEnter = () => {
    cancelHide();
    if (typeof document !== 'undefined') {
      document.dispatchEvent(
        new CustomEvent<{ messageId: string }>(ACTION_MENU_OPEN_EVENT, {
          detail: { messageId: message.id },
        }),
      );
    }
    setShowActions(true);
  };

  const handleMouseLeave = (e: MouseEvent<HTMLDivElement>) => {
    if (pointerMovesWithinHoverGroup(e.relatedTarget, message.id)) return;
    scheduleHide();
  };

  const handlePortaledMouseLeave = (e: MouseEvent<HTMLDivElement>) => {
    if (pointerMovesWithinHoverGroup(e.relatedTarget, message.id)) return;
    scheduleHide();
  };

  const timeLabel = formatMessageTimeLabel(message.time_created);
  const replyMeta = getReplyFromMetadata(message.metadata);
  const resolvedMediaUrl = secureMedia.src;
  const audioDuration = durationSecondsFromMetadata(message.metadata);
  const linkVariant = isMine ? 'mine' : 'theirs';
  const captionText = message.content.trim();
  const showCaption = captionText.length > 0;
  const captionLooksEncrypted =
    message.message_type === 'text' && showCaption && isAnyE2eeWireContent(captionText);
  const isImage = message.message_type === 'image';
  const isAudio = message.message_type === 'audio';
  const attachmentEnvelope =
    message.message_type === 'file' || captionText.startsWith('ccx:v1:')
      ? tryDecodeEnvelope(captionText)
      : null;
  const isAttachment = attachmentEnvelope !== null;
  const textBubbleClass = isMine
    ? 'bg-primary text-on-primary rounded-br-sm'
    : 'border border-border-hard bg-surface-container text-on-surface rounded-bl-sm';

  return (
    <motion.div
      data-message-id={message.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className={`flex items-end gap-2 group rounded-2xl transition-[box-shadow,background-color] duration-700 ${
        isMine ? 'flex-row-reverse' : 'flex-row'
      } ${highlighted ? 'bg-primary/15 ring-2 ring-primary/50 shadow-[0_0_0_4px_rgba(99,14,212,0.12)]' : ''}`}
    >
      {/* Avatar */}
      {!isMine && (
        <div className="relative w-8 h-8 shrink-0 mb-1">
          <div
            className="flex h-full w-full items-center justify-center rounded-full bg-primary
            text-xs font-bold text-on-primary"
          >
            {senderLabel ?? senderInitial}
          </div>
          {showSenderOnline && (
            <span
              className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
              aria-hidden
            />
          )}
        </div>
      )}

      <div
        ref={messageColumnRef}
        {...{ [CHAT_HOVER_ANCHOR_ATTR]: message.id }}
        className={`relative max-w-[72%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <ReactionPicker
          anchorRef={bubbleRef}
          boundsRef={portalsBoundsRef}
          alignToBubbleEnd={isMine}
          toolbarDock={pickerToolbarDock}
          hoverGroupId={message.id}
          visible={showPicker}
          activeReactions={myReactions}
          onReact={(emoji) => {
            onReact(message.id, emoji);
            setShowPicker(false);
          }}
          onPortaledPointerChange={(inside) => {
            if (inside) cancelHide();
            else scheduleHide();
          }}
        />

        {isAttachment && attachmentEnvelope ? (
          <div
            ref={bubbleRef}
            className={`relative flex w-full flex-col gap-2 ${isMine ? 'items-end' : 'items-start'}`}
          >
            {replyMeta && (
              <div
                className={`max-w-full rounded-2xl border px-3 py-2 text-xs leading-snug ${
                  isMine
                    ? 'border-white/20 bg-black/15 text-on-primary'
                    : 'border-border-hard bg-surface text-on-surface-variant'
                }`}
              >
                <span className="flex items-center gap-1 font-medium opacity-90">
                  <CornerDownRight className="w-3 h-3 shrink-0" aria-hidden />
                  Reply
                </span>
                <p className="mt-0.5 line-clamp-3">{replyMeta.snippet || 'Message'}</p>
              </div>
            )}
            <AttachmentBubble
              envelope={attachmentEnvelope}
              isMine={isMine}
              getAuthHeaders={
                getAuthHeaders ??
                (async () => ({ 'Content-Type': 'application/json' }))
              }
            />
          </div>
        ) : isImage || isAudio ? (
          <div
            ref={bubbleRef}
            className={`relative flex w-full flex-col gap-2 ${isMine ? 'items-end' : 'items-start'}`}
          >
            {replyMeta && (
              <div
                className={`max-w-full rounded-2xl border px-3 py-2 text-xs leading-snug ${
                  isMine
                    ? 'border-white/20 bg-black/15 text-on-primary'
                    : 'border-border-hard bg-surface text-on-surface-variant'
                }`}
              >
                <span className="flex items-center gap-1 font-medium opacity-90">
                  <CornerDownRight className="w-3 h-3 shrink-0" aria-hidden />
                  Reply
                </span>
                <p className="mt-0.5 line-clamp-3">{replyMeta.snippet || 'Message'}</p>
              </div>
            )}

            {isImage && (
              <>
                {secureMedia.isLoading ? (
                  <div
                    className="h-56 w-[min(100%,20rem)] animate-pulse rounded-2xl border border-border-hard bg-surface-container"
                    aria-busy
                    aria-label="Decrypting photo"
                  />
                ) : resolvedMediaUrl && isSafeRenderableMediaUrl(resolvedMediaUrl) ? (
                  <div
                    className={`max-w-full overflow-hidden rounded-2xl ${
                      isMine
                        ? 'shadow-[0_10px_40px_rgba(131,56,236,0.38)] ring-1 ring-white/30'
                        : 'border border-border-hard shadow-[0_8px_28px_rgba(0,0,0,0.35)] ring-1 ring-black/30'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public URLs are dynamic per project */}
                    <img
                      src={resolvedMediaUrl}
                      alt=""
                      className="block max-h-72 w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <p className={`text-xs ${isMine ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                    {isEncryptedMedia || secureMedia.error ? 'Encrypted photo unavailable' : 'Photo unavailable'}
                  </p>
                )}
              </>
            )}

            {isAudio && (
              <>
                {secureMedia.isLoading ? (
                  <div
                    className={`h-[60px] min-w-[220px] max-w-[min(100%,300px)] animate-pulse rounded-2xl border ${
                      isMine ? 'border-white/20 bg-white/10' : 'border-border-hard bg-surface-container'
                    }`}
                    aria-busy
                    aria-label="Decrypting voice message"
                  />
                ) : resolvedMediaUrl && isSafeRenderableMediaUrl(resolvedMediaUrl) ? (
                  <ChatThemeAudioPlayer
                    src={resolvedMediaUrl}
                    variant={linkVariant}
                    durationHint={audioDuration}
                  />
                ) : (
                  <p className={`text-xs ${isMine ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                    {isEncryptedMedia || secureMedia.error
                      ? 'Encrypted voice message unavailable'
                      : 'Voice message unavailable'}
                  </p>
                )}
              </>
            )}

            {showCaption && (
              <div
                className={`relative max-w-full rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${textBubbleClass}`}
              >
                {captionLooksEncrypted ? (
                  <div
                    className="h-4 max-w-[12rem] rounded-md bg-white/15 animate-pulse"
                    aria-busy
                    aria-label="Decrypting message"
                  />
                ) : (
                  <LinkifiedText text={message.content} variant={linkVariant} />
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            ref={bubbleRef}
            className={`relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${textBubbleClass}`}
          >
            {replyMeta && (
              <div
                className={`mb-2 rounded-lg border px-2.5 py-1.5 text-xs leading-snug ${
                  isMine
                    ? 'border-white/15 bg-black/15 text-on-primary/90'
                    : 'border-border-hard bg-surface text-on-surface-variant'
                }`}
              >
                <span className="flex items-center gap-1 font-medium opacity-80">
                  <CornerDownRight className="w-3 h-3 shrink-0" aria-hidden />
                  Reply
                </span>
                <p className="mt-0.5 line-clamp-3">{replyMeta.snippet || 'Message'}</p>
              </div>
            )}
            {message.message_type === 'text' && isAnyE2eeWireContent(message.content) ? (
              <div
                className="h-4 max-w-[14rem] rounded-md bg-white/15 animate-pulse"
                aria-busy
                aria-label="Decrypting message"
              />
            ) : (
              <LinkifiedText text={message.content} variant={linkVariant} />
            )}
          </div>
        )}

        {showActions &&
          actionBarGeom &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={actionBarRef}
              {...{ [CHAT_HOVER_ANCHOR_ATTR]: message.id }}
              style={{
                position: 'fixed',
                top: actionBarGeom.top,
                left: actionBarGeom.left,
                zIndex: 190,
                maxWidth: actionBarGeom.maxWidthPx,
                boxSizing: 'border-box',
              }}
              onMouseEnter={cancelHide}
              onMouseLeave={handlePortaledMouseLeave}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap glass rounded-full px-1.5 py-1 shadow-xl max-w-full [scrollbar-width:thin]"
                style={{ transformOrigin: 'center center' }}
              >
              <button
                type="button"
                onClick={() => setShowPicker((p) => !p)}
                className="shrink-0 p-1 rounded-full hover:bg-primary/20 text-on-surface-variant hover:text-primary transition-colors"
                title="React"
              >
                <SmilePlus className="w-3.5 h-3.5" />
              </button>
              {onReply && (
                <button
                  type="button"
                  onClick={() => {
                    onReply(message);
                    setShowActions(false);
                  }}
                  className="shrink-0 p-1 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors text-[11px] font-semibold px-2"
                  title="Reply"
                >
                  Reply
                </button>
              )}
              {isMine && message.message_type === 'text' && (
                <button
                  type="button"
                  onClick={() => onEdit(message.id, message.content)}
                  className="shrink-0 p-1 rounded-full hover:bg-secondary/20 text-on-surface-variant hover:text-secondary transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {isMine && (
                <button
                  type="button"
                  onClick={() => onDelete(message.id)}
                  className="shrink-0 p-1 rounded-full hover:bg-red-500/20 text-on-surface-variant hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              </motion.div>
            </div>,
            document.body,
          )}

        {/* Reactions row */}
        {flatReactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {flatReactions.map(({ emoji, count, iMine: active }) => (
              <button
                key={emoji}
                onClick={() => onReact(message.id, emoji)}
                className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full 
                  border transition-colors
                  ${active
                    ? 'bg-primary/20 border-primary/50 text-primary'
                    : 'bg-surface-container border-border-hard text-on-surface-variant hover:border-outline'
                  }`}
              >
                <span>{emoji}</span>
                <span className="font-medium">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Timestamp & delivery ticks (outgoing) */}
        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-on-surface-variant">
            {timeLabel}
            {message.time_edited ? (
              <span className="ml-1 italic text-outline opacity-90">· edited</span>
            ) : null}
          </span>
          {isMine && <MineDeliveryTicks message={message} />}
        </div>
      </div>
    </motion.div>
  );
}
