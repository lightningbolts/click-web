"use client";

import { ConnectionPeerAvatar } from "@/components/dashboard/ConnectionPeerAvatar";
import { cn } from "@/lib/cn";

export type AvatarStackItem = {
  id?: string;
  label: string;
  imageUrl?: string | null;
};

export type AvatarStackProps = {
  items: AvatarStackItem[];
  count?: number;
  label?: string;
  maxVisible?: number;
  showOverflow?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
};

export function AvatarStack({
  items,
  count,
  label,
  maxVisible = 5,
  showOverflow = true,
  size = "sm",
  className,
  onClick,
}: AvatarStackProps) {
  const shown = items.slice(0, maxVisible);
  const overflow = Math.max(0, (count ?? items.length) - shown.length);
  const displayCount = count ?? items.length;

  const avatars = (
    <>
      {shown.length > 0 ? (
        <span className="flex -space-x-2" aria-hidden>
          {shown.map((item, index) => (
            <ConnectionPeerAvatar
              key={item.id || `${item.label}-${index}`}
              label={item.label}
              imageUrl={item.imageUrl}
              size={size}
              className="ring-2 ring-surface"
            />
          ))}
          {showOverflow && overflow > 0 ? (
            <span
              className={cn(
                "flex items-center justify-center rounded-full bg-surface-container-high font-semibold text-on-surface-variant ring-2 ring-surface",
                size === "sm" && "h-8 w-8 min-h-8 min-w-8 text-xs",
                size === "md" && "h-10 w-10 min-h-10 min-w-10 text-sm",
                size === "lg" && "h-11 w-11 min-h-11 min-w-11 text-sm",
              )}
            >
              +{overflow}
            </span>
          ) : null}
        </span>
      ) : null}
      {label ? <span>{label}</span> : displayCount > 0 ? <span>{displayCount}</span> : null}
    </>
  );

  const rootClass = cn("inline-flex items-center gap-2 text-sm font-semibold text-primary", className);

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(rootClass, "hover:underline")}>
        {avatars}
      </button>
    );
  }

  return <span className={rootClass}>{avatars}</span>;
}
