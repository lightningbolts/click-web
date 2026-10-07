import { Check, ChevronRight, QrCode } from "lucide-react";
import Link from "next/link";
import { eventPassPath } from "@/lib/events/eventUrls";
import { cn } from "@/lib/cn";

/** Once you're going: the way to your Click Pass (spec 06 §1, iOS `passCard`). */
export function EventPassLink({ beaconId, checkedIn }: { beaconId: string; checkedIn: boolean }) {
  return (
    <Link
      href={eventPassPath(beaconId)}
      className="mt-3 flex items-center gap-3 rounded-lg bg-fill-subtle p-3 transition-colors duration-[var(--d-fast)] hover:bg-fill-strong"
      data-testid="event-pass-link"
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-md",
          checkedIn ? "bg-online text-white" : "bg-action text-on-action",
        )}
      >
        {checkedIn ? <Check size={20} strokeWidth={2.5} aria-hidden /> : <QrCode size={20} strokeWidth={2} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="type-body-strong block text-fg">Your Click Pass</span>
        <span className="type-meta block text-fg-secondary">{checkedIn ? "You’re checked in" : "Show it at the door"}</span>
      </span>
      <ChevronRight size={16} strokeWidth={2} aria-hidden className="shrink-0 text-fg-tertiary" />
    </Link>
  );
}
