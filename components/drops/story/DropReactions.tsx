'use client';

import { useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import { Avatar } from '@/components/ds/Avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ds/Popover';
import { EmojiPopover } from '@/components/chat/EmojiPopover';
import { cn } from '@/lib/cn';
import { REACTION_EMOJI } from '@/lib/drops/reactionPalette';
import type { DropReactions } from '@/lib/home/types';

type Reaction = DropReactions['reactions'][number];

const firstName = (name: string) => name.split(' ')[0] || name;

/**
 * The quick palette as one glass tray of plain emoji (iOS `ReactionTray`): tap to react, tap again
 * to take it back; "+" picks any other emoji, which then takes the last slot. Your pick sits on a
 * tinted disc and pops when chosen.
 */
export function ReactionTray({
  mine,
  disabled,
  onPick,
  onPickerOpenChange,
}: {
  mine: string | null;
  /** Shown but not tappable (a drop still developing). */
  disabled: boolean;
  onPick: (emoji: string | null) => void;
  onPickerOpenChange: (open: boolean) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [popped, setPopped] = useState<string | null>(null);
  const custom = mine && !(REACTION_EMOJI as readonly string[]).includes(mine) ? mine : null;
  const pick = (emoji: string | null) => {
    setPopped(emoji);
    onPick(emoji);
  };
  const setPickerOpen = (open: boolean) => {
    setPicking(open);
    onPickerOpenChange(open);
  };
  const slot = (emoji: string) => {
    const chosen = mine === emoji;
    return (
      <button
        key={emoji}
        type="button"
        onClick={() => pick(chosen ? null : emoji)}
        aria-pressed={chosen}
        aria-label={`React ${emoji}`}
        className="flex h-full min-w-0 flex-1 items-center justify-center"
      >
        <span
          onAnimationEnd={() => setPopped(null)}
          className={cn(
            'flex size-10 items-center justify-center rounded-full text-[26px] leading-none transition-[transform,background-color,box-shadow] duration-[var(--d-fast)] ease-[var(--ease)]',
            chosen &&
              'scale-110 bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--accent)_80%,transparent)]',
            popped === emoji && 'reaction-pop',
          )}
        >
          {emoji}
        </span>
      </button>
    );
  };
  return (
    <div
      className={cn('material-glass-dark flex h-[50px] items-center rounded-pill px-1', disabled && 'pointer-events-none')}
      aria-disabled={disabled || undefined}
    >
      {REACTION_EMOJI.map(slot)}
      {custom ? (
        slot(custom)
      ) : (
        <EmojiPopover open={picking} onOpenChange={setPickerOpen} onSelect={(emoji) => pick(emoji)}>
          <button type="button" aria-label="More emoji" className="flex h-full min-w-0 flex-1 items-center justify-center text-white/70">
            <Plus size={20} strokeWidth={2.25} aria-hidden />
          </button>
        </EmojiPopover>
      )}
    </div>
  );
}

/** Who else reacted, as a few overlapping faces with their emoji; opens the full list. */
export function ReactorFaces({ reactions, onOpenChange }: { reactions: Reaction[]; onOpenChange: (open: boolean) => void }) {
  const emoji = [...new Set(reactions.map((r) => r.emoji))].slice(0, 3).join('');
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Reactions: ${reactions.map((r) => `${r.name} ${r.emoji}`).join(', ')}`}
          className="press material-glass-dark flex h-[38px] shrink-0 items-center gap-1.5 rounded-pill pl-1 pr-2.5"
        >
          <span className="flex -space-x-2.5">
            {reactions.slice(0, 3).map((r) => (
              <Avatar key={r.user_id} seed={r.user_id} name={r.name} src={r.avatar_url} size={32} ringColor="rgba(0,0,0,0.35)" />
            ))}
          </span>
          <span className="text-[15px] leading-none">{emoji}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="max-h-[min(360px,60dvh)] w-[min(300px,calc(100vw-24px))] overflow-y-auto p-1.5">
        <ul aria-label="Who reacted">
          {reactions.map((r) => (
            <li key={r.user_id} className="flex min-h-11 items-center gap-3 px-2">
              <Avatar seed={r.user_id} name={r.name} src={r.avatar_url} size={32} />
              <span className="type-body min-w-0 flex-1 truncate">{r.name}</span>
              <span className="text-xl leading-none" aria-label={`reacted ${r.emoji}`}>
                {r.emoji}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Your own drop: everyone who reacted, a face with their emoji pinned to it, like a story's viewers. */
export function ReactorList({ reactions }: { reactions: Reaction[] | null }) {
  if (!reactions?.length) {
    return (
      <p className={cn('type-meta flex items-center gap-1.5 text-white/70', !reactions && 'invisible')}>
        <Heart size={14} aria-hidden />
        No reactions yet
      </p>
    );
  }
  return (
    <ul className="no-scrollbar -mx-1 flex gap-3.5 overflow-x-auto px-1 py-0.5" aria-label="Who reacted">
      {reactions.map((r) => (
        <li key={r.user_id} className="flex w-[52px] shrink-0 flex-col items-center gap-1.5" aria-label={`${r.name} ${r.emoji}`}>
          <span className="relative">
            <Avatar seed={r.user_id} name={r.name} src={r.avatar_url} size={40} ringColor="transparent" />
            <span aria-hidden className="absolute -bottom-1 -right-1.5 text-[17px] leading-none">
              {r.emoji}
            </span>
          </span>
          <span aria-hidden className="type-meta w-full truncate text-center font-semibold text-white/70">
            {firstName(r.name)}
          </span>
        </li>
      ))}
    </ul>
  );
}
