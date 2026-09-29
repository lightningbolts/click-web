"use client";

import { FcInput } from "@/components/fc";
import { Pill } from "@/components/ui/Pill";
import {
  EVENT_RECURRENCE_FREQUENCIES,
  EVENT_RECURRENCE_LABELS,
  MAX_EVENT_OCCURRENCES,
  MIN_EVENT_OCCURRENCES,
  type EventRecurrenceFrequency,
} from "@/lib/events/eventRecurrence";

/** Create-only: a repeating event becomes one event per occurrence, created together. */
export default function EventRepeatFields({
  frequency,
  count,
  onFrequency,
  onCount,
}: {
  frequency: EventRecurrenceFrequency | null;
  count: string;
  onFrequency: (value: EventRecurrenceFrequency | null) => void;
  onCount: (value: string) => void;
}) {
  return (
    <section className="space-y-3" data-testid="event-repeat">
      <p className="text-sm font-semibold text-on-surface">Repeats</p>
      <div className="flex flex-wrap gap-2">
        <Pill selected={frequency == null} onClick={() => onFrequency(null)}>
          Does not repeat
        </Pill>
        {EVENT_RECURRENCE_FREQUENCIES.map((option) => (
          <Pill key={option} selected={frequency === option} onClick={() => onFrequency(option)}>
            {EVENT_RECURRENCE_LABELS[option]}
          </Pill>
        ))}
      </div>
      {frequency != null ? (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <FcInput
              type="number"
              min={MIN_EVENT_OCCURRENCES}
              max={MAX_EVENT_OCCURRENCES}
              inputMode="numeric"
              className="w-24"
              value={count}
              onChange={(e) => onCount(e.target.value)}
              aria-label="Number of occurrences"
            />
            events in total
          </label>
          <p className="text-xs text-on-surface-variant">
            Each date gets its own event page, RSVPs, and chat. {MIN_EVENT_OCCURRENCES}–
            {MAX_EVENT_OCCURRENCES} events.
          </p>
        </div>
      ) : null}
    </section>
  );
}
