"use client";

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

/**
 * Weekly hours as people think of them: each day open or closed, with one or more time ranges.
 * A close at or before the open runs past midnight (a bar open 18:00–02:00).
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
    <div className="space-y-2">
      {WEEKDAYS.map((day) => {
        const intervals = value[day];
        const open = Boolean(intervals && intervals.length > 0);
        return (
          <div key={day} className="flex flex-wrap items-center gap-3 rounded-[8px] border border-border-hard/30 px-3 py-2">
            <label className="flex w-36 items-center gap-2 text-sm font-semibold text-on-surface">
              <input
                type="checkbox"
                checked={open}
                disabled={disabled}
                onChange={(e) => setDay(day, e.target.checked ? [DEFAULT_INTERVAL] : undefined)}
              />
              {DAY_LABELS[day]}
            </label>
            {open ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {intervals!.map(([start, end], i) => (
                  <span key={i} className="flex items-center gap-1 text-sm">
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[day]} opens`}
                      value={start}
                      disabled={disabled}
                      onChange={(e) => setDay(day, intervals!.map((iv, j) => (j === i ? [e.target.value, iv[1]] : iv)))}
                      className="rounded-[6px] border border-border-hard/40 bg-surface px-2 py-1"
                    />
                    <span aria-hidden>–</span>
                    <input
                      type="time"
                      aria-label={`${DAY_LABELS[day]} closes`}
                      value={end}
                      disabled={disabled}
                      onChange={(e) => setDay(day, intervals!.map((iv, j) => (j === i ? [iv[0], e.target.value] : iv)))}
                      className="rounded-[6px] border border-border-hard/40 bg-surface px-2 py-1"
                    />
                    {intervals!.length > 1 ? (
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`Remove ${DAY_LABELS[day]} time range`}
                        onClick={() => setDay(day, intervals!.filter((_, j) => j !== i))}
                        className="px-1 text-on-surface-variant hover:text-on-surface"
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
                {intervals!.length < 6 ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setDay(day, [...intervals!, ["18:00", "22:00"]])}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    + Add hours
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => copyToAll(day)}
                  className="text-xs font-semibold text-on-surface-variant hover:underline"
                >
                  Copy to every day
                </button>
              </div>
            ) : (
              <span className="text-sm text-on-surface-variant">Closed</span>
            )}
          </div>
        );
      })}
      <p className="text-xs text-on-surface-variant">
        Times are local to your Place. A closing time earlier than the opening time runs past midnight.
      </p>
    </div>
  );
}
