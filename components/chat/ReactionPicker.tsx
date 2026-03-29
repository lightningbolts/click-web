'use client';

import {
  useState,
  useLayoutEffect,
  useRef,
  useCallback,
  useEffect,
  type RefObject,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import data from '@emoji-mart/data';
import { motion, AnimatePresence } from 'framer-motion';
import { REACTION_EMOJIS } from '@/lib/chat/types';
import { clampBarLeftToBubble, clampLeftEdge, clampTop } from '@/lib/chat/portalBounds';
import { CHAT_HOVER_ANCHOR_ATTR, pointerMovesWithinHoverGroup } from '@/lib/chat/hoverGroup';

const Picker = dynamic(() => import('@emoji-mart/react').then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-16 max-h-[28dvh] items-center justify-center text-[11px] text-zinc-500">
      Loading…
    </div>
  ),
});

const PANEL_PAD = 14;

/** Every category in `@emoji-mart/data` native set + computed frequent row (search still finds all emojis). */
const FULL_PICKER_CATEGORIES = [
  'frequent',
  'people',
  'nature',
  'foods',
  'activity',
  'places',
  'objects',
  'symbols',
  'flags',
] as const;

/**
 * Panel size: wide enough for category tabs + scroll grid; still clamped to the chat card and viewport.
 */
function responsivePickerMetrics(vw: number, vh: number, boundW: number) {
  const isTiny = vw < 380;
  const isNarrow = vw < 520;
  const sidePad = isTiny ? 8 : isNarrow ? 10 : PANEL_PAD;
  const maxPanelW = Math.max(
    108,
    Math.min(
      vw - 2 * sidePad,
      isTiny ? Math.min(240, vw - 16) : isNarrow ? Math.min(300, vw - 20) : Math.min(420, vw - 32),
      Number.isFinite(boundW) ? boundW - 2 * sidePad : 260,
    ),
  );
  const quickH = isTiny ? 34 : isNarrow ? 36 : 38;
  /** Tall enough for emoji-mart’s internal scroll (.scroll); too short breaks wheel/touch scrolling. */
  const fullPanelInnerH = Math.max(
    280,
    isTiny
      ? Math.min(320, Math.round(vh * 0.52))
      : isNarrow
        ? Math.min(380, Math.round(vh * 0.6))
        : Math.min(480, Math.round(vh * 0.68)),
  );
  const emojiSize = isTiny ? 16 : isNarrow ? 18 : 20;
  const emojiButtonSize = emojiSize + 8;
  const perLine = Math.max(4, Math.min(10, Math.floor(maxPanelW / (emojiButtonSize + 8))));
  return { maxPanelW, quickH, fullPanelInnerH, emojiSize, emojiButtonSize, sidePad, perLine };
}

/** Space between the quick bar and the full picker so they never visually merge. */
const STACK_SPINE = 14;

/** Shadow DOM / gaps: brief leave should not tear down the picker. */
const PICKER_POINTER_LEAVE_MS = 480;

const EMOJI_MART_SCROLL_FIX_ID = 'click-emoji-mart-scroll-layout-fix';

/**
 * emoji-mart's shadow CSS sets `min-width: 0` on * but not `min-height: 0` on flex children.
 * Without it, `.scroll.flex-grow` sizes to all emoji rows (no overflow) so wheel + category nav break.
 */
function injectEmojiMartScrollLayoutFix(hostEl: HTMLElement | null) {
  if (!hostEl) return;
  const picker = hostEl.querySelector('em-emoji-picker');
  const sr = picker?.shadowRoot;
  if (!sr || sr.getElementById(EMOJI_MART_SCROLL_FIX_ID)) return;
  if (!sr.querySelector('#root')) return;
  const style = document.createElement('style');
  style.id = EMOJI_MART_SCROLL_FIX_ID;
  style.textContent = `
:host {
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  box-sizing: border-box !important;
}
#root {
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
  flex: 1 1 0% !important;
  height: 100% !important;
  max-height: 100% !important;
  overflow: hidden !important;
}
.scroll.flex-grow {
  min-height: 0 !important;
  flex: 1 1 0% !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
  padding-right: 12px !important;
  margin-right: 0 !important;
  scrollbar-gutter: stable !important;
}
.scroll {
  scrollbar-width: thin !important;
  scrollbar-color: rgba(255, 255, 255, 0.4) rgba(255, 255, 255, 0.08) !important;
}
.scroll::-webkit-scrollbar {
  width: 8px !important;
}
.scroll::-webkit-scrollbar-track {
  margin: 2px 0 !important;
  background: transparent !important;
}
.scroll::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.22) !important;
  border-radius: 999px !important;
}
.scroll:hover::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.4) !important;
}
`;
  sr.appendChild(style);
}

interface ReactionPickerProps {
  onReact: (emoji: string) => void;
  activeReactions?: string[];
  visible: boolean;
  /** Message bubble used for fixed positioning (avoids overlap with scroll clipping). */
  anchorRef: RefObject<HTMLElement | null>;
  /** Optional chat panel — keeps the picker inside the visible message area. */
  boundsRef?: RefObject<HTMLElement | null>;
  /** When your message menu is docked left of the bubble, place the picker to the left of that bar (no overlap). */
  toolbarDock?: {
    left: number;
    top: number;
    width: number;
    height: number;
    gap?: number;
    preferSide?: 'left' | 'right';
  } | null;
  /** Pin panel to the right edge of the bubble (yours, no dock) vs left (theirs). */
  alignToBubbleEnd?: boolean;
  /** Same id as `MessageBubble` column / toolbar for hover bridging across portals. */
  hoverGroupId?: string;
  onPortaledPointerChange?: (inside: boolean) => void;
}

function measureAnchor(
  anchorRef: RefObject<HTMLElement | null>,
  showFull: boolean,
  opts?: {
    boundsEl: HTMLElement | null;
    alignToBubbleEnd: boolean;
    measuredQuickHeight?: number;
    measuredFullHeight?: number;
    toolbarDock: {
      left: number;
      top: number;
      width: number;
      height: number;
      gap?: number;
      preferSide?: 'left' | 'right';
    } | null;
  },
) {
  const el = anchorRef.current;
  if (!el || typeof window === 'undefined') return null;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const alignToBubbleEnd = opts?.alignToBubbleEnd ?? false;
  const toolbarDock = opts?.toolbarDock ?? null;
  const boundsRect = opts?.boundsEl?.getBoundingClientRect() ?? null;

  const boundW = boundsRect ? boundsRect.width : vw;
  const {
    maxPanelW,
    quickH,
    fullPanelInnerH,
    emojiSize,
    emojiButtonSize,
    sidePad: pad,
    perLine,
  } = responsivePickerMetrics(vw, vh, boundW);

  const measuredQuickHeight = opts?.measuredQuickHeight ?? 0;
  const measuredFullHeight = opts?.measuredFullHeight ?? 0;
  const quickHeight = Math.max(quickH, measuredQuickHeight);
  const boundsInnerHeight = boundsRect ? Math.max(0, boundsRect.height - 2 * pad) : Math.max(0, vh - 2 * pad);
  const maxFullHeightByBounds = Math.max(0, boundsInnerHeight - quickHeight - STACK_SPINE);
  const desiredFullPanelInnerH = Math.min(fullPanelInnerH, maxFullHeightByBounds);
  const measuredCapped = measuredFullHeight > 0 ? Math.min(measuredFullHeight, maxFullHeightByBounds) : 0;
  /** Anchor position uses only the quick strip so opening the full picker does not move it. */
  const needH = quickHeight;
  const gap = 10;
  const effectiveTop = boundsRect ? boundsRect.top + pad : pad;
  const effectiveBottom = boundsRect ? boundsRect.bottom - pad : vh - pad;

  let left: number;
  let top: number;
  let placeBelow: boolean;

  if (toolbarDock) {
    const g = toolbarDock.gap ?? 16;
    const T = toolbarDock.top;
    const H = toolbarDock.height;
    const toolbarLeft = toolbarDock.left;
    const toolbarRight = toolbarDock.left + toolbarDock.width;

    const sidePreference = toolbarDock.preferSide ?? (alignToBubbleEnd ? 'left' : 'right');
    const sideLeft = clampLeftEdge(toolbarLeft - g - maxPanelW, maxPanelW, pad, boundsRect, pad);
    const sideRight = clampLeftEdge(toolbarRight + g, maxPanelW, pad, boundsRect, pad);
    const bubbleAligned = clampBarLeftToBubble(
      r.left,
      r.right,
      maxPanelW,
      alignToBubbleEnd ? 'end' : 'start',
      pad,
      boundsRect,
      pad,
    );

    const overlapsToolbarHorizontally = (candidateLeft: number) => {
      const right = candidateLeft + maxPanelW;
      return right > toolbarLeft - g + 0.5 && candidateLeft < toolbarRight + g - 0.5;
    };

    const preferredSide = sidePreference === 'left' ? sideLeft : sideRight;
    const alternateSide = sidePreference === 'left' ? sideRight : sideLeft;
    left = preferredSide;
    if (overlapsToolbarHorizontally(left)) left = alternateSide;
    if (overlapsToolbarHorizontally(left)) left = bubbleAligned;

    const topAbove = T - needH - g;
    const topBelow = T + H + g;
    const fitsAbove = topAbove >= effectiveTop;
    const fitsBelow = topBelow + needH <= effectiveBottom;

    if (fitsBelow && !fitsAbove) {
      top = topBelow;
      placeBelow = true;
    } else if (fitsAbove && !fitsBelow) {
      top = topAbove;
      placeBelow = false;
    } else if (fitsBelow && fitsAbove) {
      const roomAbove = T - effectiveTop;
      const roomBelow = effectiveBottom - (T + H);
      placeBelow = roomBelow >= roomAbove;
      top = placeBelow ? topBelow : topAbove;
    } else {
      const clampedAbove = clampTop(topAbove, needH, pad, boundsRect, pad);
      const clampedBelow = clampTop(topBelow, needH, pad, boundsRect, pad);
      const overlapAbove = Math.max(0, Math.min(clampedAbove + quickHeight, T + H + g) - Math.max(clampedAbove, T - g));
      const overlapBelow = Math.max(0, Math.min(clampedBelow + quickHeight, T + H + g) - Math.max(clampedBelow, T - g));
      placeBelow = overlapBelow <= overlapAbove;
      top = placeBelow ? clampedBelow : clampedAbove;
    }

    top = clampTop(top, needH, pad, boundsRect, pad);
  } else {
    left = clampBarLeftToBubble(
      r.left,
      r.right,
      maxPanelW,
      alignToBubbleEnd ? 'end' : 'start',
      pad,
      boundsRect,
      pad,
    );

    const topIfBelow = r.bottom + gap;
    const topIfAbove = r.top - gap - needH;
    const usableBelow = effectiveBottom - topIfBelow;
    const usableAbove = r.top - effectiveTop - gap;

    if (usableBelow >= needH) {
      placeBelow = true;
      top = topIfBelow;
    } else if (usableAbove >= needH) {
      placeBelow = false;
      top = topIfAbove;
    } else if (usableBelow >= usableAbove) {
      placeBelow = true;
      top = topIfBelow;
    } else {
      placeBelow = false;
      top = topIfAbove;
    }

    top = clampTop(top, needH, pad, boundsRect, pad);
  }

  let resolvedFullInnerH = desiredFullPanelInnerH;
  if (showFull) {
    const raw = Math.max(desiredFullPanelInnerH, measuredCapped);
    let cap: number;
    if (placeBelow) {
      cap = Math.max(0, effectiveBottom - (top + quickHeight + STACK_SPINE));
    } else {
      cap = Math.max(0, top - STACK_SPINE - effectiveTop);
    }
    resolvedFullInnerH = Math.min(raw, cap);
  }

  return {
    top,
    left,
    placeBelow,
    maxPanelW,
    emojiSize,
    emojiButtonSize,
    fullPanelInnerH: showFull ? resolvedFullInnerH : desiredFullPanelInnerH,
    quickH,
    perLine,
  };
}

/**
 * Quick reactions + full Unicode search via emoji-mart (portaled to `document.body`).
 */
export default function ReactionPicker({
  onReact,
  activeReactions = [],
  visible,
  anchorRef,
  boundsRef,
  toolbarDock = null,
  alignToBubbleEnd = false,
  hoverGroupId,
  onPortaledPointerChange,
}: ReactionPickerProps) {
  const [showFull, setShowFull] = useState(false);
  const quickBarRef = useRef<HTMLDivElement>(null);
  const fullPanelRef = useRef<HTMLDivElement>(null);
  const emojiMartHostRef = useRef<HTMLDivElement>(null);
  const leavePickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPickerLeaveTimer = useCallback(() => {
    if (leavePickerTimerRef.current) {
      clearTimeout(leavePickerTimerRef.current);
      leavePickerTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!visible) clearPickerLeaveTimer();
  }, [visible, clearPickerLeaveTimer]);

  useEffect(() => () => clearPickerLeaveTimer(), [clearPickerLeaveTimer]);

  const handlePickerRootEnter = useCallback(() => {
    clearPickerLeaveTimer();
    onPortaledPointerChange?.(true);
  }, [clearPickerLeaveTimer, onPortaledPointerChange]);

  const handlePickerRootLeave = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (hoverGroupId && pointerMovesWithinHoverGroup(e.relatedTarget, hoverGroupId)) {
        return;
      }
      clearPickerLeaveTimer();
      leavePickerTimerRef.current = setTimeout(() => {
        leavePickerTimerRef.current = null;
        onPortaledPointerChange?.(false);
        setShowFull(false);
      }, PICKER_POINTER_LEAVE_MS);
    },
    [clearPickerLeaveTimer, hoverGroupId, onPortaledPointerChange],
  );
  const [measuredHeights, setMeasuredHeights] = useState({ quick: 0, full: 0 });
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    placeBelow: boolean;
    maxPanelW: number;
    emojiSize: number;
    emojiButtonSize: number;
    fullPanelInnerH: number;
    quickH: number;
    perLine: number;
  } | null>(null);

  const measureHeights = useCallback(() => {
    const quick = quickBarRef.current?.offsetHeight ?? 0;
    const full = showFull ? fullPanelRef.current?.offsetHeight ?? 0 : 0;
    setMeasuredHeights((prev) => (prev.quick === quick && prev.full === full ? prev : { quick, full }));
  }, [showFull]);

  useLayoutEffect(() => {
    if (!visible) return;
    measureHeights();
    const raf = requestAnimationFrame(measureHeights);
    return () => cancelAnimationFrame(raf);
  }, [visible, showFull, pos?.maxPanelW, measureHeights]);

  useLayoutEffect(() => {
    if (!visible || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureHeights());
    const quickEl = quickBarRef.current;
    const fullEl = fullPanelRef.current;
    if (quickEl) ro.observe(quickEl);
    if (fullEl) ro.observe(fullEl);
    if (anchorRef.current) ro.observe(anchorRef.current);
    if (boundsRef?.current) ro.observe(boundsRef.current);
    return () => ro.disconnect();
  }, [visible, showFull, anchorRef, boundsRef, measureHeights]);

  useLayoutEffect(() => {
    if (!visible || !showFull || typeof document === 'undefined') return;
    let cancelled = false;
    let frames = 0;
    const run = () => {
      if (cancelled || frames++ > 120) return;
      const host = emojiMartHostRef.current;
      const picker = host?.querySelector('em-emoji-picker');
      const ready = picker?.shadowRoot?.querySelector('#root');
      if (!ready) {
        requestAnimationFrame(run);
        return;
      }
      injectEmojiMartScrollLayoutFix(host);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [visible, showFull]);

  useLayoutEffect(() => {
    if (!visible || typeof document === 'undefined') {
      setPos(null);
      setShowFull(false);
      return;
    }
    const apply = () =>
      setPos(
        measureAnchor(anchorRef, showFull, {
          boundsEl: boundsRef?.current ?? null,
          alignToBubbleEnd,
          measuredQuickHeight: measuredHeights.quick,
          measuredFullHeight: measuredHeights.full,
          toolbarDock,
        }),
      );
    apply();
    const raf = requestAnimationFrame(apply);
    window.addEventListener('resize', apply);
    window.addEventListener('scroll', apply, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', apply);
      window.removeEventListener('scroll', apply, true);
    };
  }, [visible, anchorRef, showFull, boundsRef, toolbarDock, alignToBubbleEnd, measuredHeights]);

  if (!visible || typeof document === 'undefined' || !pos) return null;

  return createPortal(
    <AnimatePresence>
      {visible && pos && (
        <div
          key="reaction-picker"
          {...(hoverGroupId ? { [CHAT_HOVER_ANCHOR_ATTR]: hoverGroupId } : {})}
          className="pointer-events-auto relative overflow-visible"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 260,
          }}
          onMouseEnter={handlePickerRootEnter}
          onMouseLeave={handlePickerRootLeave}
        >
          <motion.div
            initial={{ opacity: 0, y: pos.placeBelow ? -6 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: pos.placeBelow ? -6 : 6 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="relative inline-block overflow-visible p-0.5"
            style={{ transformOrigin: pos.placeBelow ? 'top left' : 'bottom left' }}
          >
            {showFull && (
              <div
                className="absolute z-[1]"
                style={{
                  width: pos.maxPanelW,
                  ...(alignToBubbleEnd
                    ? { right: 0, left: 'auto' }
                    : { left: 0, right: 'auto' }),
                  ...(pos.placeBelow
                    ? { top: `calc(100% + ${STACK_SPINE}px)` }
                    : { bottom: `calc(100% + ${STACK_SPINE}px)` }),
                }}
              >
                <div
                  ref={fullPanelRef}
                  className="flex min-h-0 w-full flex-col overflow-hidden overscroll-contain rounded-2xl border border-zinc-600/80 bg-zinc-950 p-2 pr-1 shadow-xl ring-1 ring-white/[0.06]"
                  style={{
                    width: pos.maxPanelW,
                    maxWidth: pos.maxPanelW,
                    height: pos.fullPanelInnerH,
                    maxHeight: pos.fullPanelInnerH,
                    boxSizing: 'border-box',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    ref={emojiMartHostRef}
                    className="chat-emoji-mart-host box-border min-h-0 flex-1 basis-0 rounded-xl px-1 py-0.5"
                  >
                    <Picker
                      data={data}
                      theme="dark"
                      dynamicWidth
                      previewPosition="none"
                      skinTonePosition="search"
                      searchPosition="static"
                      navPosition="top"
                      perLine={pos.perLine}
                      emojiSize={pos.emojiSize}
                      emojiButtonSize={pos.emojiButtonSize}
                      maxFrequentRows={3}
                      categories={[...FULL_PICKER_CATEGORIES]}
                      onEmojiSelect={(e: { native: string }) => {
                        onReact(e.native);
                        setShowFull(false);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          <div
            ref={quickBarRef}
            className="flex w-max max-w-full items-center gap-1 rounded-full border border-zinc-600/50 bg-zinc-950/95 py-1.5 pl-2.5 pr-1 shadow-xl backdrop-blur-md sm:gap-1.5 sm:pl-3 sm:pr-1.5 sm:py-1.5"
            style={{ maxWidth: pos.maxPanelW, boxSizing: 'border-box' }}
          >
            <div className="flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto [scrollbar-width:thin] sm:gap-1">
              {REACTION_EMOJIS.map((emoji) => {
                const isActive = activeReactions.includes(emoji);
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReact(emoji);
                    }}
                    className={`shrink-0 leading-none rounded-full p-1 text-base transition-transform hover:scale-110 sm:p-1.5 sm:text-lg sm:hover:scale-125
                  ${isActive ? 'bg-[#8338EC]/30 ring-1 ring-[#8338EC]' : 'hover:bg-white/10'}`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowFull((v) => !v);
              }}
              className="shrink-0 rounded-full px-2 py-1 text-sm font-semibold tabular-nums text-zinc-200 hover:bg-white/15"
              aria-label="More emojis"
              title="More emojis"
            >
              +
            </button>
          </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
