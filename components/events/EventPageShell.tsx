import type { ReactNode } from "react";
import { FcPageShell } from "@/components/fc";
import EventPageEnter from "@/components/events/EventPageEnter";
import { PAGE_COLUMN_CLASS } from "@/lib/shell/pageColumn";
import { cn } from "@/lib/cn";

/**
 * Shared column for every public event route. Matches Navbar, dashboard, and chat (`max-w-6xl`).
 */
export default function EventPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <FcPageShell className={className}>
      <div data-testid="event-page-shell" className={cn(PAGE_COLUMN_CLASS)}>
        <EventPageEnter>{children}</EventPageEnter>
      </div>
    </FcPageShell>
  );
}
