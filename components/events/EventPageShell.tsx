import type { ReactNode } from "react";
import { FcPageShell } from "@/components/fc";
import { cn } from "@/lib/cn";

/**
 * Shared column for every public event route. Matches Navbar/Footer `max-w-6xl`
 * and Navbar horizontal padding so list / create / detail / manage line up.
 */
export default function EventPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <FcPageShell className={cn("px-4 md:px-10", className)}>
      <div data-testid="event-page-shell" className="mx-auto w-full max-w-6xl">
        {children}
      </div>
    </FcPageShell>
  );
}
