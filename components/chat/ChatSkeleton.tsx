import { Skeleton } from '@/components/ds/Skeleton';
import { ChatBackground } from './ChatBackground';

/**
 * A loading thread's bubbles, bottom-aligned like the messages that replace them. Invisible for
 * the first 150 ms (`route-loading`), so a thread that loads quickly never flashes them.
 */
export function ThreadSkeleton() {
  return (
    <div aria-busy aria-label="Loading messages" className="route-loading flex flex-1 flex-col justify-end gap-2 py-4">
      <Skeleton className="h-9 w-48 rounded-bubble" />
      <Skeleton className="ml-auto h-9 w-40 rounded-bubble" />
      <Skeleton className="h-14 w-64 rounded-bubble" />
      <Skeleton className="ml-auto h-9 w-56 rounded-bubble" />
    </div>
  );
}

/**
 * A conversation whose data isn't known yet (a cold load of a thread URL): `ChatView`'s frame —
 * backdrop, 64 px header, thread, composer — at its exact sizes and seed, so mounting the real
 * thread swaps content in place instead of moving anything.
 */
export function ChatSkeleton({ seed }: { seed: string }) {
  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      <ChatBackground seed={seed} />
      <div className="material-glass relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-hairline px-3 pt-[env(safe-area-inset-top,0px)] md:px-4">
        {/* The back button's slot (36 + 8) on phones. */}
        <Skeleton rounded="full" className="size-10 shrink-0 max-md:ml-11" />
        <span className="flex flex-col gap-1.5">
          <Skeleton rounded="sm" className="h-3.5 w-32" />
          <Skeleton rounded="sm" className="h-3 w-20" />
        </span>
      </div>
      <div className="chat-thread-scroll relative min-h-0 flex-1">
        <div className="mx-auto flex h-full max-w-[720px] flex-col px-3 pb-3 pt-4 md:px-6">
          <ThreadSkeleton />
        </div>
      </div>
      <div className="relative z-20 mx-auto flex w-full max-w-[720px] shrink-0 items-end gap-2 px-4 pb-4 pt-3">
        <Skeleton rounded="full" className="size-10 shrink-0" />
        <Skeleton rounded="lg" className="h-11 min-w-0 flex-1" />
        <Skeleton rounded="full" className="size-10 shrink-0" />
      </div>
    </div>
  );
}
