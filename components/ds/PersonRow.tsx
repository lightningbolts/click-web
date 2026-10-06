import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";

/** Avatar 40 (presence) + name + subtitle + trailing action (spec §5.7). */
export function PersonRow({
  seed,
  name,
  src,
  subtitle,
  online,
  href,
  trailing,
  className,
}: {
  seed: string;
  name: string;
  src?: string | null;
  subtitle?: ReactNode;
  online?: boolean;
  href?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <Avatar seed={seed} name={name} src={src} size={40} presence={online} />
      <span className="min-w-0 flex-1">
        <span className="type-body-strong block truncate text-fg">{name}</span>
        {subtitle ? (
          <span className="type-meta block truncate text-fg-tertiary">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <div className={cn("flex min-h-16 items-center gap-3", className)}>
      {href ? (
        <Link
          href={href}
          className="-my-1 flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 hover:bg-hover"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
