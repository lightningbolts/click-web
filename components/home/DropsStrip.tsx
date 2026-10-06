'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Hourglass, ImagePlus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar } from '@/components/ds/Avatar';
import { CardVisual } from '@/components/ds/CardVisual';
import { Button } from '@/components/ds/Button';
import { Dialog } from '@/components/ds/Dialog';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { StatusPill } from '@/components/ds/StatusPill';
import { toast } from '@/components/ds/Toast';
import { dropDevelopState } from '@/lib/drops/developState';
import { formatRelativeShort, formatTimeLeft } from '@/lib/home/format';
import { postHomeAction } from '@/lib/home/postHomeAction';
import type { HomeDrop } from '@/lib/home/types';
import { threadHref } from '@/lib/shell/appNav';
import { AddDropSheet } from './AddDropSheet';

type DevelopResponse = {
  drops: ({ id: string; status: 'developed'; developed_at: string; url: string | null } | { id: string; status: 'pending' | 'not_found' })[];
};

/** ③ Drops: 104×140 tiles; a ring marks ones ready to develop. */
export function DropsStrip({ items, nowMs }: { items: HomeDrop[]; nowMs: number }) {
  const [drops, setDrops] = useState(items);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [developing, setDeveloping] = useState<string | null>(null);
  const open = drops.find((d) => d.id === openId) ?? null;
  const openSrc = open ? ((open.developed_at || open.is_mine ? open.original_url : null) ?? open.preview_url) : null;

  const onOpen = async (drop: HomeDrop) => {
    const state = dropDevelopState(Date.parse(drop.reveal_at), drop.developed_at, nowMs);
    if (state !== 'ready' || drop.is_mine) {
      setOpenId(drop.id);
      return;
    }
    setDeveloping(drop.id);
    try {
      const res = await postHomeAction<DevelopResponse>('/api/drops/develop', { drops: [{ kind: 'shared', id: drop.id }] });
      const result = res.drops[0];
      if (result?.status === 'developed') {
        setDrops((all) =>
          all.map((d) => (d.id === drop.id ? { ...d, developed_at: result.developed_at, original_url: result.url ?? d.original_url } : d)),
        );
      }
      setOpenId(drop.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t develop this drop.');
    } finally {
      setDeveloping(null);
    }
  };

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
        {drops.map((drop) => {
          const state = dropDevelopState(Date.parse(drop.reveal_at), drop.developed_at, nowMs);
          const ready = state === 'ready' && !drop.is_mine;
          const src = state === 'developed' || drop.is_mine ? (drop.original_url ?? drop.preview_url) : drop.preview_url;
          const name = drop.is_mine ? 'You' : drop.user.name.split(' ')[0];
          return (
            <li key={drop.id} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => void onOpen(drop)}
                disabled={developing === drop.id}
                aria-label={`${drop.is_mine ? 'Your drop' : `Drop from ${drop.user.name}`}${ready ? ', ready to develop' : state === 'pending' ? ', developing' : ''}`}
                className={cn(
                  'press relative block h-[140px] w-[104px] overflow-hidden rounded-lg bg-fill-subtle',
                  ready && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
                  developing === drop.id && 'animate-pulse',
                )}
              >
                {src ? (
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="104px"
                    unoptimized
                    className={cn('object-cover', src === drop.preview_url && '[image-rendering:pixelated]')}
                  />
                ) : (
                  <CardVisual seed={`drop:${drop.id}`} radius="lg" className="absolute inset-0" />
                )}
                <span className="material-glass-dark absolute bottom-2 left-2 flex max-w-[calc(100%-16px)] items-center gap-1 rounded-pill py-0.5 pl-0.5 pr-2">
                  <Avatar seed={drop.user.id} name={drop.user.name} src={drop.user.avatar_url} size={20} ringColor="transparent" />
                  <span className="type-badge truncate">{name}</span>
                </span>
                {state === 'pending' ? (
                  <StatusPill variant="on-media" icon={Hourglass} className="absolute right-2 top-2">
                    {formatTimeLeft(Date.parse(drop.reveal_at), nowMs)}
                  </StatusPill>
                ) : ready ? (
                  <StatusPill variant="on-media" icon={Sparkles} className="absolute right-2 top-2">
                    Ready
                  </StatusPill>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={open !== null}
        onOpenChange={(next) => !next && setOpenId(null)}
        title={open ? (open.is_mine ? 'Your drop' : open.user.name) : ''}
        description={open ? formatRelativeShort(open.created_at, nowMs) : undefined}
        footer={
          open && !open.is_mine && open.connection_id ? (
            <Button href={threadHref(open.connection_id)} variant="tinted" fullWidth>
              Reply
            </Button>
          ) : undefined
        }
      >
        {open ? (
          <div className="flex flex-col gap-3">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-fill-subtle">
              {openSrc ? (
                <Image
                  src={openSrc}
                  alt={open.caption ?? 'Drop'}
                  fill
                  sizes="(min-width: 768px) 560px, 100vw"
                  unoptimized
                  className={cn('object-cover', openSrc === open.preview_url && '[image-rendering:pixelated]')}
                />
              ) : null}
            </div>
            {dropDevelopState(Date.parse(open.reveal_at), open.developed_at, nowMs) === 'pending' && !open.is_mine ? (
              <p className="type-body text-fg-secondary">
                Develops in {formatTimeLeft(Date.parse(open.reveal_at), nowMs)}.
              </p>
            ) : null}
            {open.caption ? <p className="type-body text-fg">{open.caption}</p> : null}
          </div>
        ) : null}
      </Dialog>

      <AddDropSheet open={adding} onOpenChange={setAdding} />
    </section>
  );
}
