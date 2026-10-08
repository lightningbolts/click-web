import Link from "next/link";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { Avatar, AvatarStack } from "./Avatar";
import { CardVisual } from "./CardVisual";
import { Skeleton } from "./Skeleton";
import { StatusPill, type StatusPillVariant } from "./StatusPill";

export type EventRowPill = { label: string; variant: StatusPillVariant };

export type EventRowProps = {
  href: string;
  /** Raw event id: seeds the CardVisual. */
  id: string;
  title: string;
  /** Pre-formatted, e.g. "7:00 PM" or "Fri 7:00 PM". */
  timeLabel: string;
  live?: boolean;
  host?: { seed: string; name: string; src?: string | null } | null;
  location?: string | null;
  /** One more meta line under the location, e.g. "2 tickets · General". */
  detail?: ReactNode;
  pills?: readonly EventRowPill[];
  going?: {
    people: readonly {
      seed: string;
      name?: string | null;
      src?: string | null;
    }[];
    count: number;
  } | null;
  photoUrl?: string | null;
  className?: string;
  trailing?: ReactNode;
  /** 64 px thumbnail for dense lists (Home "Saved & upcoming"). */
  compact?: boolean;
  /** The one promoted event on a list: 160 px thumbnail from 640 px, `title-3` title. */
  featured?: boolean;
  /** Heading level for the title (lists under a day heading use h3). */
  headingLevel?: "h2" | "h3";
};

/** Event list card (spec §5.7). The whole card is the link. */
export function EventRow({
  href,
  id,
  title,
  timeLabel,
  live,
  host,
  location,
  detail,
  pills,
  going,
  photoUrl,
  className,
  compact,
  featured,
  headingLevel: H = "h3",
}: EventRowProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex gap-4 rounded-lg bg-surface p-4 transition-colors duration-[var(--d-fast)] dark:shadow-[inset_0_0_0_1px_var(--hairline)]",
        "hover:bg-[color-mix(in_srgb,var(--surface)_94%,var(--text)_6%)]",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="type-meta tabular flex items-center gap-2 text-fg-tertiary">
          {live ? <StatusPill variant="live">LIVE</StatusPill> : null}
          <span>{timeLabel}</span>
        </div>
        <H className={cn("mt-1 line-clamp-2 text-fg [text-wrap:balance]", featured ? "type-title-3" : "type-headline")}>{title}</H>
        {host ? (
          <div className="type-meta mt-1.5 flex items-center gap-1.5 text-fg-secondary">
            <Avatar
              seed={host.seed}
              name={host.name}
              src={host.src}
              size={20}
            />
            <span className="truncate">By {host.name}</span>
          </div>
        ) : null}
        {location ? (
          <div className="type-meta mt-1 flex items-center gap-1.5 text-fg-tertiary">
            <MapPin
              size={14}
              strokeWidth={2}
              aria-hidden
              className="shrink-0"
            />
            <span className="truncate">{location}</span>
          </div>
        ) : null}
        {detail ? <p className="type-meta tabular mt-1 truncate text-fg-secondary">{detail}</p> : null}
        {pills?.length || (going && going.count > 0) ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {pills?.map((p) => (
              <StatusPill key={p.label} variant={p.variant}>
                {p.label}
              </StatusPill>
            ))}
            {going && going.count > 0 ? (
              <span className="type-meta tabular flex items-center gap-1.5 text-fg-secondary">
                {going.people.length ? (
                  <AvatarStack
                    people={going.people}
                    total={going.count}
                    size={24}
                  />
                ) : null}
                {going.count} going
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <CardVisual
        seed={id}
        photoUrl={photoUrl}
        radius="md"
        sizes={compact ? "64px" : featured ? "(max-width: 640px) 96px, 160px" : "96px"}
        className={
          compact
            ? "size-16 shrink-0"
            : featured
              ? "size-24 shrink-0 sm:size-40"
              : "size-20 shrink-0 sm:size-24"
        }
      />
    </Link>
  );
}

/** Skeleton with EventRow's exact dimensions. */
export function EventRowSkeleton() {
  return (
    <div className="flex gap-4 rounded-lg bg-surface p-4" aria-hidden>
      <div className="min-w-0 flex-1">
        <Skeleton rounded="sm" className="h-3.5 w-16" />
        <Skeleton rounded="sm" className="mt-2 h-5 w-4/5" />
        <Skeleton rounded="sm" className="mt-2.5 h-3.5 w-32" />
        <Skeleton rounded="sm" className="mt-2 h-3.5 w-40" />
      </div>
      <Skeleton shimmer rounded="md" className="size-20 shrink-0 sm:size-24" />
    </div>
  );
}
