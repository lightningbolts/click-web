"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { IconButton } from "@/components/ds/IconButton";
import { Toggle } from "@/components/ds/Toggle";
import { WEEKDAYS } from "@/lib/places/hours";
import type { PlaceHours, Weekday } from "@/lib/places/types";

const DAY_LABELS: Record<Weekday, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const DEFAULT_INTERVAL: [string, string] = ["09:00", "17:00"];
const timeCls =
  "type-body tabular h-9 rounded-sm bg-surface-raised px-2 text-fg outline-none focus:bg-surface focus:shadow-[0_0_0_2px_var(--accent)] disabled:opacity-40";

/**
 * Weekly hours as people think of them (spec §9.5 Profile): each day open or closed, with one or
 * more time ranges. A close at or before the open runs past midnight (a bar open 18:00–02:00).
 */
export default function PlaceHoursEditor({
  value,
  onChange,
  disabled,
}: {
  value: PlaceHours;
  onChange: (next: PlaceHours) => void;
  disabled?: boolean;
}) {
  const setDay = (day: Weekday, intervals: Array<[string, string]> | undefined) => {
    const next = { ...value };
    if (intervals && intervals.length > 0) next[day] = intervals;
    else delete next[day];
    onChange(next);
  };

  const copyToAll = (day: Weekday) => {
    const source = value[day];
    if (!source) return;
    const next: PlaceHours = {};
    for (const d of WEEKDAYS) next[d] = source.map(([a, b]) => [a, b] as [string, string]);
    onChange(next);
  };

  return (
    <div>
      <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
        {WEEKDAYS.map((day) => {
          const intervals = value[day];
          const open = Boolean(intervals && intervals.length > 0);
          return (
            <li key={day} className="flex flex-wrap items-center gap-3 px-4 py-2.5 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
              <span className="flex w-40 items-center gap-3">
                <Toggle
                  checked={open}
                  disabled={disabled}
                  onCheckedChange={(on) => setDay(day, on ? [DEFAULT_INTERVAL] : undefined)}
                  aria-label={`${DAY_LABELS[day]} open`}
                />
                <span className="type-body-strong text-fg">{DAY_LABELS[day]}</span>
              </span>
              {open ? (
                <span className="flex flex-1 flex-wrap items-center gap-2">
                  {intervals!.map(([start, end], i) => (
                    <span key={i} className="flex items-center gap-1">
                      <input
                        type="time"
                        aria-label={`${DAY_LABELS[day]} opens`}
                        value={start}
                        disabled={disabled}
                        onChange={(e) => setDay(day, intervals!.map((iv, j) => (j === i ? [e.target.value, iv[1]] : iv)))}
                        className={timeCls}
                      />
                      <span aria-hidden className="text-fg-tertiary">
                        –
                      </span>
                      <input
                        type="time"
                        aria-label={`${DAY_LABELS[day]} closes`}
                        value={end}
                        disabled={disabled}
                        onChange={(e) => setDay(day, intervals!.map((iv, j) => (j === i ? [iv[0], e.target.value] : iv)))}
                        className={timeCls}
                      />
                      {intervals!.length > 1 ? (
                        <IconButton
                          icon={X}
                          size="sm"
                          disabled={disabled}
                          aria-label={`Remove ${DAY_LABELS[day]} time range`}
                          onClick={() => setDay(day, intervals!.filter((_, j) => j !== i))}
                        />
                      ) : null}
                    </span>
                  ))}
                  {intervals!.length < 6 ? (
                    <Button size="sm" variant="plain" icon={Plus} disabled={disabled} onClick={() => setDay(day, [...intervals!, ["18:00", "22:00"]])}>
                      Add hours
                    </Button>
                  ) : null}
                  <Button size="sm" variant="plain" className="text-fg-secondary" disabled={disabled} onClick={() => copyToAll(day)}>
                    Copy to every day
                  </Button>
                </span>
              ) : (
                <span className="type-body text-fg-tertiary">Closed</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="type-meta mt-2 px-4 text-fg-tertiary">
        Local to your Place. A closing time earlier than the opening time runs past midnight.
      </p>
    </div>
  );
}
