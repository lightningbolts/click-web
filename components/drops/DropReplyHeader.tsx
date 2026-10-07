'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { toast } from '@/components/ds/Toast';
import { DropStoryViewer } from '@/components/drops/story/DropStoryViewer';
import { cn } from '@/lib/cn';
import type { DropReplyMeta } from '@/lib/drops/dropReply';
import { developSharedDrop, loadSharedDropStrip } from '@/lib/drops/sharedDropActions';
import type { HomeDrop } from '@/lib/home/types';
import { revealImage } from '@/lib/ui/revealImage';

/**
 * Each drop's photo for this session, so scrolling a chat asks the server once per drop. Null:
 * deleted, or no longer shared with you. Develop is idempotent and signs the original afresh.
 */
const photos = new Map<string, Promise<string | null>>();

function dropPhoto(id: string): Promise<string | null> {
  let photo = photos.get(id);
  if (!photo) {
    photo = developSharedDrop(id).then(
      (result) => (result?.status === 'developed' ? result.url : null),
      (error: unknown) => {
        // A failed request isn't an answer: ask again next time.
        photos.delete(id);
        throw error;
      },
    );
    photos.set(id, photo);
  }
  return photo;
}

function label(reply: DropReplyMeta, mine: boolean): string {
  if (reply.reaction) return mine ? 'You reacted to their drop' : 'Reacted to your drop';
  return mine ? 'You replied to their drop' : 'Replied to your drop';
}

/**
 * The shared drop a chat message answers, story-reply style (iOS `DropReplyHeader`): who answered,
 * over the photo, with a reaction's emoji pinned to its corner. Opens the drop's story while it's
 * still in Drops; a deleted or expired drop shows as unavailable.
 */
export function DropReplyHeader({ reply, mine, emoji }: { reply: DropReplyMeta; mine: boolean; emoji: string | null }) {
  const [photo, setPhoto] = useState<{ id: string; url: string | null } | null>(null);
  const [story, setStory] = useState<{ drops: HomeDrop[]; nowMs: number } | null>(null);
  const [opening, setOpening] = useState(false);
  const thumb = useRef<HTMLButtonElement>(null);
  const resigned = useRef(false);
  const loaded = photo?.id === reply.id ? photo : null;
  const unavailable = loaded != null && loaded.url == null;

  useEffect(() => {
    let cancelled = false;
    dropPhoto(reply.id).then(
      (url) => !cancelled && setPhoto({ id: reply.id, url }),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [reply.id]);

  const open = async () => {
    if (opening || unavailable) return;
    setOpening(true);
    try {
      const drops = await loadSharedDropStrip();
      if (drops.some((d) => d.id === reply.id)) setStory({ drops, nowMs: Date.now() });
      else toast('This drop isn’t in Drops anymore.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t open the drop.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={cn('mb-1 flex flex-col gap-1.5', mine ? 'items-end' : 'items-start', emoji && 'pb-2.5')}>
      <span className="type-meta px-1 text-fg-secondary">{label(reply, mine)}</span>
      <button
        ref={thumb}
        type="button"
        onClick={() => void open()}
        disabled={unavailable}
        aria-label={`${label(reply, mine)}. Opens the drop.`}
        className={cn('press relative h-32 w-24 rounded-[14px] disabled:cursor-default', opening && 'ds-shimmer')}
      >
        <span className="absolute inset-0 overflow-hidden rounded-[14px] bg-fill-subtle">
          {loaded?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed original
            <img
              src={loaded.url}
              alt=""
              onLoad={revealImage}
              onError={() => {
                // The signed URL expired: sign it once more (a second failure means it's gone).
                photos.delete(reply.id);
                if (resigned.current) return setPhoto({ id: reply.id, url: null });
                resigned.current = true;
                dropPhoto(reply.id).then((url) => setPhoto({ id: reply.id, url }), () => {});
              }}
              className="img-reveal size-full object-cover"
            />
          ) : unavailable ? (
            <span className="type-badge flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-fg-secondary">
              <ImageOff size={18} aria-hidden />
              Drop no longer available
            </span>
          ) : (
            <span className="block size-full animate-pulse" aria-hidden />
          )}
        </span>
        {emoji ? (
          <span
            aria-hidden
            className={cn(
              'absolute -bottom-3 text-[40px] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]',
              mine ? '-left-3' : '-right-3',
            )}
          >
            {emoji}
          </span>
        ) : null}
      </button>
      {story ? (
        <DropStoryViewer
          drops={story.drops}
          startId={reply.id}
          nowMs={story.nowMs}
          sourceFor={(drop) => (drop.id === reply.id ? thumb.current : null)}
          onPatch={(id, patch) => setStory((s) => s && { ...s, drops: s.drops.map((d) => (d.id === id ? { ...d, ...patch } : d)) })}
          onRemove={(id) => setStory((s) => s && { ...s, drops: s.drops.filter((d) => d.id !== id) })}
          onClose={() => setStory(null)}
        />
      ) : null}
    </div>
  );
}
