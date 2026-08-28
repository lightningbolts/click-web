"use client";

import { FcInput } from "@/components/fc";
import {
  coerceSameDayEventTimes,
  eventClock12hFrom24h,
  eventClock12hTo24h,
  formatTimeZoneChip,
  mergeLocalDateWithClock,
  toDateInputValue,
  type EventClock12h,
} from "@/lib/events/eventScheduleUi";

type Slot = {
  date: string;
  clock: EventClock12h;
};

function hours(): number[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

function minutes(): number[] {
  return [0, 15, 30, 45];
}

function SlotRow({
  label,
  slot,
  onChange,
}: {
  label: string;
  slot: Slot;
  onChange: (next: Slot) => void;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <p className="text-sm font-semibold text-on-surface">{label}</p>
      <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.8fr))] gap-2">
        <FcInput
          type="date"
          value={slot.date}
          onChange={(e) => onChange({ ...slot, date: e.target.value })}
          required
        />
        <select
          aria-label={`${label} hour`}
          className="fc-input min-h-11 w-full px-2 py-2.5"
          value={slot.clock.hour12}
          onChange={(e) =>
            onChange({ ...slot, clock: { ...slot.clock, hour12: Number(e.target.value) } })
          }
        >
          {hours().map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} minute`}
          className="fc-input min-h-11 w-full px-2 py-2.5"
          value={slot.clock.minute}
          onChange={(e) =>
            onChange({ ...slot, clock: { ...slot.clock, minute: Number(e.target.value) } })
          }
        >
          {minutes().map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} period`}
          className="fc-input min-h-11 w-full px-2 py-2.5"
          value={slot.clock.isPm ? "pm" : "am"}
          onChange={(e) =>
            onChange({ ...slot, clock: { ...slot.clock, isPm: e.target.value === "pm" } })
          }
        >
          <option value="am">AM</option>
          <option value="pm">PM</option>
        </select>
      </div>
    </div>
  );
}

export default function EventDateTimeFields({
  start,
  end,
  timeZone,
  onStartChange,
  onEndChange,
}: {
  start: Date;
  end: Date;
  timeZone: string;
  onStartChange: (next: Date) => void;
  onEndChange: (next: Date) => void;
}) {
  const startSlot: Slot = {
    date: toDateInputValue(start),
    clock: eventClock12hFrom24h(start.getHours(), start.getMinutes()),
  };
  const endSlot: Slot = {
    date: toDateInputValue(end),
    clock: eventClock12hFrom24h(end.getHours(), end.getMinutes()),
  };

  const apply = (nextStart: Slot, nextEnd: Slot, editingStart: boolean) => {
    const start24 = eventClock12hTo24h(nextStart.clock);
    const end24 = eventClock12hTo24h(nextEnd.clock);
    const sameDay = nextStart.date === nextEnd.date;
    const coerced = sameDay
      ? coerceSameDayEventTimes(
          editingStart,
          start24.hour,
          start24.minute,
          end24.hour,
          end24.minute,
        )
      : {
          start: start24,
          end: end24,
        };
    onStartChange(mergeLocalDateWithClock(nextStart.date, coerced.start.hour, coerced.start.minute));
    onEndChange(mergeLocalDateWithClock(nextEnd.date, coerced.end.hour, coerced.end.minute));
  };

  return (
    <div className="space-y-3" data-testid="event-datetime-fields">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <SlotRow
          label="Starts"
          slot={startSlot}
          onChange={(next) => apply(next, endSlot, true)}
        />
        <div className="hidden w-px self-stretch bg-border-hard sm:block" aria-hidden />
        <SlotRow
          label="Ends"
          slot={endSlot}
          onChange={(next) => apply(startSlot, next, false)}
        />
      </div>
      <p className="inline-flex rounded-full border border-border-hard bg-surface-container-low px-3 py-1 text-xs font-semibold text-on-surface-variant">
        {formatTimeZoneChip(timeZone)}
      </p>
      <input type="hidden" name="event_start_at" value={start.toISOString()} />
      <input type="hidden" name="event_end_at" value={end.toISOString()} />
    </div>
  );
}
