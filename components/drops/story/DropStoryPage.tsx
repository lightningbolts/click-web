'use client';

import Image from 'next/image';
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from 'react';
import { Flag, MoreHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ds/Menu';
import { DropDevelopImage } from '@/components/drops/DropDevelopImage';
import { cn } from '@/lib/cn';
import { dropPhotoUrl } from '@/lib/drops/sharedDropGroups';
import { formatRelativeShort } from '@/lib/home/format';
import type { HomeDrop } from '@/lib/home/types';
import { revealImage } from '@/lib/ui/revealImage';

/** Each drop stays up this long (iOS `secondsPerDrop`). */
export const STORY_DROP_MS = 6000;

const chromeButton =
  'press hit-44 inline-flex size-9 shrink-0 items-center justify-center rounded-full material-glass-dark text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

function subtitle(drop: HomeDrop, nowMs: number): string {
  const when = formatRelativeShort(drop.created_at, nowMs);
  if (!drop.is_mine || !drop.audience) return when;
  return `${when} · ${drop.audience === 'core' ? 'Core connections' : 'All connections'}`;
}

/** The drop's shape (width over height), so the frame is right before the photo loads. */
function aspect(drop: HomeDrop): number {
  return drop.width && drop.height ? drop.width / drop.height : 3 / 4;
}

/**
 * One drop in the story: progress for the person's drops, who shared it, the whole photo (never
 * cropped to the screen) between header and footer, and its caption. The live page runs the
 * clock; an incoming one (mid-turn) shows the same layout with its current segment empty.
 */
export function DropStoryPage({
  faceRef,
  drop,
  live,
  nowMs,
  chapterIds,
  paused,
  progressKey,
  onProgressEnd,
  plays,
  shown,
  onShown,
  photoRef,
  zone,
  onClose,
  onDelete,
  onReport,
  onMenuOpenChange,
  footer,
  style,
}: {
  faceRef?: Ref<HTMLDivElement>;
  drop: HomeDrop;
  live: boolean;
  nowMs: number;
  chapterIds: string[];
  paused: boolean;
  /** Bumped to restart the current segment. */
  progressKey: number;
  onProgressEnd: () => void;
  plays: boolean;
  shown: boolean;
  onShown: (id: string) => void;
  photoRef?: Ref<HTMLDivElement>;
  /** Tap, hold and drag handling over the photo (live page only). */
  zone?: HTMLAttributes<HTMLDivElement>;
  onClose: () => void;
  onDelete: () => void;
  onReport: () => void;
  onMenuOpenChange: (open: boolean) => void;
  footer: ReactNode;
  style?: CSSProperties;
}) {
  const index = chapterIds.indexOf(drop.id);
  const photo = dropPhotoUrl(drop);
  const ratio = aspect(drop);
  return (
    <div
      ref={faceRef}
      style={style}
      className="absolute inset-0 flex flex-col bg-black text-white [backface-visibility:hidden]"
      aria-hidden={!live || undefined}
      inert={!live || undefined}
    >
      <header className="flex flex-col gap-2.5 px-3 pt-[max(10px,env(safe-area-inset-top))]">
        <ol className="flex gap-1" aria-label={`Drop ${index + 1} of ${chapterIds.length}`}>
          {chapterIds.map((id, i) => (
            <li key={id} className="h-[3px] flex-1 overflow-hidden rounded-pill bg-white/30">
              <span
                key={i === index ? `${id}-${progressKey}` : undefined}
                className="block h-full origin-left rounded-pill bg-white"
                onAnimationEnd={i === index ? onProgressEnd : undefined}
                style={
                  i < index
                    ? undefined
                    : i === index && live
                      ? {
                          animation: `recap-progress ${STORY_DROP_MS}ms linear forwards`,
                          animationPlayState: paused ? 'paused' : 'running',
                        }
                      : { transform: 'scaleX(0)' }
                }
              />
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-2.5">
          <Avatar seed={drop.user.id} name={drop.user.name} src={drop.user.avatar_url} size={32} ringColor="transparent" />
          <div className="min-w-0 flex-1">
            <p className="type-body-strong truncate">{drop.is_mine ? 'Your drop' : drop.user.name}</p>
            <p className="type-meta truncate text-white/75">{subtitle(drop, nowMs)}</p>
          </div>
          <Menu onOpenChange={onMenuOpenChange}>
            <MenuTrigger asChild>
              <button type="button" className={chromeButton} aria-label="More">
                <MoreHorizontal size={18} aria-hidden />
              </button>
            </MenuTrigger>
            <MenuContent>
              {drop.is_mine ? (
                <MenuItem icon={Trash2} destructive onSelect={onDelete}>
                  Delete
                </MenuItem>
              ) : (
                <MenuItem icon={Flag} onSelect={onReport}>
                  Report
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
          <button type="button" className={chromeButton} aria-label="Close" onClick={onClose} data-story-close="">
            <X size={18} aria-hidden />
          </button>
        </div>
      </header>

      <div className={cn('relative min-h-0 flex-1 [container-type:size]', zone && 'touch-none select-none')} {...zone}>
        <div className="flex size-full items-center justify-center py-2">
          <div
            ref={photoRef}
            className="relative overflow-hidden rounded-[18px] bg-white/5"
            style={{
              width: `min(100cqw, calc((100cqh - 16px) * ${ratio}))`,
              aspectRatio: ratio,
            }}
          >
            {/* The pixels stay underneath while the photo develops over them. */}
            {drop.preview_url ? (
              <Image
                src={drop.preview_url}
                alt=""
                fill
                sizes="(min-width: 520px) 520px, 100vw"
                unoptimized
                onLoad={revealImage}
                className="img-reveal object-cover [image-rendering:pixelated]"
              />
            ) : null}
            {photo ? (
              <DropDevelopImage
                key={drop.id}
                src={photo}
                alt={drop.caption ?? (drop.is_mine ? 'Your drop' : `Drop from ${drop.user.name}`)}
                plays={plays}
                onShown={() => onShown(drop.id)}
              />
            ) : null}
            {shown && drop.caption ? (
              <p className="type-body-strong material-glass-dark absolute inset-x-3 bottom-3.5 mx-auto w-fit max-w-[calc(100%-24px)] rounded-[20px] px-3.5 py-2 text-center text-white">
                {drop.caption}
              </p>
            ) : null}
          </div>
        </div>
        {!shown ? (
          <span className="type-body-strong material-glass-dark pointer-events-none absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-pill px-3.5 py-2">
            <Sparkles size={16} aria-hidden />
            {drop.developed_at ? 'Opening…' : 'Developing…'}
          </span>
        ) : null}
      </div>

      <footer className="px-3.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">{footer}</footer>
    </div>
  );
}
