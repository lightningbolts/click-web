'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ds/Button';
import { useConfirm } from '@/components/ds/ConfirmDialog';
import { Dialog } from '@/components/ds/Dialog';
import { toast } from '@/components/ds/Toast';
import { useAuth } from '@/lib/AuthContext';
import { prefersReducedMotion } from '@/lib/motion';
import { dropPhotoUrl, dropState, groupSharedDrops } from '@/lib/drops/sharedDropGroups';
import { deleteSharedDrop, developSharedDrop, loadDropReactions, reportSharedDrop } from '@/lib/drops/sharedDropActions';
import type { HomeDrop } from '@/lib/home/types';
import { DropStoryFooter } from './DropStoryFooter';
import { DropStoryPage } from './DropStoryPage';
import {
  CROSS_FADE_IN_MS,
  CROSS_FADE_MS,
  CUBE,
  PRESENTED,
  ZOOM,
  ZOOM_SETTLED_MS,
  collapsedOnto,
  cubeFace,
  dismissDrag,
  intersectsViewport,
  type Box,
} from './storyMotion';

const REPORT_REASONS = ['Inappropriate', 'Harassment', 'Spam'] as const;
/** A press shorter than this, that barely moved, is a tap (longer holds pause). */
const TAP_MS = 250;
const TAP_SLOP = 16;

type Turn = { step: 1 | -1; toId: string | null };
type Gesture = { x0: number; y0: number; t0: number; axis: 'x' | 'y' | null; x: number; y: number; t: number; vx: number; vy: number };

function box(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * Shared Click Drops, story style (iOS `SharedDropStoryViewer`): zooms out of the tapped tile, then
 * plays each person's drops with progress segments and carries on to the next person, turning like
 * a cube. Tap the left third to go back and anywhere else to go on, hold to pause, drag sideways to
 * turn, drag down to close; ←/→ and Esc work too. A ready drop develops right here, resolving out of
 * its pixels. Replies and reactions go to your chat with the poster; your own drops show who reacted.
 */
export function DropStoryViewer({
  drops,
  startId,
  nowMs,
  sourceFor,
  onPatch,
  onRemove,
  onClose,
}: {
  /** The strip, newest first. */
  drops: HomeDrop[];
  startId: string;
  nowMs: number;
  /** What the story zooms out of and back into for a drop: its strip tile or chat thumbnail. */
  sourceFor: (drop: HomeDrop) => HTMLElement | null;
  onPatch: (id: string, patch: Partial<HomeDrop>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const viewerId = useAuth().user?.id ?? null;
  const groups = new Map(groupSharedDrops(drops, nowMs).map((g) => [g.userId, g]));
  // People in the order they were when the story opened, so watching never reshuffles what's next.
  const [order] = useState(() => groupSharedDrops(drops, nowMs).map((g) => g.userId));
  const [currentId, setCurrentId] = useState(startId);
  const [progressKey, setProgressKey] = useState(0);
  /** Developed here just now: they play the develop when they appear. */
  const [played, setPlayed] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [holding, setHolding] = useState(false);
  const [composing, setComposing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [footerOverlay, setFooterOverlay] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('opening');
  const [confirm, confirmDialog] = useConfirm();

  const contentRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const faces = useRef(new Map<string, HTMLDivElement>());
  const gesture = useRef<Gesture | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const turning = useRef(false);
  /** A tap or the clock asked for a turn: it runs once the incoming face is mounted. */
  const pendingAutoTurn = useRef(false);
  const prefetched = useRef(new Set<string>());

  const current = drops.find((d) => d.id === currentId) ?? null;
  const chapter = (userId: string) => groups.get(userId)?.viewable ?? [];
  const sequence = current ? chapter(current.user.id) : [];
  // Developed without a photo to load (or it couldn't develop): only the pixels, so it counts as shown.
  const isShown = (drop: HomeDrop) => shown.has(drop.id) || (!!drop.developed_at && !dropPhotoUrl(drop));
  const paused =
    holding || composing || menuOpen || footerOverlay || reporting || confirmDialog != null || turn != null || phase !== 'open' || !current || !isShown(current);

  /** Where the next (or previous) person's story opens, skipping anyone with nothing to open. */
  const chapterNeighbor = (step: 1 | -1): string | null => {
    if (!current) return null;
    for (let i = order.indexOf(current.user.id) + step; i >= 0 && i < order.length; i += step) {
      const start = groups.get(order[i])?.start;
      if (start) return start.id;
    }
    return null;
  };

  const go = (id: string) => {
    setPlayed(new Set());
    setCurrentId(id);
    setProgressKey((k) => k + 1);
  };

  // ── Opening and closing: the card zooms out of its tile and back in ─────────────────────────────

  /** The card cropped onto `drop`'s tile, measured with any drag transform set aside; null for a plain fade. */
  const collapsed = (drop: HomeDrop | null) => {
    const card = cardRef.current;
    const photo = photoRef.current;
    const tile = drop ? sourceFor(drop) : null;
    if (!card || !photo || !tile || prefersReducedMotion()) return null;
    const tileBox = box(tile);
    if (!intersectsViewport(tileBox, { width: window.innerWidth, height: window.innerHeight })) return null;
    const dragged = card.style.transform;
    card.style.transform = 'none';
    const target = collapsedOnto(box(card), box(photo), tileBox);
    card.style.transform = dragged;
    return target;
  };

  // The portal mounts its content a commit after the viewer, so this opens on the first commit the
  // card exists in (still before it paints).
  const opened = useRef(false);
  useLayoutEffect(() => {
    const card = cardRef.current;
    const backdrop = backdropRef.current;
    if (opened.current || !card || !backdrop) return;
    opened.current = true;
    const from = collapsed(current);
    const animations = [
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ZOOM.duration, easing: 'linear', fill: 'forwards' }),
      ...(from
        ? [
            card.animate([from, PRESENTED], { duration: ZOOM.duration, easing: ZOOM.easing, fill: 'forwards' }),
            card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CROSS_FADE_IN_MS, easing: 'ease-out', fill: 'forwards' }),
          ]
        : [card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ZOOM.duration, easing: 'ease-out', fill: 'forwards' })]),
    ];
    // Landed: drop the open's own animations (never a close that started meanwhile).
    void Promise.all(animations.map((a) => a.finished)).then(
      () => {
        animations.forEach((a) => a.cancel());
        setPhase((p) => (p === 'opening' ? 'open' : p));
      },
      () => {},
    );
  });

  /** Zooms back into the tile (or fades), then `after` (the parent unmounts the viewer). */
  const close = (after?: () => void) => {
    const card = cardRef.current;
    const backdrop = backdropRef.current;
    if (phase === 'closing' || !card || !backdrop) return;
    setPhase('closing');
    (document.activeElement as HTMLElement | null)?.blur();
    const to = collapsed(current);
    const done = () => {
      onClose();
      after?.();
    };
    const fadeOut = (delay: number, duration: number) =>
      card.animate([{ opacity: 1 }, { opacity: 0 }], { delay, duration, easing: 'ease-in-out', fill: 'forwards' }).finished.then(done, done);
    backdrop.animate([{ opacity: Number(getComputedStyle(backdrop).opacity) }, { opacity: 0 }], {
      duration: ZOOM.duration,
      easing: 'linear',
      fill: 'forwards',
    });
    if (to) {
      card.animate([{ transform: card.style.transform || PRESENTED.transform, clipPath: PRESENTED.clipPath }, to], {
        duration: ZOOM.duration,
        easing: ZOOM.easing,
        fill: 'forwards',
      });
      void fadeOut(ZOOM_SETTLED_MS, CROSS_FADE_MS);
    } else {
      void fadeOut(0, 160);
    }
  };

  // ── The cube between people ─────────────────────────────────────────────────────────────────────

  const setTurnState = (next: Turn | null) => {
    turnRef.current = next;
    setTurn(next);
  };

  const styleFaces = (t: number) => {
    const active = turnRef.current;
    if (!active) return;
    const out = faces.current.get(currentId);
    const incoming = active.toId ? faces.current.get(active.toId) : null;
    if (out) Object.assign(out.style, cubeFace('out', active.step, t));
    if (incoming) Object.assign(incoming.style, cubeFace('in', active.step, t));
  };

  /** Runs the turn from `from` to `to` (1 finishes it, 0 springs back), then settles the pages. */
  const animateTurn = (from: number, to: 0 | 1) => {
    const active = turnRef.current;
    if (!active) return;
    turning.current = true;
    const out = faces.current.get(currentId);
    const incoming = active.toId ? faces.current.get(active.toId) : null;
    const timing = { duration: CUBE.duration * Math.max(0.4, Math.abs(to - from)), easing: CUBE.easing, fill: 'forwards' as const };
    const animations = [
      out?.animate([cubeFace('out', active.step, from), cubeFace('out', active.step, to)], timing),
      incoming?.animate([cubeFace('in', active.step, from), cubeFace('in', active.step, to)], timing),
    ].filter((a): a is Animation => a != null);
    void Promise.all(animations.map((a) => a.finished)).then(
      () => {
        // One synchronous task: no frame shows the pages between states.
        if (out) Object.assign(out.style, { transform: '', transformOrigin: '' });
        flushSync(() => {
          if (to === 1 && active.toId) go(active.toId);
          setTurnState(null);
        });
        animations.forEach((a) => a.cancel());
        turning.current = false;
      },
      () => {
        turning.current = false;
      },
    );
  };

  /** Turns to the next (or previous) person; past the last one the story closes, before the first it restarts. */
  const jumpChapter = (step: 1 | -1) => {
    const neighbor = chapterNeighbor(step);
    if (!neighbor) {
      if (step > 0) close();
      else setProgressKey((k) => k + 1);
      return;
    }
    if (prefersReducedMotion()) return go(neighbor);
    setTurnState({ step, toId: neighbor });
    pendingAutoTurn.current = true;
  };
  // The incoming face exists once this commit lands; then it turns in.
  useLayoutEffect(() => {
    if (!turn || !pendingAutoTurn.current) return;
    pendingAutoTurn.current = false;
    animateTurn(0, 1);
  });

  /** Through this person's drops, then on into the next (or back into the previous) person's. */
  const advance = (step: 1 | -1) => {
    if (turning.current || phase !== 'open' || !current) return;
    const index = sequence.findIndex((d) => d.id === current.id);
    if (index < 0) return close();
    const next = sequence[index + step];
    if (next) go(next.id);
    else jumpChapter(step);
  };

  // ── The current drop: develop it, fill its reactions, fetch what's next ─────────────────────────

  const state = current ? dropState(current, nowMs) : null;
  const needsReactions = state === 'developed' && current?.reactions == null;
  useEffect(() => {
    if (!current) return;
    if (state === 'ready') {
      const drop = current;
      const unblock = () => setShown((s) => new Set(s).add(drop.id));
      developSharedDrop(drop.id).then(
        (result) => {
          if (result?.status === 'developed') {
            if (!prefersReducedMotion()) setPlayed((p) => new Set(p).add(drop.id));
            onPatch(drop.id, { developed_at: result.developed_at, original_url: result.url ?? drop.original_url });
          } else {
            toast(result ? 'Not ready yet. It develops soon.' : 'This drop isn’t available anymore.');
            unblock();
          }
        },
        (error: unknown) => {
          toast.error(error instanceof Error ? error.message : 'Couldn’t develop this drop.');
          unblock();
        },
      );
    }
    if (needsReactions) {
      loadDropReactions(current.id).then(
        (reactions) => onPatch(current.id, { reactions }),
        () => {},
      );
    }
    // The next two photos (into the next person's) and the previous person's, loaded ahead.
    const byId = (id: string | null) => drops.filter((d) => d.id === id);
    const next = [...sequence.slice(sequence.findIndex((d) => d.id === current.id) + 1), ...byId(chapterNeighbor(1))].slice(0, 2);
    for (const drop of [...next, ...byId(chapterNeighbor(-1))]) {
      const url = dropPhotoUrl(drop);
      if (url && !prefetched.current.has(url)) {
        prefetched.current.add(url);
        new Image().src = url;
      }
    }
    // Keyed by what changes the work: the drop, its develop state, and whether reactions are here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, state, needsReactions]);

  useEffect(() => {
    if (!current && phase !== 'closing') onClose();
  }, [current, phase, onClose]);

  // ── Gestures ────────────────────────────────────────────────────────────────────────────────────

  const width = () => cardRef.current?.clientWidth || window.innerWidth;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (phase !== 'open' || turning.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const now = e.timeStamp;
    gesture.current = { x0: e.clientX, y0: e.clientY, t0: now, axis: null, x: e.clientX, y: e.clientY, t: now, vx: 0, vy: 0 };
    setHolding(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const now = e.timeStamp;
    const dt = Math.max(1, now - g.t);
    g.vx = (e.clientX - g.x) / dt;
    g.vy = (e.clientY - g.y) / dt;
    g.x = e.clientX;
    g.y = e.clientY;
    g.t = now;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10 && !composing) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : dy > 0 ? 'y' : null;
    if (g.axis === 'x') {
      const step: 1 | -1 = dx < 0 ? 1 : -1;
      if (turnRef.current?.step !== step) {
        const out = faces.current.get(currentId);
        if (out) Object.assign(out.style, { transform: '', transformOrigin: '' });
        flushSync(() => setTurnState({ step, toId: chapterNeighbor(step) }));
      }
      // Past the first or last person there's no face to turn to: the page only gives a little.
      const t = Math.min(1, Math.abs(dx) / width()) / (turnRef.current?.toId ? 1 : 4);
      styleFaces(t);
    } else if (g.axis === 'y' && cardRef.current && backdropRef.current) {
      const drag = dismissDrag(dy);
      cardRef.current.style.transform = drag.transform;
      backdropRef.current.style.opacity = String(drag.backdrop);
    }
  };

  const endGesture = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    setHolding(false);
    if (!g) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.axis === 'x') {
      const active = turnRef.current;
      if (!active) return;
      const toward = -active.step;
      const t = Math.min(1, Math.abs(dx) / width()) / (active.toId ? 1 : 4);
      const far = !cancelled && (dx * toward > width() / 3 || g.vx * toward > 0.6);
      if (far && active.toId) return animateTurn(t, 1);
      if (far && active.step > 0) {
        animateTurn(t, 0);
        return close();
      }
      return animateTurn(t, 0);
    }
    if (g.axis === 'y') {
      const card = cardRef.current;
      const backdrop = backdropRef.current;
      if (!cancelled && (dy > 140 || g.vy > 0.8)) return close();
      if (!card || !backdrop) return;
      const from = card.style.transform;
      card.style.transform = '';
      backdrop.style.opacity = '';
      card.animate([{ transform: from }, { transform: PRESENTED.transform }], { duration: 240, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
      return;
    }
    if (cancelled || e.timeStamp - g.t0 > TAP_MS || Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) return;
    if (composing) return (document.activeElement as HTMLElement | null)?.blur();
    const zone = e.currentTarget.getBoundingClientRect();
    advance(e.clientX - zone.left < zone.width / 3 ? -1 : 1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keys from menus and dialogs portaled out of the story bubble here through React; leave them be.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowRight') advance(1);
    else if (e.key === 'ArrowLeft') advance(-1);
    else return;
    e.preventDefault();
  };

  // ── Actions ─────────────────────────────────────────────────────────────────────────────────────

  const onDelete = async () => {
    const drop = current;
    if (!drop) return;
    const ok = await confirm({
      title: 'Delete this drop?',
      message: 'It’s removed for everyone it was shared with.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep It',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteSharedDrop(drop.id);
      close(() => onRemove(drop.id));
    } catch (error) {
      toast.error(`Couldn’t delete it. ${error instanceof Error ? error.message : ''}`.trim());
    }
  };

  const report = async (reason: string) => {
    const drop = current;
    setReporting(false);
    if (!drop) return;
    try {
      await reportSharedDrop(drop.id, reason);
      toast('Thanks. The Click team will take a look.');
    } catch (error) {
      toast.error(`Couldn’t send the report. ${error instanceof Error ? error.message : ''}`.trim());
    }
  };

  if (!current) return null;

  const pages = [{ drop: current, live: true }];
  const incoming = turn?.toId ? drops.find((d) => d.id === turn.toId) : null;
  if (incoming) pages.unshift({ drop: incoming, live: false });

  return (
    <RadixDialog.Root open modal>
      <RadixDialog.Portal>
        <RadixDialog.Content
          ref={contentRef}
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            contentRef.current?.querySelector<HTMLElement>('[data-story-close]')?.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            const active = document.activeElement;
            if (active instanceof HTMLTextAreaElement) active.blur();
            else close();
          }}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-[70] outline-none"
          data-testid="drop-story"
        >
          <RadixDialog.Title className="sr-only">{current.is_mine ? 'Your drops' : `Drops from ${current.user.name}`}</RadixDialog.Title>
          <div ref={backdropRef} className="absolute inset-0 bg-black" aria-hidden />
          <div
            ref={cardRef}
            className="relative mx-auto h-full w-full max-w-[520px] origin-center overflow-hidden bg-black [perspective:1200px]"
          >
            {pages.map(({ drop, live }) => (
              <DropStoryPage
                key={drop.id}
                faceRef={(el) => {
                  if (el) faces.current.set(drop.id, el);
                  else faces.current.delete(drop.id);
                }}
                style={live || !turn ? undefined : cubeFace('in', turn.step, 0)}
                drop={drop}
                live={live}
                nowMs={nowMs}
                chapterIds={chapter(drop.user.id).map((d) => d.id)}
                paused={paused}
                progressKey={progressKey}
                onProgressEnd={() => advance(1)}
                plays={live && played.has(drop.id)}
                shown={isShown(drop)}
                onShown={(id) => setShown((s) => (s.has(id) ? s : new Set(s).add(id)))}
                photoRef={live ? photoRef : undefined}
                zone={
                  live
                    ? {
                        onPointerDown,
                        onPointerMove,
                        onPointerUp: (e) => endGesture(e, false),
                        onPointerCancel: (e) => endGesture(e, true),
                      }
                    : undefined
                }
                onClose={() => close()}
                onDelete={() => void onDelete()}
                onReport={() => setReporting(true)}
                onMenuOpenChange={setMenuOpen}
                footer={
                  <DropStoryFooter
                    key={drop.id}
                    drop={drop}
                    live={live}
                    shown={isShown(drop)}
                    viewerId={viewerId}
                    onReactions={(reactions) => onPatch(drop.id, { reactions })}
                    onComposingChange={setComposing}
                    onOverlayChange={setFooterOverlay}
                  />
                }
              />
            ))}
          </div>

          <Dialog
            open={reporting}
            onOpenChange={setReporting}
            title="Report this photo?"
            description="Reports go quietly to the Click team. Nobody else sees them."
          >
            <div className="flex flex-col gap-2">
              {REPORT_REASONS.map((reason) => (
                <Button key={reason} variant="secondary" fullWidth onClick={() => void report(reason)}>
                  {reason}
                </Button>
              ))}
            </div>
          </Dialog>
          {confirmDialog}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
