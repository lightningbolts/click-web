"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { Avatar } from "@/components/ds/Avatar";
import { cn } from "@/lib/cn";
import { postHomeAction } from "@/lib/home/postHomeAction";
import type { RecapPerson } from "@/lib/events/eventRecap";
import { threadHref } from "@/lib/shell/appNav";

export type RecapDrop = {
  id: string;
  user: { id: string; name: string; avatar_url: string | null };
  is_mine: boolean;
  width: number | null;
  height: number | null;
  preview_url: string | null;
  original_url: string | null;
};

/** Each photo stays up this long (spec §7.6.5, iOS EventRecapView). */
export const RECAP_SLIDE_MS = 4000;
const DEVELOP_BATCH = 50;

const chromeButton =
  "press hit-44 inline-flex size-9 shrink-0 items-center justify-center rounded-full material-glass-dark text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Records that the viewer opened these drops (developing again is idempotent). */
function recordDevelops(drops: RecapDrop[]) {
  const ids = drops.filter((d) => !d.is_mine).map((d) => d.id);
  for (let i = 0; i < ids.length; i += DEVELOP_BATCH) {
    const drops = ids.slice(i, i + DEVELOP_BATCH).map((id) => ({ kind: "event" as const, id }));
    void postHomeAction("/api/drops/develop", { drops }).catch(() => undefined);
  }
}

/**
 * Full-screen dark story viewer for an event's developed drops (spec §7.6.5): segmented progress,
 * the photo at --r-xl (your own ringed in accent), a caption capsule, auto-advance every 4 s.
 * Left third goes back, the rest goes forward; ←/→ step, Space pauses, Esc closes. When the
 * viewer Clicked with people at the event, a last slide lists them.
 */
export function EventRecapViewer({
  title,
  drops,
  people,
  closeHref,
}: {
  title: string;
  drops: RecapDrop[];
  people: RecapPerson[];
  closeHref: string;
}) {
  const router = useRouter();
  const slides = drops.length + (people.length > 0 ? 1 : 0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const closeRef = useRef<HTMLAnchorElement>(null);
  const atEnd = index === slides - 1;
  const drop = index < drops.length ? drops[index] : null;

  const go = useCallback((delta: number) => setIndex((i) => Math.min(slides - 1, Math.max(0, i + delta))), [slides]);
  const close = useCallback(() => router.push(closeHref), [router, closeHref]);

  useEffect(() => {
    recordDevelops(drops);
    closeRef.current?.focus();
  }, [drops]);

  // The last slide stays up; everything else advances on its own unless paused.
  useEffect(() => {
    if (paused || atEnd) return;
    const t = window.setTimeout(() => go(1), RECAP_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, atEnd, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") close();
      else if (e.key === " " && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) {
        e.preventDefault();
        setPaused((p) => !p);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, close]);

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    go(e.clientX - box.left < box.width / 3 ? -1 : 1);
  };

  const src = drop ? (drop.original_url ?? drop.preview_url) : null;
  const ratio = drop?.width && drop?.height ? drop.width / drop.height : 3 / 4;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} recap`}
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
      data-testid="event-recap-viewer"
    >
      <div className="flex flex-col gap-3 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <ol className="flex gap-1" aria-label={`Slide ${index + 1} of ${slides}`}>
          {Array.from({ length: slides }, (_, i) => (
            <li key={i} className="h-[3px] flex-1 overflow-hidden rounded-pill bg-white/30">
              <span
                key={i === index ? `${index}-${paused}` : undefined}
                className="block h-full origin-left rounded-pill bg-white"
                style={
                  i < index || (i === index && atEnd)
                    ? undefined
                    : i === index
                      ? {
                          animation: `recap-progress ${RECAP_SLIDE_MS}ms linear forwards`,
                          animationPlayState: paused ? "paused" : "running",
                        }
                      : { transform: "scaleX(0)" }
                }
              />
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-2">
          <h1 className="type-body-strong min-w-0 flex-1 truncate">{title}</h1>
          {!atEnd ? (
            <button type="button" className={chromeButton} aria-label={paused ? "Play" : "Pause"} onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
            </button>
          ) : null}
          <Link ref={closeRef} href={closeHref} className={chromeButton} aria-label="Close recap">
            <X size={18} aria-hidden />
          </Link>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        {drop ? (
          <div className="flex h-full cursor-pointer items-center justify-center" onClick={onTap} data-testid="recap-tap-zone">
            <div
              className={cn(
                "relative max-h-full max-w-full overflow-hidden rounded-xl bg-white/5",
                drop.is_mine && "ring-[3px] ring-accent",
              )}
              style={{ aspectRatio: ratio, height: ratio < 1 ? "100%" : undefined, width: ratio >= 1 ? "100%" : undefined }}
            >
              {src ? (
                <Image
                  src={src}
                  alt={drop.is_mine ? "Your drop" : `Drop by ${drop.user.name}`}
                  fill
                  sizes="(min-width: 768px) 720px, 100vw"
                  unoptimized
                  priority={index === 0}
                  className={cn("object-cover", src === drop.preview_url && "[image-rendering:pixelated]")}
                />
              ) : null}
              <span className="type-meta material-glass-dark absolute bottom-3 left-3 flex items-center gap-2 rounded-pill py-1 pl-1 pr-3 font-semibold">
                <Avatar seed={drop.user.id} name={drop.user.name} src={drop.user.avatar_url} size={24} ringColor="transparent" />
                {drop.is_mine ? "You" : drop.user.name}
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex h-full max-w-md flex-col justify-center" data-testid="recap-people">
            <h2 className="type-title-3 text-white">You Clicked with {people.length === 1 ? "1 person" : `${people.length} people`} here</h2>
            <ul className="mt-5 flex flex-col gap-1">
              {people.map((p) => (
                <li key={p.user_id}>
                  <Link
                    href={threadHref(p.connection_id)}
                    className="flex min-h-14 items-center gap-3 rounded-lg px-3 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <Avatar seed={p.user_id} name={p.name} src={p.avatar_url} size={40} ringColor="transparent" />
                    <span className="type-body-strong min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="type-meta text-white/70">Message</span>
                  </Link>
                </li>
              ))}
            </ul>
            {drops.length > 0 ? (
              <button type="button" onClick={() => setIndex(0)} className="type-body-strong mt-6 self-start text-white/80 hover:text-white">
                Watch again
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
