import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** `title-3` section heading with optional subtitle and "See all ›" / action (spec §4.3, §5.4). */
export function SectionHeader({
  title,
  subtitle,
  href,
  linkLabel = "See all",
  action,
  as: Tag = "h2",
  id,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  href?: string;
  linkLabel?: string;
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <Tag id={id} className="type-title-3 text-fg">
          {title}
        </Tag>
        {subtitle ? (
          <p className="type-body mt-0.5 text-fg-secondary">{subtitle}</p>
        ) : null}
      </div>
      {action ??
        (href ? (
          <Link
            href={href}
            className="type-meta inline-flex shrink-0 items-center font-semibold text-accent hover:underline"
          >
            {linkLabel}
            <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
          </Link>
        ) : null)}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-hairline", className)} />;
}
