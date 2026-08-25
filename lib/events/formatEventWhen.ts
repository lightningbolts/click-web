function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function zoneOptions(timeZone?: string | null): Intl.DateTimeFormatOptions {
  if (timeZone && isValidTimeZone(timeZone)) {
    return { timeZone, timeZoneName: "short" };
  }
  return {};
}

export function formatEventWhen(
  startIso: string | null,
  endIso: string | null,
  timeZone?: string | null,
): string | null {
  if (!startIso) return null;
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return null;
  const zone = zoneOptions(timeZone);
  const startLabel = new Date(startMs).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...zone,
  });
  if (!endIso) return startLabel;
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(endMs)) return startLabel;
  const endLabel = new Date(endMs).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...zone,
  });
  return `${startLabel} – ${endLabel}`;
}

export function formatEventPostedAt(createdAtIso: string | null): string | null {
  if (!createdAtIso) return null;
  const ms = Date.parse(createdAtIso);
  if (!Number.isFinite(ms)) return null;
  return `Posted ${new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
