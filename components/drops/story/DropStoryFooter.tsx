'use client';

import { useState, type KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { toast } from '@/components/ds/Toast';
import { cn } from '@/lib/cn';
import { reactToDrop, sendDropReply } from '@/lib/drops/sharedDropActions';
import type { DropReactions, HomeDrop } from '@/lib/home/types';
import { ReactionTray, ReactorFaces, ReactorList } from './DropReactions';

const EMPTY: DropReactions = { mine: null, reactions: [], is_owner: false };

const firstName = (drop: HomeDrop) => drop.user.name.split(' ')[0] || drop.user.name;

/**
 * Under the photo (iOS story footer): your own drop shows who reacted; anyone else's has the
 * reaction palette over a reply field, and the faces of who else reacted. Replies and reactions go
 * to your chat with the poster, carrying the drop. Every page reserves the same height, so the
 * photo above sits in one place from drop to drop.
 */
export function DropStoryFooter({
  drop,
  live,
  shown,
  viewerId,
  onReactions,
  onComposingChange,
  onOverlayChange,
}: {
  drop: HomeDrop;
  /** Only the current page takes input; the incoming one during a turn is a still copy. */
  live: boolean;
  /** The photo is on screen (nothing to react to before then). */
  shown: boolean;
  viewerId: string | null;
  onReactions: (reactions: DropReactions) => void;
  onComposingChange: (composing: boolean) => void;
  /** The emoji picker or the list of who reacted is up: the story holds still. */
  onOverlayChange: (open: boolean) => void;
}) {
  const [reply, setReply] = useState('');
  const [composing, setComposing] = useState(false);
  const reactions = drop.reactions;
  const trimmed = reply.trim();
  const canReply = !drop.is_mine && drop.connection_id != null && viewerId != null;

  const setFocused = (focused: boolean) => {
    setComposing(focused);
    onComposingChange(focused);
  };

  const send = (text: string, reaction: boolean) => {
    if (!viewerId) return;
    sendDropReply(drop, viewerId, text, reaction).then(
      () => toast(reaction ? `Reaction sent to ${firstName(drop)}` : `Sent to ${firstName(drop)}`),
      (error: unknown) => toast.error(error instanceof Error ? error.message : 'Couldn’t send it. Try again.'),
    );
  };

  const react = async (emoji: string | null) => {
    const previous = reactions ?? EMPTY;
    onReactions({ ...previous, mine: emoji });
    try {
      onReactions(await reactToDrop(drop.id, emoji));
      if (emoji && canReply) send(emoji, true);
    } catch (error) {
      onReactions(previous);
      toast.error(error instanceof Error ? error.message : 'Couldn’t react. Try again.');
    }
  };

  const sendReply = () => {
    if (!trimmed) return;
    setReply('');
    send(trimmed, false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendReply();
    }
  };

  // Never yours: the server lists everyone else.
  const others = reactions?.reactions ?? [];

  return (
    <div className="flex min-h-[110px] flex-col justify-end gap-3" inert={!live || undefined}>
      {drop.is_mine ? (
        <ReactorList reactions={reactions ? others : null} />
      ) : (
        <>
          <div
            className={cn('transition-opacity duration-200 ease-in-out', composing && 'pointer-events-none opacity-0')}
            aria-hidden={composing || undefined}
          >
            <ReactionTray
              mine={reactions?.mine ?? null}
              disabled={!shown}
              onPick={(emoji) => void react(emoji)}
              onPickerOpenChange={onOverlayChange}
            />
          </div>
          {canReply || others.length > 0 ? (
            <div className="flex items-end gap-2.5">
              {canReply ? (
                <label className="flex min-w-0 flex-1 items-end gap-2.5">
                  <span className="sr-only">Reply to {drop.user.name}</span>
                  <textarea
                    value={live ? reply : ''}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={onKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    rows={1}
                    enterKeyHint="send"
                    placeholder={`Reply to ${firstName(drop)}…`}
                    className="type-body max-h-[6.5rem] min-h-11 min-w-0 flex-1 resize-none rounded-[22px] border border-white/55 bg-transparent px-4 py-[10px] text-white outline-none [field-sizing:content] placeholder:text-white/60 focus-visible:border-white pointer-coarse:text-[16px]"
                  />
                  {trimmed ? (
                    <button
                      type="button"
                      onClick={sendReply}
                      aria-label="Send reply"
                      className="press ds-scale-in flex size-11 shrink-0 items-center justify-center rounded-full bg-action text-on-action"
                    >
                      <ArrowUp size={20} strokeWidth={2.5} aria-hidden />
                    </button>
                  ) : null}
                </label>
              ) : null}
              {others.length > 0 && !composing ? <ReactorFaces reactions={others} onOpenChange={onOverlayChange} /> : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
