import EventPageShell from "@/components/events/EventPageShell";
import { FcCard } from "@/components/fc";
export default function Loading() {
  return (
    <EventPageShell className="py-10">
      <FcCard className="space-y-4 p-6" aria-busy="true">
        <p role="status">Loading…</p>
        <div className="h-24 border-2 border-border-hard bg-surface-container" />
      </FcCard>
    </EventPageShell>
  );
}
