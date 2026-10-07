'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Hourglass, ImagePlus, Layers, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ds/Avatar';
import { CardVisual } from '@/components/ds/CardVisual';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { StatusPill } from '@/components/ds/StatusPill';
import { DropStoryViewer } from '@/components/drops/story/DropStoryViewer';
import { dropPhotoUrl, dropState, groupSharedDrops, type SharedDropGroup } from '@/lib/drops/sharedDropGroups';
import { formatTimeLeft } from '@/lib/home/format';
import type { HomeDrop } from '@/lib/home/types';
import { revealImage } from '@/lib/ui/revealImage';
import { AddDropSheet } from './AddDropSheet';

/** Countdowns tick at least this often while anything is still developing. */
const TICK_MS = 60_000;

function tileLabel(group: SharedDropGroup, nowMs: number): string {
  const drop = group.cover;
  const who = `${drop.is_mine ? 'Your drops' : `Drops from ${drop.user.name}`}${group.drops.length > 1 ? `, ${group.drops.length} drops` : ''}`;
  if (group.hasUnwatched) return `${who}, ready to develop. Opens them.`;
  if (!group.start) return `${who}, develops in ${formatTimeLeft(Date.parse(drop.reveal_at), nowMs)}`;
  return `${who}. Opens them.`;
}

/**
 * ③ Drops (iOS `SharedDropsStrip`): one 104×140 tile per person, Instagram-style, showing the drop
 * their story opens on, with a ring while any is ready to develop and how many they shared. A tile
 * zooms open into the story, which plays their drops and carries on to the next person.
 */
export function DropsStrip({ items, nowMs }: { items: HomeDrop[]; nowMs: number }) {
  const [drops, setDrops] = useState(items);
  // A fresh list from the server (after sharing a drop) replaces the local one.
  const [source, setSource] = useState(items);
  if (items !== source) {
    setSource(items);
    setDrops(items);
  }
  const [now, setNow] = useState(nowMs);
  const [viewing, setViewing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const tiles = useRef(new Map<string, HTMLElement>());
  const groups = groupSharedDrops(drops, now);

  // Live develop: a countdown that reaches zero turns its tile ready; countdowns stay current.
  const nextReveal = Math.min(...drops.map((d) => Date.parse(d.reveal_at)).filter((t) => t > now));
  useEffect(() => {
    if (!Number.isFinite(nextReveal)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(TICK_MS, Math.max(0, nextReveal - Date.now()) + 500));
    return () => window.clearTimeout(timer);
  }, [nextReveal, now]);


  return (
    <section aria-labelledby="home-drops">
      <SectionHeader id="home-drops" title="Drops" />
      <ul className="-mx-[var(--gutter)] flex snap-x gap-3 overflow-x-auto px-[var(--gutter)] pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
        <li className="shrink-0 snap-start">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="press group type-meta flex h-[140px] w-[104px] flex-col items-center justify-center gap-2.5 rounded-lg bg-surface-raised font-semibold text-fg-secondary"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-action text-white transition-transform duration-[var(--d-fast)] group-hover:scale-105">
              <ImagePlus size={20} strokeWidth={2} aria-hidden />
            </span>
            Add a drop
          </button>
        </li>
        {groups.map((group) => {
          const drop = group.cover;
          const state = dropState(drop, now);
          const photo = dropPhotoUrl(drop);
          const name = drop.is_mine ? 'You' : drop.user.name.split(' ')[0];
          return (
            <li key={group.userId} className="shrink-0 snap-start">
              <button
                ref={(el) => {
                  if (el) tiles.current.set(group.userId, el);
                  else tiles.current.delete(group.userId);
                }}
                type="button"
                onClick={() => group.start && setViewing(group.start.id)}
                disabled={!group.start}
                aria-label={tileLabel(group, now)}
                className={cn(
                  'press relative block h-[140px] w-[104px] overflow-hidden rounded-lg bg-fill-subtle disabled:cursor-default',
                  group.hasUnwatched && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
                )}
              >
                {drop.preview_url ? (
                  <Image
                    src={drop.preview_url}
                    alt=""
                    fill
                    sizes="104px"
                    unoptimized
                    onLoad={revealImage}
                    className="img-reveal object-cover [image-rendering:pixelated]"
                  />
                ) : photo ? null : (
                  <CardVisual seed={`drop:${drop.id}`} radius="lg" className="absolute inset-0" />
                )}
                {photo ? (
                  <Image src={photo} alt="" fill sizes="104px" unoptimized onLoad={revealImage} className="img-reveal object-cover" />
                ) : null}
                {group.drops.length > 1 ? (
                  <StatusPill variant="on-media" icon={Layers} className="absolute left-1.5 top-1.5 tabular-nums">
                    {group.drops.length}
                  </StatusPill>
                ) : null}
                {state === 'pending' ? (
                  <StatusPill variant="on-media" icon={Hourglass} className="absolute right-1.5 top-1.5 tabular-nums">
                    {formatTimeLeft(Date.parse(drop.reveal_at), now)}
                  </StatusPill>
                ) : group.hasUnwatched ? (
                  <StatusPill variant="on-media" icon={Sparkles} className="absolute right-1.5 top-1.5">
                    Ready
                  </StatusPill>
                ) : null}
                <span className="material-glass-dark absolute bottom-2 left-2 flex max-w-[calc(100%-16px)] items-center gap-1 rounded-pill py-0.5 pl-0.5 pr-2">
                  <Avatar seed={drop.user.id} name={drop.user.name} src={drop.user.avatar_url} size={20} ringColor="transparent" />
                  <span className="type-badge truncate">{name}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {viewing ? (
        <DropStoryViewer
          drops={drops}
          startId={viewing}
          nowMs={now}
          sourceFor={(drop) => tiles.current.get(drop.user.id) ?? null}
          onPatch={(id, patch) => setDrops((all) => all.map((d) => (d.id === id ? { ...d, ...patch } : d)))}
          onRemove={(id) => setDrops((all) => all.filter((d) => d.id !== id))}
          onClose={() => setViewing(null)}
        />
      ) : null}

      <AddDropSheet open={adding} onOpenChange={setAdding} />
    </section>
  );
}
