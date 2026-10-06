import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** 64 px tinted circle, headline, one sentence, at most one button (spec §5.6). */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
  headingLevel: H = "h2",
}: {
  icon: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-4 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-selection text-accent">
        <Icon size={28} strokeWidth={1.75} aria-hidden />
      </span>
      <H className="type-headline mt-4 text-fg">{title}</H>
      {body ? (
        <p className="type-body mt-1 max-w-[44ch] text-fg-secondary">{body}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
