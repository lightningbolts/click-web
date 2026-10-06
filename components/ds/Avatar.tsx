"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { avatarFallbackColor, avatarInitials } from "@/lib/ui/avatarFallback";

export type AvatarSize = 20 | 24 | 32 | 40 | 48 | 56 | 72 | 96 | 120;

export type AvatarProps = {
  /** Stable id for the fallback color (user id / group id), same seed as iOS & Android. */
  seed: string | null | undefined;
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
  /** Online dot at the bottom-right. */
  presence?: boolean;
  /** 20 px surface circle at the bottom-right (e.g. a 12 px accent icon). */
  badge?: ReactNode;
  /** Color of the ring around the presence dot / stack overlap; defaults to `--surface`. */
  ringColor?: string;
  className?: string;
  /** Decorative avatars (next to a visible name) should be hidden from AT. */
  decorative?: boolean;
  priority?: boolean;
};

/** Person or group avatar (spec §5.3) with the cross-platform fallback palette. */
export function Avatar({
  seed,
  name,
  src,
  size = 40,
  presence,
  badge,
  ringColor = "var(--surface)",
  className,
  decorative = true,
  priority,
}: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const url = src?.trim() || null;
  const showImage = Boolean(url) && failedSrc !== url;
  const dot = Math.max(10, Math.round(size * 0.22));
  const fontSize = Math.max(10, Math.round(size * 0.36));

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : (name ?? undefined)}
      aria-hidden={decorative || undefined}
    >
      <span
        className="flex size-full items-center justify-center overflow-hidden rounded-full font-semibold text-white"
        style={{
          background: avatarFallbackColor(seed ?? name),
          fontSize,
          lineHeight: 1,
        }}
      >
        {showImage ? (
          <Image
            src={url!}
            alt=""
            width={size}
            height={size}
            sizes={`${size}px`}
            priority={priority}
            className="size-full object-cover"
            onError={() => setFailedSrc(url)}
          />
        ) : (
          <span aria-hidden>{avatarInitials(name)}</span>
        )}
      </span>
      {presence ? (
        <span
          aria-hidden
          className="absolute bottom-0 right-0 rounded-full bg-online"
          style={{
            width: dot,
            height: dot,
            boxShadow: `0 0 0 2px ${ringColor}`,
          }}
        />
      ) : null}
      {badge ? (
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-surface text-accent [&_svg]:size-3"
          style={{ boxShadow: `0 0 0 2px ${ringColor}` }}
        >
          {badge}
        </span>
      ) : null}
    </span>
  );
}

type Member = { seed: string; name?: string | null; src?: string | null };

/** Two member avatars at 0.7× (spec §5.3). Uses `src` when the group has its own image. */
export function GroupAvatar({
  seed,
  name,
  src,
  members,
  size = 40,
  ringColor = "var(--surface)",
  className,
}: {
  seed: string;
  name?: string | null;
  src?: string | null;
  members: readonly Member[];
  size?: AvatarSize;
  ringColor?: string;
  className?: string;
}) {
  if (src || members.length < 2) {
    return (
      <Avatar
        seed={seed}
        name={name}
        src={src ?? members[0]?.src}
        size={size}
        className={className}
      />
    );
  }
  const inner = Math.round(size * 0.7);
  const [a, b] = members;
  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="absolute left-0 top-0">
        <Avatar
          seed={a.seed}
          name={a.name}
          src={a.src}
          size={inner as AvatarSize}
        />
      </span>
      <span
        className="absolute bottom-0 right-0 rounded-full"
        style={{ boxShadow: `0 0 0 2px ${ringColor}` }}
      >
        <Avatar
          seed={b.seed}
          name={b.name}
          src={b.src}
          size={inner as AvatarSize}
        />
      </span>
    </span>
  );
}

/** Overlapping avatars, max 4 then a `+N` chip (spec §5.3). */
export function AvatarStack({
  people,
  size = 24,
  max = 4,
  total,
  ringColor = "var(--surface)",
  className,
}: {
  people: readonly Member[];
  size?: AvatarSize;
  max?: number;
  /** Total count when `people` is a sample. */
  total?: number;
  ringColor?: string;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const extra = Math.max(0, (total ?? people.length) - shown.length);
  const overlap = Math.round(size * 0.25);
  return (
    <span className={cn("inline-flex items-center", className)} aria-hidden>
      {shown.map((p, i) => (
        <span
          key={p.seed}
          className="rounded-full"
          style={{
            marginLeft: i === 0 ? 0 : -overlap,
            boxShadow: `0 0 0 2px ${ringColor}`,
            zIndex: shown.length - i,
          }}
        >
          <Avatar seed={p.seed} name={p.name} src={p.src} size={size} />
        </span>
      ))}
      {extra > 0 ? (
        <span
          className="type-badge tabular inline-flex items-center justify-center rounded-pill bg-fill-subtle px-1.5 text-fg-secondary"
          style={{
            height: size,
            minWidth: size,
            marginLeft: -overlap,
            boxShadow: `0 0 0 2px ${ringColor}`,
          }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
