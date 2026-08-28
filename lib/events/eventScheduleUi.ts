export type EventClock12h = {
  hour12: number;
  minute: number;
  isPm: boolean;
};

export function eventClock12hFrom24h(hour24: number, minute: number): EventClock12h {
  const h = Math.min(23, Math.max(0, Math.trunc(hour24)));
  const m = Math.min(59, Math.max(0, Math.trunc(minute)));
  const isPm = h >= 12;
  const mod = h % 12;
  return { hour12: mod === 0 ? 12 : mod, minute: m, isPm };
}

export function eventClock12hTo24h(clock: EventClock12h): { hour: number; minute: number } {
  const hour24 =
    clock.hour12 === 12 && !clock.isPm
      ? 0
      : clock.hour12 === 12 && clock.isPm
        ? 12
        : clock.isPm
          ? clock.hour12 + 12
          : clock.hour12;
  return { hour: hour24, minute: Math.min(59, Math.max(0, clock.minute)) };
}

export function formatEventClockLabel(hour: number, minute: number): string {
  const clock = eventClock12hFrom24h(hour, minute);
  const period = clock.isPm ? "PM" : "AM";
  return `${clock.hour12}:${String(clock.minute).padStart(2, "0")} ${period}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function mergeLocalDateWithClock(dateValue: string, hour: number, minute: number): Date {
  const [year, month, day] = dateValue.split("-").map((part) => Number(part));
  const next = new Date();
  next.setFullYear(year || next.getFullYear(), (month || 1) - 1, day || 1);
  next.setHours(Math.min(23, Math.max(0, hour)), Math.min(59, Math.max(0, minute)), 0, 0);
  return next;
}

export function coerceSameDayEventTimes(
  editingStart: boolean,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): { start: { hour: number; minute: number }; end: { hour: number; minute: number } } {
  let start = Math.min(23, Math.max(0, startHour)) * 60 + Math.min(59, Math.max(0, startMinute));
  let end = Math.min(23, Math.max(0, endHour)) * 60 + Math.min(59, Math.max(0, endMinute));
  if (end <= start) {
    if (editingStart) {
      start = Math.max(0, end - 1);
    } else {
      end = Math.min(24 * 60 - 1, start + 1);
    }
  }
  return {
    start: { hour: Math.floor(start / 60), minute: start % 60 },
    end: { hour: Math.floor(end / 60), minute: end % 60 },
  };
}

export function resolvedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function defaultEventWindow(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { start, end };
}

export function formatTimeZoneChip(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    return name ? `${name} · ${timeZone.replace(/_/g, " ")}` : timeZone.replace(/_/g, " ");
  } catch {
    return timeZone;
  }
}
