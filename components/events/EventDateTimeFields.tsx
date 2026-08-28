"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  coerceSameDayEventTimes,
  eventClock12hFrom24h,
  eventClock12hTo24h,
  formatEventClockLabel,
  formatTimeZoneChip,
  mergeLocalDateWithClock,
  toDateInputValue,
  type EventClock12h,
} from "@/lib/events/eventScheduleUi";

type Slot = {
  date: string;
  clock: EventClock12h;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function hours(): number[] {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

function minutes(): number[] {
  return [0, 15, 30, 45];
}

function parseDateValue(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return {
    year: year || new Date().getFullYear(),
    month: month || 1,
    day: day || 1,
  };
}

function formatDisplayDate(value: string): string {
  const { year, month, day } = parseDateValue(value);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatSlotDisplay(slot: Slot): string {
  const { hour, minute } = eventClock12hTo24h(slot.clock);
  return `${formatDisplayDate(slot.date)} · ${formatEventClockLabel(hour, minute)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function calendarCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const total = daysInMonth(year, month);
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let day = 1; day <= total; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function Stepper({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | string;
  options: Array<number | string>;
  onChange: (next: number | string) => void;
}) {
  const index = options.indexOf(value);
  const prev = () => onChange(options[(index - 1 + options.length) % options.length]);
  const next = () => onChange(options[(index + 1) % options.length]);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
      <div className="flex items-center rounded-[8px] border border-border-hard bg-surface">
        <button
          type="button"
          onClick={prev}
          aria-label={`Decrease ${label}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-on-surface-variant hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <span className="flex-1 text-center text-sm font-semibold text-on-surface" aria-live="polite">
          {typeof value === "number" && label === "Minute"
            ? String(value).padStart(2, "0")
            : String(value)}
        </span>
        <button
          type="button"
          onClick={next}
          aria-label={`Increase ${label}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-on-surface-variant hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SchedulePopover({
  label,
  slot,
  open,
  onOpenChange,
  onChange,
}: {
  label: string;
  slot: Slot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: Slot) => void;
}) {
  const triggerId = useId();
  const popoverId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const { year, month, day } = parseDateValue(slot.date);
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);

  useEffect(() => {
    if (open) {
      const parsed = parseDateValue(slot.date);
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [open, slot.date]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const selectDay = (nextDay: number) => {
    const nextDate = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
    onChange({ ...slot, date: nextDate });
  };

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(viewYear, viewMonth - 1, 1),
  );

  return (
    <div className="relative min-w-0 flex-1" ref={wrapRef}>
      <p className="mb-1.5 text-sm font-semibold text-on-surface">{label}</p>
      <button
        id={triggerId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`${label} date and time`}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "flex w-full min-h-11 items-center justify-between rounded-[8px] border border-border-hard bg-surface px-3 py-2.5 text-left text-sm font-medium text-on-surface",
          "hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <span className="truncate">{formatSlotDisplay(slot)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
      </button>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={triggerId}
          className="absolute left-0 right-0 z-30 mt-1 rounded-[16px] border border-border-hard bg-surface p-4 shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => {
                if (viewMonth === 1) {
                  setViewMonth(12);
                  setViewYear(viewYear - 1);
                } else {
                  setViewMonth(viewMonth - 1);
                }
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-on-surface-variant hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-on-surface">{monthLabel}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => {
                if (viewMonth === 12) {
                  setViewMonth(1);
                  setViewYear(viewYear + 1);
                } else {
                  setViewMonth(viewMonth + 1);
                }
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-on-surface-variant hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-on-surface-variant">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="mb-4 grid grid-cols-7 gap-1">
            {calendarCells(viewYear, viewMonth).map((cellDay, index) => {
              if (cellDay == null) {
                return <span key={`empty-${index}`} aria-hidden />;
              }
              const selected =
                cellDay === day && viewMonth === month && viewYear === year;
              return (
                <button
                  key={`${viewYear}-${viewMonth}-${cellDay}`}
                  type="button"
                  onClick={() => selectDay(cellDay)}
                  aria-label={new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  }).format(new Date(viewYear, viewMonth - 1, cellDay))}
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex h-9 w-full items-center justify-center rounded-full text-sm font-medium",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    selected
                      ? "bg-primary text-on-primary"
                      : "text-on-surface hover:bg-surface-container-low",
                  )}
                >
                  {cellDay}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 border-t border-border-hard pt-4">
            <Stepper
              label="Hour"
              value={slot.clock.hour12}
              options={hours()}
              onChange={(next) =>
                onChange({
                  ...slot,
                  clock: { ...slot.clock, hour12: Number(next) },
                })
              }
            />
            <Stepper
              label="Minute"
              value={slot.clock.minute}
              options={minutes()}
              onChange={(next) =>
                onChange({
                  ...slot,
                  clock: { ...slot.clock, minute: Number(next) },
                })
              }
            />
            <Stepper
              label="Period"
              value={slot.clock.isPm ? "PM" : "AM"}
              options={["AM", "PM"]}
              onChange={(next) =>
                onChange({
                  ...slot,
                  clock: { ...slot.clock, isPm: next === "PM" },
                })
              }
            />
          </div>
        </div>
      ) : null}
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
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <SchedulePopover
          label="Starts"
          slot={startSlot}
          open={startOpen}
          onOpenChange={(open) => {
            setStartOpen(open);
            if (open) setEndOpen(false);
          }}
          onChange={(next) => apply(next, endSlot, true)}
        />
        <div className="hidden w-px self-stretch bg-border-hard sm:block" aria-hidden />
        <SchedulePopover
          label="Ends"
          slot={endSlot}
          open={endOpen}
          onOpenChange={(open) => {
            setEndOpen(open);
            if (open) setStartOpen(false);
          }}
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
